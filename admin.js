/* ============================================================================
   admin.js — Apex Admin panel controller
   ----------------------------------------------------------------------------
   Sections:
     1. Boot / auth gate
     2. Login
     3. Session + 30-minute inactivity auto-logout
     4. Dashboard section routing
     5. Content Editor (iframe scan, selection, side panel, pending state,
        undo, apply, cancel)
   All persistence goes through window.AdminStore (see admin-store.js).
   ============================================================================ */
(function () {
  'use strict';

  const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30-minute inactivity window

  // ── Elements ──
  const loginView   = document.getElementById('loginView');
  const dashView    = document.getElementById('dashView');
  const loginForm   = document.getElementById('loginForm');
  const loginUser   = document.getElementById('loginUser');
  const loginPass   = document.getElementById('loginPass');
  const loginError  = document.getElementById('loginError');
  const loginNotice = document.getElementById('loginNotice');
  const logoutBtn   = document.getElementById('logoutBtn');
  const topbarUser  = document.getElementById('topbarUser');
  const navList     = document.getElementById('navList');
  const toastEl     = document.getElementById('toast');

  /* ========================================================================
     1. BOOT
     ===================================================================== */
  async function boot() {
    const session = await AdminStore.getSession();
    if (session && !isExpired(session)) {
      enterDashboard();
    } else {
      if (session) {
        await AdminStore.clearSession(); // stale
        showLoginNotice('Session expired due to inactivity. Please sign in again.');
      }
      showLogin();
    }
  }

  function isExpired(session) {
    return (Date.now() - (session.lastActivity || 0)) > SESSION_TIMEOUT_MS;
  }

  /* ========================================================================
     2. LOGIN
     ===================================================================== */
  function showLogin() {
    stopSessionWatch();
    dashView.hidden = true;
    loginView.hidden = false;
    loginError.hidden = true;
    loginPass.value = '';
    loginUser.focus();
  }
  function showLoginNotice(msg) {
    loginNotice.textContent = msg;
    loginNotice.hidden = false;
  }

  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    loginError.hidden = true;
    loginNotice.hidden = true;
    const session = await AdminStore.login(loginUser.value.trim(), loginPass.value);
    if (session) {
      enterDashboard();
    } else {
      loginError.hidden = false;
      loginPass.value = '';
      loginPass.focus();
    }
  });

  /* ========================================================================
     3. SESSION + INACTIVITY AUTO-LOGOUT
     ===================================================================== */
  let sessionTimer = null;
  let lastPersist = 0;

  function enterDashboard() {
    loginView.hidden = true;
    loginNotice.hidden = true;
    dashView.hidden = false;
    topbarUser.textContent = 'admin';
    startSessionWatch();
    setActiveView(currentView || 'content');
    initEditor();
  }

  async function doLogout(reason) {
    await AdminStore.clearSession();
    teardownEditor();
    if (reason) showLoginNotice(reason);
    showLogin();
  }

  // Reset the inactivity timer on user activity. Persisting to the store is
  // throttled so we don't write on every mousemove/keypress.
  function registerActivity() {
    const now = Date.now();
    if (now - lastPersist > 5000) {
      lastPersist = now;
      AdminStore.touchSession();
    }
  }

  // Re-check expiry whenever the tab regains focus/visibility. iOS Safari
  // throttles or pauses setInterval in backgrounded tabs, so the 15s poll
  // alone can miss the 30-minute timeout — this catches it on return.
  function checkSessionExpiry() {
    AdminStore.getSession().then(function (s) {
      if (!s || isExpired(s)) {
        if (sessionTimer) { clearInterval(sessionTimer); sessionTimer = null; }
        doLogout('Session expired due to inactivity. Please sign in again.');
      }
    });
  }
  function onVisibility() { if (document.visibilityState === 'visible') checkSessionExpiry(); }

  function startSessionWatch() {
    document.addEventListener('click', registerActivity, true);
    document.addEventListener('keydown', registerActivity, true);
    document.addEventListener('mousemove', registerActivity, true);
    document.addEventListener('touchstart', registerActivity, true);   // iOS taps
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', checkSessionExpiry);
    // Poll for expiry independent of activity.
    sessionTimer = setInterval(checkSessionExpiry, 15000);
  }
  function stopSessionWatch() {
    document.removeEventListener('click', registerActivity, true);
    document.removeEventListener('keydown', registerActivity, true);
    document.removeEventListener('mousemove', registerActivity, true);
    document.removeEventListener('touchstart', registerActivity, true);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('focus', checkSessionExpiry);
    if (sessionTimer) { clearInterval(sessionTimer); sessionTimer = null; }
  }

  logoutBtn.addEventListener('click', function () { doLogout(); });

  /* ========================================================================
     4. SECTION ROUTING
     ===================================================================== */
  let currentView = 'content';

  navList.addEventListener('click', function (e) {
    const btn = e.target.closest('.nav-item');
    if (!btn) return;
    setActiveView(btn.dataset.view);
    closeSidebar(); // collapse the mobile drawer after navigating
  });

  function setActiveView(view) {
    currentView = view;
    navList.querySelectorAll('.nav-item').forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.view === view);
    });
    document.querySelectorAll('.main .view').forEach(function (sec) {
      sec.hidden = sec.dataset.view !== view;
    });
    if (view === 'business') loadBusiness();
    if (view === 'reviews') loadReviews();
    if (view === 'versions') loadVersions();
  }

  /* ========================================================================
     5. CONTENT EDITOR
     ===================================================================== */
  const frame        = document.getElementById('siteFrame');
  const editPanel    = document.getElementById('editPanel');
  const editPanelTitle = document.getElementById('editPanelTitle');
  const editPanelPath  = document.getElementById('editPanelPath');
  const editPanelClose = document.getElementById('editPanelClose');
  const editPanelGrip  = document.getElementById('editPanelGrip');
  const elAcceptBtn = document.getElementById('elAcceptBtn');
  const elRevertBtn = document.getElementById('elRevertBtn');
  const elUndoBtn   = document.getElementById('elUndoBtn');
  const editTextBlock  = document.getElementById('editText');
  const editTextInput  = document.getElementById('editTextInput');
  const editImageBlock = document.getElementById('editImage');
  const editImageFile  = document.getElementById('editImageFile');
  const editImageUrl   = document.getElementById('editImageUrl');
  const editImagePreview = document.getElementById('editImagePreview');
  const undoBtn   = document.getElementById('undoBtn');
  const applyBtn  = document.getElementById('applyBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const dirtyFlag = document.getElementById('dirtyFlag');
  const bottombarStatus = document.getElementById('bottombarStatus');

  // Elements / classes we never make editable: icons, badges, decoration,
  // dynamic/JS-rendered regions, structural overlays. (colors/fonts/layout
  // are never editable by design — we only touch text + image *content*.)
  const EXCLUDE_SEL = [
    '.hazard', '.cred-tag', '.svc-tag', '.svc-num', '.cred-pillars', '.cred-dot',
    '.pulse-dot', '.counter', '.more-dots', '.more-label', '.svc-arrow-ico',
    'svg', 'script', 'style', 'noscript',
    '#heroParticles', '#serviceList', '#svcDots', '#svcTrack', '#reviewGrid', '#zoneMap', '#zoneMapWrap',
    '#zipResult', '#zoneGeoStatus', '#zoneDistrict', '#noteToast',
    '#loadingOverlay', '#loadingAnim', '#testLoadingBtn',
    '#callFab', '#msgFab', '#scrollTop',
    '#lockBtn', '#mobileMenu', '.menu-lock-btn', '.mobile-menu',  /* site's own mobile menu — keep interactive, not editable */
    '.caution-stripe', '.trust-frost', '.svc-overlay', '.svc-bg-overlay',
    '.about-overlay', '.about-vignette', '.zone-map-scanline', '.apex-txt-skip'
  ].join(', ');

  // Editor-only CSS injected into the iframe document.
  const EDITOR_CSS = `
    .apex-ed-hover { outline: 2px dashed rgba(39,224,245,.75) !important; outline-offset: 1px !important; cursor: pointer !important; }
    .apex-ed-selected { outline: 3px solid #27E0F5 !important; outline-offset: 1px !important; }
    .svc-overlay, .trust-frost, .svc-bg-overlay, .about-overlay, .about-vignette,
    .hero-particles, .caution-stripe, .zone-map-scanline { pointer-events: none !important; }
    #callFab, #msgFab, #scrollTop { pointer-events: none !important; }
    #loadingOverlay, #testLoadingBtn { display: none !important; }
    html { scroll-behavior: auto !important; }
  `;

  // Editor state
  let doc = null;                 // iframe document
  let win = null;                 // iframe window
  let saved = {};                 // last-applied overrides (mirror of store)
  let pending = {};               // working overrides
  let originals = {};             // path -> source value (for undo-to-source)
  let history = [];               // [{ path, prevEntry|null }]
  let selectedEl = null;
  let hoverEl = null;
  let active = null;              // { kind, mode, el, path }
  let sessionStarted = false;     // coalesce keystrokes into one history entry
  let frameReady = false;

  // ── Part 2 channels (carousel + service finder) — share this Apply/Cancel ──
  const DEFAULTS = window.APEX_DEFAULTS || {};
  let savedCarousel = [], pendingCarousel = [];
  let savedServices = {}, pendingServices = {};
  let editorMode = 'inline';
  // Fix 2 — shared values edited inline by data-content-key (single source = business store)
  let pendingShared = {};
  const SHARED_FIELDS = {
    'phone-number': 'phoneDisplay', 'email': 'email',
    'address-line1': 'addressLine1', 'address-line2': 'addressLine2',
    'hours-dispatch': 'hoursDispatch', 'hours-shop': 'hoursShop'
  };
  // Menu Labels — editable public site nav link labels (Home, Services, About, Reviews, Contact).
  let savedMenu = {}, pendingMenu = {};
  const NAV_DEFAULTS = { home: 'Home', services: 'Services', about: 'About', reviews: 'Reviews', contact: 'Contact' };
  function readStoreSync(key, fb) { try { var r = localStorage.getItem(key); return r == null ? fb : JSON.parse(r); } catch (e) { return fb; } }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  async function initEditor() {
    if (frameReady) return; // iframe set up once per dashboard session
    saved = await AdminStore.getContent();
    pending = clone(saved);
    // Seed Part-2 channels synchronously (fall back to factory defaults so the
    // managers show the current cards/services to edit).
    savedCarousel = readStoreSync('apex_admin_carousel_v1', null) || clone(DEFAULTS.carousel || []);
    pendingCarousel = clone(savedCarousel);
    savedServices = readStoreSync('apex_admin_services_v1', null) || clone(DEFAULTS.services || {});
    pendingServices = clone(savedServices);
    pendingShared = {};
    savedMenu = readStoreSync('apex_admin_menu_v1', null) || {};
    pendingMenu = clone(savedMenu);
    frame.addEventListener('load', onFrameLoad);
    // If the frame already loaded before listener attached, run setup now.
    if (frame.contentDocument && frame.contentDocument.readyState === 'complete') {
      onFrameLoad();
    }
  }

  function teardownEditor() {
    frameReady = false;
    closePanel();
    selectedEl = null; hoverEl = null; active = null;
    history = []; pending = {}; saved = {}; originals = {};
    savedCarousel = []; pendingCarousel = []; savedServices = {}; pendingServices = {};
    pendingShared = {}; savedMenu = {}; pendingMenu = {};
  }

  function onFrameLoad() {
    doc = frame.contentDocument;
    win = frame.contentWindow;
    if (!doc) return;
    frameReady = true;
    injectEditorStyles();
    wrapMixedText();
    applyAll(pending);          // reflect working state in preview
    applyMenuLabels(pendingMenu); // reflect pending nav label edits
    attachFrameHandlers();
    refreshControls();
  }

  function injectEditorStyles() {
    let s = doc.getElementById('apex-editor-style');
    if (!s) {
      s = doc.createElement('style');
      s.id = 'apex-editor-style';
      doc.head.appendChild(s);
    }
    s.textContent = EDITOR_CSS;
  }

  /* ── Text-node wrapping ──
     Many headings mix bare text with inline <span>/<br> (e.g. the cyan-
     highlighted words). To make ALL text editable without destroying that
     structure, we wrap each significant bare text node (that sits alongside
     element children) in <span class="apex-txt">. Pure-text elements (<p>,
     most <h3>) are left untouched and edited directly. The wrap is fully
     deterministic, so element paths stay stable across reloads. */
  function wrapMixedText() {
    if (!doc.body) return;
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = n.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (p.classList.contains('apex-txt')) return NodeFilter.FILTER_REJECT;
        if (p.closest(EXCLUDE_SEL)) return NodeFilter.FILTER_REJECT;
        // Only wrap when the text node sits beside element children (mixed).
        let hasElChild = false;
        for (const c of p.childNodes) { if (c.nodeType === 1) { hasElChild = true; break; } }
        return hasElChild ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = [];
    let n; while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (tn) {
      const span = doc.createElement('span');
      span.className = 'apex-txt';
      tn.parentNode.replaceChild(span, tn);
      span.appendChild(tn);
    });
  }

  /* ── Element classification ── */
  function hasInlineBg(el) {
    return el.style && /url\(/i.test(el.style.backgroundImage || '');
  }
  function hasDirectText(el) {
    for (const c of el.childNodes) if (c.nodeType === 3 && c.nodeValue.trim()) return true;
    return false;
  }
  function isExcluded(el) { return !el || el.closest(EXCLUDE_SEL); }

  function closestBg(start) {
    let el = start.nodeType === 1 ? start : start.parentElement;
    while (el && el !== doc.body) {
      if (el.closest(EXCLUDE_SEL)) return null;
      if (hasInlineBg(el)) return el;
      el = el.parentElement;
    }
    return null;
  }
  function textTarget(start) {
    let el = start.nodeType === 1 ? start : start.parentElement;
    while (el && el !== doc.body) {
      if (el.closest(EXCLUDE_SEL)) return null;
      if (el.tagName === 'IMG' || hasInlineBg(el)) return null;
      if (hasDirectText(el)) return el;
      el = el.parentElement;
    }
    return null;
  }
  function resolveTarget(node) {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!el || isExcluded(el)) return null;
    const img = el.closest('img');
    if (img && !isExcluded(img)) return { kind: 'image', mode: 'src', el: img };
    const bg = closestBg(el);
    if (bg) return { kind: 'image', mode: 'bg', el: bg };
    const t = textTarget(el);
    if (t) return { kind: 'text', el: t };
    return null;
  }

  /* ── Stable element path (relative to nearest id-bearing ancestor) ── */
  function pathOf(el) {
    const esc = (win.CSS && win.CSS.escape) ? win.CSS.escape : function (s) { return s; };
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== doc.documentElement) {
      if (node.id) { parts.unshift('#' + esc(node.id)); return parts.join('>'); }
      const tag = node.tagName.toLowerCase();
      let i = 1, sib = node;
      while ((sib = sib.previousElementSibling)) { if (sib.tagName === node.tagName) i++; }
      parts.unshift(tag + ':nth-of-type(' + i + ')');
      node = node.parentElement;
    }
    return parts.join('>');
  }
  function resolvePath(p) { try { return doc.querySelector(p); } catch { return null; } }

  /* ── Value read/apply ── */
  function bgUrlOf(el) {
    const m = /url\(\s*['"]?(.*?)['"]?\s*\)/i.exec(el.style.backgroundImage || '');
    return m ? m[1] : '';
  }
  function readValue(target) {
    if (target.kind === 'text') return target.el.textContent;
    if (target.mode === 'src') return target.el.getAttribute('src') || '';
    return bgUrlOf(target.el);
  }
  function entryType(target) {
    if (target.kind === 'text') return 'text';
    return target.mode === 'src' ? 'image-src' : 'image-bg';
  }
  function applyOne(path, entry) {
    const el = resolvePath(path);
    if (!el) return;
    if (entry.type === 'text') {
      el.textContent = entry.value;
    } else if (entry.type === 'image-src') {
      el.setAttribute('src', entry.value);
      el.removeAttribute('srcset');
      const pic = el.closest('picture');
      if (pic) pic.querySelectorAll('source').forEach(function (s) { s.setAttribute('srcset', entry.value); });
    } else if (entry.type === 'image-bg') {
      el.style.backgroundImage = 'url("' + entry.value + '")';
    }
  }
  function applyAll(map) { Object.keys(map).forEach(function (p) { applyOne(p, map[p]); }); }
  function applyOriginal(path) {
    if (!(path in originals)) return;
    const v = originals[path];
    const el = resolvePath(path);
    if (!el) return;
    if (el.tagName === 'IMG') applyOne(path, { type: 'image-src', value: v });
    else if (hasInlineBg(el)) applyOne(path, { type: 'image-bg', value: v });
    else applyOne(path, { type: 'text', value: v });
  }

  /* ── Frame interaction (selection / hover) ── */
  function attachFrameHandlers() {
    // Block all native navigation/interaction while editing; hijack clicks.
    doc.addEventListener('click', onFrameClick, true);
    doc.addEventListener('submit', function (e) { e.preventDefault(); }, true);
    doc.addEventListener('mouseover', onFrameHover, true);
    doc.addEventListener('mouseout', onFrameOut, true);
    // Activity inside the iframe must also count toward the session timer.
    doc.addEventListener('click', registerActivity, true);
    doc.addEventListener('keydown', registerActivity, true);
  }

  // Selectors whose clicks we must NOT hijack — the site's own mobile menu must
  // keep working (toggle + nav) inside the preview instead of entering edit mode.
  const PASSTHROUGH_SEL = '#lockBtn, #mobileMenu, .menu-lock-btn, .mobile-menu';

  function onFrameClick(e) {
    // Fix 3: let the site's MENU button + dropdown handle their own clicks.
    if (e.target.closest && e.target.closest(PASSTHROUGH_SEL)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    const target = resolveTarget(e.target);
    if (target) selectTarget(target);
  }
  function onFrameHover(e) {
    const target = resolveTarget(e.target);
    const el = target ? target.el : null;
    if (hoverEl && hoverEl !== el) hoverEl.classList.remove('apex-ed-hover');
    if (el && el !== selectedEl) { el.classList.add('apex-ed-hover'); hoverEl = el; }
    else hoverEl = null;
  }
  function onFrameOut() {
    if (hoverEl) { hoverEl.classList.remove('apex-ed-hover'); hoverEl = null; }
  }

  function selectTarget(target) {
    if (selectedEl) selectedEl.classList.remove('apex-ed-selected');
    if (hoverEl) { hoverEl.classList.remove('apex-ed-hover'); hoverEl = null; }
    selectedEl = target.el;
    selectedEl.classList.add('apex-ed-selected');

    const path = pathOf(target.el);
    target.path = path;
    active = target;
    sessionStarted = false;

    // Fix 2: a repeated value? edits propagate to every matching data-content-key.
    target.sharedKey = (target.kind === 'text' && target.el.closest)
      ? (function () { const k = target.el.closest('[data-content-key]'); return k ? k.getAttribute('data-content-key') : null; })()
      : null;

    // Capture the source value once (for undo-to-source on untouched paths).
    if (!(path in originals)) originals[path] = readValue(target);

    openPanel(target);
  }

  /* ── Side panel ── */
  function openPanel(target) {
    editPanelPath.textContent = target.path;
    if (target.kind === 'text') {
      editTextBlock.hidden = false;
      editImageBlock.hidden = true;
      if (target.sharedKey) {
        editPanelTitle.textContent = 'Edit shared value';
        const n = doc.querySelectorAll('[data-content-key="' + target.sharedKey + '"]').length;
        sharedNote.textContent = 'Shared value — appears in ' + n + ' place' + (n !== 1 ? 's' : '') + ' on the site and updates everywhere at once.';
        sharedNote.hidden = false;
        editTextInput.value = (target.sharedKey in pendingShared) ? pendingShared[target.sharedKey] : target.el.textContent;
      } else {
        editPanelTitle.textContent = 'Edit text';
        sharedNote.hidden = true;
        editTextInput.value = (pending[target.path] && pending[target.path].type === 'text')
          ? pending[target.path].value : target.el.textContent;
      }
      editPanel.classList.add('is-open');
      editPanel.setAttribute('aria-hidden', 'false');
      editTextInput.focus();
      editTextInput.setSelectionRange(editTextInput.value.length, editTextInput.value.length);
    } else {
      editPanelTitle.textContent = 'Edit image';
      editTextBlock.hidden = true;
      editImageBlock.hidden = false;
      editImageFile.value = '';
      const cur = readValue(target);
      editImageUrl.value = /^data:/.test(cur) ? '' : cur;
      setPreview(cur);
      editPanel.classList.add('is-open');
      editPanel.setAttribute('aria-hidden', 'false');
      editImageUrl.focus();
    }
  }
  function closePanel() {
    editPanel.classList.remove('is-open');
    editPanel.setAttribute('aria-hidden', 'true');
    if (selectedEl) { selectedEl.classList.remove('apex-ed-selected'); selectedEl = null; }
    active = null;
    sessionStarted = false;
  }
  function setPreview(src) {
    if (src) {
      editImagePreview.src = src;
      editImagePreview.parentElement.classList.add('has-image');
    } else {
      editImagePreview.removeAttribute('src');
      editImagePreview.parentElement.classList.remove('has-image');
    }
  }

  editPanelClose.addEventListener('click', closePanel);

  // Bottom-sheet (mobile): drag the grip down — or tap it — to dismiss.
  if (editPanelGrip) {
    let gDrag = false, gStartY = 0, gDy = 0, gMoved = 0;
    const gEnd = function () {
      if (!gDrag) return;
      gDrag = false;
      editPanel.style.transition = '';
      editPanel.style.transform = '';
      if (gDy > 80 || gMoved < 6) closePanel();   // dragged down far enough, or tapped
    };
    editPanelGrip.addEventListener('pointerdown', function (e) {
      gDrag = true; gDy = 0; gMoved = 0; gStartY = e.clientY;
      editPanel.style.transition = 'none';
      try { editPanelGrip.setPointerCapture(e.pointerId); } catch (_) {}
    });
    editPanelGrip.addEventListener('pointermove', function (e) {
      if (!gDrag) return;
      gDy = e.clientY - gStartY; gMoved = Math.abs(gDy);
      if (gDy > 0) editPanel.style.transform = 'translateY(' + gDy + 'px)';
    });
    editPanelGrip.addEventListener('pointerup', gEnd);
    editPanelGrip.addEventListener('pointercancel', gEnd);
    editPanelGrip.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closePanel(); }
    });
  }

  /* ── Per-element action buttons (✓ accept / ✗ revert / ↶ undo) ──
     These affect ONLY the currently selected element. The global Apply/Cancel
     in the bottom bar still handle every pending change together. */
  function sharedSavedValue(key) {
    const biz = readStoreSync('apex_admin_business_v1', null) || clone(DEFAULTS.business || {});
    const f = SHARED_FIELDS[key];
    return f ? (biz[f] == null ? '' : biz[f]) : '';
  }

  // ✓ Accept — the edit is already in the pending state; confirm & close.
  elAcceptBtn.addEventListener('click', function () { closePanel(); });

  // ✗ Revert — discard ALL of this element's pending edits, back to its
  //   previous (last-applied / source) value. Other pending changes untouched.
  elRevertBtn.addEventListener('click', function () {
    if (!active) return;
    if (active.sharedKey) {
      const key = active.sharedKey;
      const v = sharedSavedValue(key);
      delete pendingShared[key];
      const w = frame.contentWindow;
      if (w && w.APEX_PATCH && w.APEX_PATCH.syncContentKey) { try { w.APEX_PATCH.syncContentKey(key, v); } catch (e) {} }
    } else {
      const p = active.path;
      history = history.filter(function (h) { return h.path !== p; });
      if (saved[p]) { pending[p] = clone(saved[p]); applyOne(p, saved[p]); }
      else { delete pending[p]; applyOriginal(p); }
    }
    sessionStarted = false;
    closePanel();
    refreshControls();
  });

  // ↶ Undo — step back the last change made to THIS element.
  elUndoBtn.addEventListener('click', function () {
    if (!active) return;
    if (active.sharedKey) {
      // Shared values aren't multi-step; step back to the saved value.
      const key = active.sharedKey;
      const v = sharedSavedValue(key);
      delete pendingShared[key];
      editTextInput.value = v;
      const w = frame.contentWindow;
      if (w && w.APEX_PATCH && w.APEX_PATCH.syncContentKey) { try { w.APEX_PATCH.syncContentKey(key, v); } catch (e) {} }
    } else {
      const p = active.path;
      let idx = -1;
      for (let i = history.length - 1; i >= 0; i--) { if (history[i].path === p) { idx = i; break; } }
      if (idx === -1) { refreshControls(); return; }
      const entry = history.splice(idx, 1)[0];
      if (entry.prevEntry) { pending[p] = entry.prevEntry; applyOne(p, entry.prevEntry); }
      else { delete pending[p]; applyOriginal(p); }
      refreshPanelValue();
    }
    sessionStarted = false;
    refreshControls();
  });

  // Text edits: live, coalesced into one undo step per element session.
  editTextInput.addEventListener('input', function () {
    if (!active || active.kind !== 'text') return;
    if (active.sharedKey) commitShared(active.sharedKey, editTextInput.value);
    else commitEdit(active.path, 'text', editTextInput.value);
  });

  // Image URL edits.
  editImageUrl.addEventListener('input', function () {
    if (!active || active.kind !== 'image') return;
    const v = editImageUrl.value.trim();
    setPreview(v);
    commitEdit(active.path, entryType(active), v);
  });

  // Image file upload -> base64 data URL.
  editImageFile.addEventListener('change', function () {
    if (!active || active.kind !== 'image') return;
    const file = editImageFile.files && editImageFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      // TODO: upload image to backend/storage and save URL (currently base64 in localStorage)
      const dataUrl = String(reader.result);
      editImageUrl.value = '';
      setPreview(dataUrl);
      commitEdit(active.path, entryType(active), dataUrl);
    };
    reader.readAsDataURL(file);
  });

  /* ── Pending state mutation ── */
  function commitEdit(path, type, value) {
    if (!sessionStarted) {
      history.push({ path: path, prevEntry: pending[path] ? clone(pending[path]) : null });
      sessionStarted = true;
    }
    pending[path] = { type: type, value: value };
    applyOne(path, pending[path]);
    refreshControls();
  }

  function isDirty() {
    return JSON.stringify(pending) !== JSON.stringify(saved)
      || JSON.stringify(pendingCarousel) !== JSON.stringify(savedCarousel)
      || JSON.stringify(pendingServices) !== JSON.stringify(savedServices)
      || JSON.stringify(pendingMenu) !== JSON.stringify(savedMenu)
      || Object.keys(pendingShared).length > 0;
  }

  function refreshControls() {
    const dirty = isDirty();
    undoBtn.disabled = history.length === 0;
    applyBtn.disabled = !dirty;
    cancelBtn.disabled = !dirty;
    dirtyFlag.hidden = !dirty;
    bottombarStatus.textContent = dirty ? 'Pending changes — not yet applied' : 'No pending changes';
    bottombarStatus.classList.toggle('is-dirty', dirty);
  }

  /* ── Undo / Apply / Cancel ── */
  undoBtn.addEventListener('click', function () {
    const last = history.pop();
    if (!last) return;
    if (last.prevEntry) { pending[last.path] = last.prevEntry; applyOne(last.path, last.prevEntry); }
    else { delete pending[last.path]; applyOriginal(last.path); }
    // If the undone path is the one open in the panel, refresh the inputs.
    if (active && active.path === last.path) refreshPanelValue();
    sessionStarted = false;
    refreshControls();
  });

  function refreshPanelValue() {
    if (!active) return;
    const entry = pending[active.path];
    if (active.kind === 'text') {
      editTextInput.value = entry ? entry.value : (active.path in originals ? originals[active.path] : '');
    } else {
      const v = entry ? entry.value : (active.path in originals ? originals[active.path] : '');
      editImageUrl.value = /^data:/.test(v) ? '' : v;
      setPreview(v);
    }
  }

  // Apply persists ALL channels (content + carousel + services), then reloads
  // the iframe so it re-renders pristinely from storage via content-patch.js.
  applyBtn.addEventListener('click', async function () {
    await AdminStore.saveContent(pending);
    await AdminStore.saveCarousel(pendingCarousel);
    await AdminStore.saveServices(pendingServices);
    await AdminStore.saveMenu(pendingMenu);
    // Persist inline shared-value edits into the single source (business store).
    if (Object.keys(pendingShared).length) {
      const biz = readStoreSync('apex_admin_business_v1', null) || clone(DEFAULTS.business || {});
      Object.keys(pendingShared).forEach(function (k) { const f = SHARED_FIELDS[k]; if (f) biz[f] = pendingShared[k]; });
      if (pendingShared['phone-number'] != null) {
        const digits = String(pendingShared['phone-number']).replace(/\D/g, '');
        const norm = digits ? (digits.length === 10 ? '1' + digits : digits) : '';
        biz.phoneTel = norm ? '+' + norm : ''; biz.whatsapp = norm;
      }
      await AdminStore.saveBusinessInfo(biz);
    }
    saved = clone(pending);
    savedCarousel = clone(pendingCarousel);
    savedServices = clone(pendingServices);
    savedMenu = clone(pendingMenu);
    pendingShared = {};
    history = [];
    sessionStarted = false;
    await recordSnapshot();
    reloadFrame();
    refreshControls();
    showToast('Changes applied & saved');
  });

  // Cancel reverts every channel to its saved state and reloads the iframe.
  cancelBtn.addEventListener('click', function () {
    pending = clone(saved);
    pendingCarousel = clone(savedCarousel);
    pendingServices = clone(savedServices);
    pendingMenu = clone(savedMenu);
    pendingShared = {};
    applyMenuLabels(pendingMenu);
    history = [];
    sessionStarted = false;
    if (editorMode === 'carousel') renderCardList();
    if (editorMode === 'services') renderServiceManager();
    if (editorMode === 'menu') renderMenuManager();
    reloadFrame();
    refreshControls();
    showToast('Pending changes discarded');
  });

  function reloadFrame() {
    closePanel();
    try {
      if (frame.contentWindow) frame.contentWindow.location.reload();
      else frame.src = frame.getAttribute('src') || '/';
    } catch (e) {
      frame.src = frame.getAttribute('src') || '/';
    }
  }

  /* ── Toast ── */
  let toastTimer = null;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-show'); }, 2200);
  }

  // Close panel on Escape.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && editPanel.classList.contains('is-open')) closePanel();
  });

  /* ========================================================================
     6. PART 2 — Carousel cards / Service finder / Business info / Reviews
     ===================================================================== */

  // Small HTML escapers for building editor markup from admin-supplied values.
  function esc(s)    { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function attr(s)   { return esc(s).replace(/"/g, '&quot;'); }
  function cssUrl(s) { return String(s == null ? '' : s).replace(/['"\\)]/g, '').replace(/\s+/g, ' ').trim(); }

  /* ── Editor mode switcher (Inline edit / Carousel cards / Service finder) ── */
  const carouselPane = document.getElementById('carouselPane');
  const servicePane  = document.getElementById('servicePane');
  const menuPane     = document.getElementById('menuPane');
  const menuList     = document.getElementById('menuList');
  const sharedNote   = document.getElementById('sharedNote');

  document.querySelectorAll('.ed-mode').forEach(function (btn) {
    btn.addEventListener('click', function () { setEditorMode(btn.dataset.mode); });
  });
  function setEditorMode(mode) {
    editorMode = mode;
    document.querySelectorAll('.ed-mode').forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.mode === mode);
    });
    carouselPane.hidden = mode !== 'carousel';
    servicePane.hidden  = mode !== 'services';
    menuPane.hidden     = mode !== 'menu';
    if (mode === 'carousel') renderCardList();
    if (mode === 'services') renderServiceManager();
    if (mode === 'menu') renderMenuManager();
  }

  /* ── Menu Labels: public site nav link editor ── */
  function applyMenuLabels(map) {
    // Applies to the iframe — updates [data-nav-key] elements (desktop + mobile nav).
    if (!doc) return;
    Object.keys(NAV_DEFAULTS).forEach(function (key) {
      const label = (map && map[key]) || NAV_DEFAULTS[key];
      doc.querySelectorAll('[data-nav-key="' + key + '"]').forEach(function (el) {
        el.textContent = label;
      });
    });
  }
  function renderMenuManager() {
    menuList.innerHTML = '';
    Object.keys(NAV_DEFAULTS).forEach(function (key) {
      const row = document.createElement('div');
      row.className = 'menu-row';
      row.innerHTML =
        '<label class="field">' +
          '<span class="field-label">' + esc(NAV_DEFAULTS[key]) + '</span>' +
          '<input type="text" placeholder="' + attr(NAV_DEFAULTS[key]) + '" value="' + attr(pendingMenu[key] || '') + '"/>' +
        '</label>';
      const inp = row.querySelector('input');
      inp.addEventListener('input', function () {
        pendingMenu[key] = inp.value;
        applyMenuLabels(pendingMenu);
        refreshControls();
      });
      menuList.appendChild(row);
    });
  }

  /* ── Fix 2: inline shared-value (data-content-key) edits ── */
  function commitShared(key, value) {
    const w = frame.contentWindow;
    if (w && w.APEX_PATCH && w.APEX_PATCH.syncContentKey) { try { w.APEX_PATCH.syncContentKey(key, value); } catch (e) {} }
    const biz = readStoreSync('apex_admin_business_v1', null) || (DEFAULTS.business || {});
    const field = SHARED_FIELDS[key];
    const savedVal = field ? biz[field] : undefined;
    if (value === savedVal) delete pendingShared[key]; else pendingShared[key] = value;
    refreshControls();
  }

  /* ──────────────────────── CAROUSEL CARDS ──────────────────────── */
  const cardList   = document.getElementById('cardList');
  const addCardBtn = document.getElementById('addCardBtn');
  let cPrevTimer = null;

  function previewCarousel(immediate) {
    clearTimeout(cPrevTimer);
    const run = function () {
      const w = frame.contentWindow;
      if (!w || !w.APEX_PATCH) return;
      try {
        w.APEX_PATCH.renderCarousel(pendingCarousel);
        w.APEX_PATCH.applyBusiness(readStoreSync('apex_admin_business_v1', DEFAULTS.business));
      } catch (e) {}
    };
    if (immediate) run(); else cPrevTimer = setTimeout(run, 180);
  }

  function renderCardList() {
    cardList.innerHTML = '';
    if (!pendingCarousel.length) {
      cardList.innerHTML = '<div class="manager-empty">No cards. Add one below.</div>';
      return;
    }
    pendingCarousel.forEach(function (card, i) { cardList.appendChild(buildCardEditor(card, i)); });
  }

  function buildCardEditor(card, i) {
    const wrap = document.createElement('div');
    wrap.className = 'card-edit';
    wrap.innerHTML =
      '<div class="card-edit-head">' +
        '<span class="card-edit-label">Card ' + (i + 1) + '</span>' +
        '<div class="card-edit-actions">' +
          '<button class="mini-btn" data-act="up" title="Move up"' + (i === 0 ? ' disabled' : '') + '>&uarr;</button>' +
          '<button class="mini-btn" data-act="down" title="Move down"' + (i === pendingCarousel.length - 1 ? ' disabled' : '') + '>&darr;</button>' +
          '<button class="mini-btn danger" data-act="del" title="Delete card">&times;</button>' +
        '</div>' +
      '</div>' +
      '<div class="card-edit-top">' +
        '<div class="card-thumb" data-thumb style="background-image:url(\'' + cssUrl(card.image) + '\')"></div>' +
        '<div class="card-img-controls">' +
          '<label class="field"><span class="field-label">Upload image</span><input type="file" accept="image/*" data-field="file"/></label>' +
          '<label class="field"><span class="field-label">or image URL</span><input type="url" data-field="image" value="' + attr(card.image) + '" placeholder="upscaledimages/…"/></label>' +
        '</div>' +
      '</div>' +
      '<label class="field"><span class="field-label">Title</span><input type="text" data-field="title" value="' + attr(card.title) + '"/></label>' +
      '<label class="field"><span class="field-label">Badge</span><input type="text" data-field="badge" value="' + attr(card.badge) + '" placeholder="SAME DAY"/></label>' +
      '<label class="field"><span class="field-label">Description</span><textarea rows="2" data-field="desc">' + esc(card.desc) + '</textarea></label>';

    const thumb = wrap.querySelector('[data-thumb]');

    wrap.querySelector('[data-act="up"]').addEventListener('click', function () { moveCard(i, -1); });
    wrap.querySelector('[data-act="down"]').addEventListener('click', function () { moveCard(i, 1); });
    wrap.querySelector('[data-act="del"]').addEventListener('click', function () {
      if (!confirm('Delete this card?')) return;
      pendingCarousel.splice(i, 1);
      renderCardList(); previewCarousel(true); refreshControls();
    });

    wrap.querySelectorAll('input[data-field], textarea[data-field]').forEach(function (inp) {
      const f = inp.dataset.field;
      if (f === 'file') {
        inp.addEventListener('change', function () {
          const file = inp.files && inp.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = function () {
            // TODO: upload image to backend/storage and save URL (currently base64 in localStorage)
            const dataUrl = String(reader.result);
            pendingCarousel[i].image = dataUrl;
            thumb.style.backgroundImage = "url('" + cssUrl(dataUrl) + "')";
            const urlInp = wrap.querySelector('input[data-field="image"]');
            if (urlInp) urlInp.value = '';
            previewCarousel(true); refreshControls();
          };
          reader.readAsDataURL(file);
        });
      } else {
        inp.addEventListener('input', function () {
          pendingCarousel[i][f] = inp.value;
          if (f === 'image') thumb.style.backgroundImage = "url('" + cssUrl(inp.value) + "')";
          previewCarousel(false); refreshControls();
        });
      }
    });
    return wrap;
  }

  function moveCard(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= pendingCarousel.length) return;
    const tmp = pendingCarousel[i];
    pendingCarousel[i] = pendingCarousel[j];
    pendingCarousel[j] = tmp;
    renderCardList(); previewCarousel(true); refreshControls();
  }

  addCardBtn.addEventListener('click', function () {
    pendingCarousel.push({
      id: 'c' + Date.now(),
      badge: 'NEW',
      title: 'New service',
      desc: '',
      image: DEFAULTS.PLACEHOLDER_IMG || '',
      icon: DEFAULTS.DEFAULT_ICON || ''
    });
    renderCardList();
    previewCarousel(true);
    refreshControls();
    cardList.scrollTop = cardList.scrollHeight;
  });

  /* ──────────────────────── SERVICE FINDER ──────────────────────── */
  const svcCatTabs  = document.getElementById('svcCatTabs');
  const svcItemList = document.getElementById('svcItemList');
  const addSvcBtn   = document.getElementById('addSvcBtn');
  const SVC_LABELS  = DEFAULTS.serviceLabels || {};
  let svcCat = 'home';

  function previewServices() {
    const w = frame.contentWindow;
    if (w && typeof w.__apexSetServices === 'function') {
      try { w.__apexSetServices(pendingServices); } catch (e) {}
    }
  }
  function normItem(it) {
    return (it && typeof it === 'object') ? { main: it.main || '', sub: it.sub || '' } : { main: String(it == null ? '' : it), sub: '' };
  }
  function renderServiceManager() {
    svcCatTabs.innerHTML = '';
    Object.keys(SVC_LABELS).forEach(function (key) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'seg-btn' + (key === svcCat ? ' is-active' : '');
      b.textContent = SVC_LABELS[key];
      b.addEventListener('click', function () { svcCat = key; renderServiceManager(); });
      svcCatTabs.appendChild(b);
    });
    renderSvcItems();
  }
  function renderSvcItems() {
    svcItemList.innerHTML = '';
    const arr = pendingServices[svcCat] || (pendingServices[svcCat] = []);
    if (!arr.length) { svcItemList.innerHTML = '<div class="manager-empty">No items in this category.</div>'; return; }
    arr.forEach(function (raw, i) {
      const it = normItem(raw);
      const row = document.createElement('div');
      row.className = 'svc-item';
      row.innerHTML =
        '<div class="svc-item-fields">' +
          '<input type="text" data-f="main" value="' + attr(it.main) + '" placeholder="Service name"/>' +
          '<div class="svc-item-sub"><input type="text" data-f="sub" value="' + attr(it.sub) + '" placeholder="(optional) detail line"/></div>' +
        '</div>' +
        '<button class="mini-btn danger" data-act="del" title="Delete item">&times;</button>';
      const mainI = row.querySelector('[data-f="main"]');
      const subI  = row.querySelector('[data-f="sub"]');
      function commit() {
        const m = mainI.value;
        const s = subI.value.trim();
        pendingServices[svcCat][i] = s ? { main: m, sub: s } : m;
        previewServices(); refreshControls();
      }
      mainI.addEventListener('input', commit);
      subI.addEventListener('input', commit);
      row.querySelector('[data-act="del"]').addEventListener('click', function () {
        if (!confirm('Delete this service item?')) return;
        pendingServices[svcCat].splice(i, 1);
        renderSvcItems(); previewServices(); refreshControls();
      });
      svcItemList.appendChild(row);
    });
  }
  addSvcBtn.addEventListener('click', function () {
    if (!pendingServices[svcCat]) pendingServices[svcCat] = [];
    pendingServices[svcCat].push('');
    renderSvcItems(); refreshControls();
    const inputs = svcItemList.querySelectorAll('[data-f="main"]');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  /* ──────────────────────── BUSINESS INFO ──────────────────────── */
  const bizPhone = document.getElementById('bizPhone');
  const bizEmail = document.getElementById('bizEmail');
  const bizAddr1 = document.getElementById('bizAddr1');
  const bizAddr2 = document.getElementById('bizAddr2');
  const bizHoursDispatch = document.getElementById('bizHoursDispatch');
  const bizHoursShop = document.getElementById('bizHoursShop');
  const bizSaveBtn = document.getElementById('bizSaveBtn');
  const bizResetBtn = document.getElementById('bizResetBtn');
  const bizStatus = document.getElementById('bizStatus');
  const bizInputs = [bizPhone, bizEmail, bizAddr1, bizAddr2, bizHoursDispatch, bizHoursShop];
  let bizSaved = null;

  async function loadBusiness() {
    bizSaved = (await AdminStore.getBusinessInfo()) || clone(DEFAULTS.business || {});
    fillBiz(bizSaved);
    refreshBizControls();
  }
  function fillBiz(b) {
    bizPhone.value = b.phoneDisplay || '';
    bizEmail.value = b.email || '';
    bizAddr1.value = b.addressLine1 || '';
    bizAddr2.value = b.addressLine2 || '';
    bizHoursDispatch.value = b.hoursDispatch || '';
    bizHoursShop.value = b.hoursShop || '';
  }
  function readBizInputs() {
    const disp = bizPhone.value.trim();
    const digits = disp.replace(/\D/g, '');
    const norm = digits ? (digits.length === 10 ? '1' + digits : digits) : '';
    return {
      phoneDisplay: disp,
      phoneTel: norm ? '+' + norm : '',
      whatsapp: norm,
      email: bizEmail.value.trim(),
      addressLine1: bizAddr1.value.trim(),
      addressLine2: bizAddr2.value.trim(),
      hoursDispatch: bizHoursDispatch.value.trim(),
      hoursShop: bizHoursShop.value.trim()
    };
  }
  function bizDirty() { return bizSaved && JSON.stringify(readBizInputs()) !== JSON.stringify(bizSaved); }
  function refreshBizControls() {
    const d = !!bizDirty();
    bizSaveBtn.disabled = !d;
    bizResetBtn.disabled = !d;
    bizStatus.textContent = d ? 'Unsaved changes' : 'No pending changes';
    bizStatus.classList.toggle('is-dirty', d);
  }
  function previewBusiness() {
    const w = frame.contentWindow;
    if (w && w.APEX_PATCH) { try { w.APEX_PATCH.applyBusiness(readBizInputs()); } catch (e) {} }
  }
  bizInputs.forEach(function (inp) {
    inp.addEventListener('input', function () { previewBusiness(); refreshBizControls(); });
  });
  bizSaveBtn.addEventListener('click', async function () {
    const b = readBizInputs();
    await AdminStore.saveBusinessInfo(b);   // TODO: replace localStorage with backend API call
    bizSaved = clone(b);
    previewBusiness();
    refreshBizControls();
    await recordSnapshot();
    showToast('Business info saved');
  });
  bizResetBtn.addEventListener('click', function () {
    if (bizSaved) fillBiz(bizSaved);
    previewBusiness();
    refreshBizControls();
  });

  /* ──────────────────────── REVIEWS ──────────────────────── */
  const reviewList = document.getElementById('reviewList');
  const addReviewBtn = document.getElementById('addReviewBtn');
  const reviewApplyBtn = document.getElementById('reviewApplyBtn');
  const reviewCancelBtn = document.getElementById('reviewCancelBtn');
  const reviewStatus = document.getElementById('reviewStatus');
  let savedReviews = null, pendingReviews = null;

  async function loadReviews() {
    savedReviews = (await AdminStore.getReviews()) || clone(DEFAULTS.reviews || []);
    pendingReviews = clone(savedReviews);
    renderReviewList();
    refreshReviewControls();
  }
  function previewReviews() {
    const w = frame.contentWindow;
    if (w && w.APEX_PATCH) { try { w.APEX_PATCH.renderReviews(pendingReviews); } catch (e) {} }
  }
  function renderReviewList() {
    reviewList.innerHTML = '';
    if (!pendingReviews.length) { reviewList.innerHTML = '<div class="manager-empty">No reviews. Add one above.</div>'; return; }
    pendingReviews.forEach(function (r, i) { reviewList.appendChild(buildReviewEditor(r, i)); });
  }
  function ratingStarsHtml(rating) {
    let s = '';
    for (let v = 1; v <= 5; v++) {
      s += '<button type="button" class="rating-star' + (v <= rating ? ' on' : '') + '" data-v="' + v + '" aria-label="' + v + ' star' + (v > 1 ? 's' : '') + '">&#9733;</button>';
    }
    return s;
  }
  function buildReviewEditor(r, i) {
    const wrap = document.createElement('div');
    wrap.className = 'review-edit';
    wrap.innerHTML =
      '<div class="review-edit-head">' +
        '<span class="card-edit-label">Review ' + (i + 1) + '</span>' +
        '<button class="mini-btn danger" data-act="del" title="Delete review">&times;</button>' +
      '</div>' +
      '<div class="review-edit-row">' +
        '<label class="field"><span class="field-label">Name</span><input data-f="name" value="' + attr(r.name) + '"/></label>' +
        '<label class="field"><span class="field-label">Date / timeframe</span><input data-f="date" value="' + attr(r.date) + '" placeholder="2 weeks ago"/></label>' +
      '</div>' +
      '<label class="field"><span class="field-label">Rating</span><div class="rating-stars" data-rating>' + ratingStarsHtml(r.rating) + '</div></label>' +
      '<label class="field"><span class="field-label">Review text</span><textarea rows="3" data-f="text">' + esc(r.text) + '</textarea></label>';

    wrap.querySelectorAll('[data-f]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        pendingReviews[i][inp.dataset.f] = inp.value;
        previewReviews(); refreshReviewControls();
      });
    });
    wrap.querySelectorAll('.rating-star').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const val = +btn.dataset.v;
        pendingReviews[i].rating = val;
        wrap.querySelectorAll('.rating-star').forEach(function (b) { b.classList.toggle('on', +b.dataset.v <= val); });
        previewReviews(); refreshReviewControls();
      });
    });
    wrap.querySelector('[data-act="del"]').addEventListener('click', function () {
      if (!confirm('Delete this review?')) return;
      pendingReviews.splice(i, 1);
      renderReviewList(); previewReviews(); refreshReviewControls();
    });
    return wrap;
  }
  function reviewDirty() { return JSON.stringify(pendingReviews) !== JSON.stringify(savedReviews); }
  function refreshReviewControls() {
    const d = reviewDirty();
    reviewApplyBtn.disabled = !d;
    reviewCancelBtn.disabled = !d;
    reviewStatus.textContent = d ? 'Unsaved changes' : 'No pending changes';
    reviewStatus.classList.toggle('is-dirty', d);
  }
  addReviewBtn.addEventListener('click', function () {
    pendingReviews.push({ id: 'r' + Date.now(), name: 'NEW CUSTOMER', rating: 5, date: 'Just now', text: '' });
    renderReviewList(); previewReviews(); refreshReviewControls();
    reviewList.scrollTop = reviewList.scrollHeight;
  });
  reviewApplyBtn.addEventListener('click', async function () {
    await AdminStore.saveReviews(pendingReviews);   // TODO: replace localStorage with backend API call
    savedReviews = clone(pendingReviews);
    previewReviews();
    refreshReviewControls();
    await recordSnapshot();
    showToast('Reviews saved');
  });
  reviewCancelBtn.addEventListener('click', function () {
    pendingReviews = clone(savedReviews);
    renderReviewList(); previewReviews(); refreshReviewControls();
    showToast('Pending review changes discarded');
  });

  /* ========================================================================
     7. MOBILE SIDEBAR DRAWER
     ===================================================================== */
  const sidebarEl       = document.querySelector('.sidebar');
  const sidebarToggle   = document.getElementById('sidebarToggle');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');

  function openSidebar() {
    sidebarEl.classList.add('is-open');
    sidebarBackdrop.classList.add('is-open');
    sidebarToggle.setAttribute('aria-expanded', 'true');
  }
  function closeSidebar() {
    sidebarEl.classList.remove('is-open');
    sidebarBackdrop.classList.remove('is-open');
    sidebarToggle.setAttribute('aria-expanded', 'false');
  }
  sidebarToggle.addEventListener('click', function () {
    if (sidebarEl.classList.contains('is-open')) closeSidebar(); else openSidebar();
  });
  sidebarBackdrop.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && sidebarEl.classList.contains('is-open')) closeSidebar();
  });

  /* ========================================================================
     8. SAVED CHANGES / VERSION HISTORY
     Every Apply/Save records a timestamped snapshot of the entire persisted
     site-content state. Capped at the 20 most recent.
     ===================================================================== */
  const VERSION_LIMIT = 20;
  const versionList = document.getElementById('versionList');
  const CONTENT_KEYS = {
    content:  'apex_admin_content_v1',
    carousel: 'apex_admin_carousel_v1',
    services: 'apex_admin_services_v1',
    business: 'apex_admin_business_v1',
    reviews:  'apex_admin_reviews_v1'
  };

  function formatTs(ts) {
    const d = new Date(ts);
    const date = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return date + ' — ' + time;
  }

  // Capture the entire persisted site-content state as one snapshot.
  function snapshotState() {
    return {
      content:  readStoreSync(CONTENT_KEYS.content, null),
      carousel: readStoreSync(CONTENT_KEYS.carousel, null),
      services: readStoreSync(CONTENT_KEYS.services, null),
      business: readStoreSync(CONTENT_KEYS.business, null),
      reviews:  readStoreSync(CONTENT_KEYS.reviews, null)
    };
  }

  // Called after every Apply / Save.
  async function recordSnapshot() {
    // TODO: move version history to backend database
    const list = (await AdminStore.getVersions()) || [];
    list.unshift({ id: 'v' + Date.now(), ts: Date.now(), name: null, data: snapshotState() });
    // Cap at VERSION_LIMIT, dropping the oldest — but warn if it was named.
    while (list.length > VERSION_LIMIT) {
      const oldest = list[list.length - 1];
      if (oldest.name) {
        const ok = confirm('Version history is full (' + VERSION_LIMIT + '). The oldest saved version "' + oldest.name + '" is named and would be deleted to make room. Delete it?');
        if (!ok) { list.shift(); break; } // keep the named one; drop the snapshot we just added
      }
      list.pop();
    }
    await AdminStore.saveVersions(list);
    if (currentView === 'versions') renderVersionList(list);
  }

  async function loadVersions() {
    renderVersionList((await AdminStore.getVersions()) || []);
    renderDefaults();
  }

  function renderVersionList(list) {
    versionList.innerHTML = '';
    if (!list.length) {
      versionList.innerHTML = '<div class="manager-empty">No saved versions yet. One is captured automatically each time you Apply or Save changes.</div>';
      return;
    }
    list.forEach(function (v) { versionList.appendChild(buildVersionRow(v)); });
  }

  function buildVersionRow(v) {
    const row = document.createElement('div');
    row.className = 'version-row';
    const title = v.name ? esc(v.name) : formatTs(v.ts);
    const sub = v.name ? formatTs(v.ts) : 'Auto-saved';
    row.innerHTML =
      '<div class="version-info">' +
        '<span class="version-name">' + title + (v.name ? '<span class="version-badge">named</span>' : '') + '</span>' +
        '<span class="version-ts">' + esc(sub) + '</span>' +
      '</div>' +
      '<div class="version-actions">' +
        '<button class="btn btn-ghost btn-sm" data-act="rename">Rename</button>' +
        '<button class="btn btn-primary btn-sm" data-act="restore">Restore</button>' +
        '<button class="btn btn-ghost btn-sm" data-act="delete">Delete</button>' +
      '</div>';
    row.querySelector('[data-act="rename"]').addEventListener('click', function () { renameVersion(v.id); });
    row.querySelector('[data-act="restore"]').addEventListener('click', function () { restoreVersion(v.id); });
    row.querySelector('[data-act="delete"]').addEventListener('click', function () { deleteVersion(v.id); });
    return row;
  }

  async function renameVersion(id) {
    const list = (await AdminStore.getVersions()) || [];
    const v = list.find(function (x) { return x.id === id; });
    if (!v) return;
    const name = prompt('Name this version (e.g. "Original design", "Summer update"):', v.name || '');
    if (name === null) return; // cancelled
    v.name = name.trim() || null;
    await AdminStore.saveVersions(list);
    renderVersionList(list);
  }

  async function deleteVersion(id) {
    const list = (await AdminStore.getVersions()) || [];
    const v = list.find(function (x) { return x.id === id; });
    if (!v) return;
    if (!confirm('Delete this saved version' + (v.name ? ' "' + v.name + '"' : '') + '? This cannot be undone.')) return;
    const next = list.filter(function (x) { return x.id !== id; });
    await AdminStore.saveVersions(next);
    renderVersionList(next);
  }

  async function restoreVersion(id) {
    const list = (await AdminStore.getVersions()) || [];
    const v = list.find(function (x) { return x.id === id; });
    if (!v) return;
    if (!confirm('Restore site to this version? Current unsaved changes will be lost.')) return;
    const d = v.data || {};
    // TODO: move version history to backend database (restore = re-publish the snapshot)
    setOrRemove(CONTENT_KEYS.content, d.content);
    setOrRemove(CONTENT_KEYS.carousel, d.carousel);
    setOrRemove(CONTENT_KEYS.services, d.services);
    setOrRemove(CONTENT_KEYS.business, d.business);
    setOrRemove(CONTENT_KEYS.reviews, d.reviews);
    // A full reload re-initialises the editor + preview iframe cleanly from the
    // restored state. The session lives in localStorage, so it survives.
    window.location.reload();
  }
  function setOrRemove(key, val) {
    if (val == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(val));
  }

  /* ========================================================================
     9. DEFAULT CHECKPOINT (protected baseline + Default History)
     Separate from the rolling 20-snapshot history; never auto-deleted.
     ===================================================================== */
  const saveDefaultBtn       = document.getElementById('saveDefaultBtn');
  const restoreDefaultBtn    = document.getElementById('restoreDefaultBtn');
  const defaultHistoryToggle = document.getElementById('defaultHistoryToggle');
  const defaultHistoryList   = document.getElementById('defaultHistoryList');
  const defaultCurrent       = document.getElementById('defaultCurrent');

  /* ── Reusable confirm modal (styled warning dialog) ──
     Returns a Promise<boolean>. Used instead of native confirm() so the
     destructive Restore Default action gets a clear red/grey warning dialog. */
  const confirmModalEl     = document.getElementById('confirmModal');
  const confirmModalTitle  = document.getElementById('confirmModalTitle');
  const confirmModalMsg    = document.getElementById('confirmModalMsg');
  const confirmModalOk     = document.getElementById('confirmModalOk');
  const confirmModalCancel = document.getElementById('confirmModalCancel');
  let _confirmResolve = null;

  function openConfirmModal(opts) {
    return new Promise(function (resolve) {
      _confirmResolve = resolve;
      confirmModalTitle.textContent = opts.title || 'Are you sure?';
      confirmModalMsg.textContent   = opts.message || '';
      confirmModalOk.textContent    = opts.confirmLabel || 'Confirm';
      confirmModalEl.hidden = false;
      void confirmModalEl.offsetWidth;           // force reflow so the fade-in transitions
      confirmModalEl.classList.add('is-open');
      confirmModalCancel.focus();                // default focus on the safe (Cancel) button
    });
  }
  function closeConfirmModal(result) {
    confirmModalEl.classList.remove('is-open');
    setTimeout(function () {
      if (!confirmModalEl.classList.contains('is-open')) confirmModalEl.hidden = true;
    }, 170);                                     // let the fade-out finish before display:none
    const r = _confirmResolve; _confirmResolve = null;
    if (r) r(result);
  }
  confirmModalOk.addEventListener('click', function () { closeConfirmModal(true); });
  confirmModalCancel.addEventListener('click', function () { closeConfirmModal(false); });
  confirmModalEl.addEventListener('click', function (e) { if (e.target === confirmModalEl) closeConfirmModal(false); });
  document.addEventListener('keydown', function (e) {
    if (!confirmModalEl.hidden && e.key === 'Escape') closeConfirmModal(false);
  });

  async function renderDefaults() {
    const cp = await AdminStore.getDefaultCheckpoint();
    const hist = (await AdminStore.getDefaultHistory()) || [];
    if (cp) {
      defaultCurrent.innerHTML = 'Current Default: <strong>' + esc(cp.name || formatTs(cp.ts)) + '</strong>' + (cp.name ? ' · ' + esc(formatTs(cp.ts)) : '');
    } else {
      defaultCurrent.textContent = 'No Default checkpoint set yet — save one to create a protected baseline.';
    }
    restoreDefaultBtn.disabled = !cp;
    const cnt = defaultHistoryToggle.querySelector('.default-count');
    if (cnt) cnt.textContent = hist.length ? '(' + hist.length + ')' : '';
    defaultHistoryList.innerHTML = '';
    if (!hist.length) {
      defaultHistoryList.innerHTML = '<div class="manager-empty">No Default checkpoints saved yet.</div>';
    } else {
      hist.forEach(function (d) { defaultHistoryList.appendChild(buildDefaultRow(d)); });
    }
  }

  function buildDefaultRow(d) {
    const row = document.createElement('div');
    row.className = 'version-row';
    row.innerHTML =
      '<div class="version-info">' +
        '<span class="version-name">' + esc(d.name || formatTs(d.ts)) + '<span class="version-badge protected">Protected</span></span>' +
        '<span class="version-ts">' + esc(d.name ? formatTs(d.ts) : 'Default checkpoint') + '</span>' +
      '</div>' +
      '<div class="version-actions"><button class="btn btn-ghost btn-sm" data-act="restore">Restore this Default</button></div>';
    row.querySelector('[data-act="restore"]').addEventListener('click', function () { restoreDefault(d, false); });
    // TODO: allow deletion of old default checkpoints from backend only
    return row;   // note: no delete button — Default checkpoints are protected
  }

  saveDefaultBtn.addEventListener('click', async function () {
    if (!confirm('This will set the current site content as the new Default. The previous Default will be archived but not deleted. Continue?')) return;
    const name = prompt('Name this Default checkpoint (optional):', '');
    const cp = { id: 'd' + Date.now(), ts: Date.now(), name: (name && name.trim()) ? name.trim() : null, data: snapshotState() };
    // TODO: store default checkpoints in secure backend, not localStorage
    await AdminStore.saveDefaultCheckpoint(cp);
    const hist = (await AdminStore.getDefaultHistory()) || [];
    hist.unshift(cp);                         // kept forever — never auto-deleted
    await AdminStore.saveDefaultHistory(hist);
    renderDefaults();
    showToast('Default checkpoint saved');
  });

  async function restoreDefault(cp, isLast) {
    if (!cp) return;
    const message = isLast
      ? 'Restoring to Default will revert ALL site content to the last saved Default checkpoint. This cannot be undone unless you have a recent snapshot. Are you sure?'
      : 'Restoring to this Default will revert ALL site content to this Default checkpoint. This cannot be undone unless you have a recent snapshot. Are you sure?';
    const ok = await openConfirmModal({
      title: 'Restore Default?',
      message: message,
      confirmLabel: 'Yes, Restore Default',
    });
    if (!ok) return;
    const d = cp.data || {};
    // TODO: store default checkpoints in secure backend, not localStorage
    setOrRemove(CONTENT_KEYS.content, d.content);
    setOrRemove(CONTENT_KEYS.carousel, d.carousel);
    setOrRemove(CONTENT_KEYS.services, d.services);
    setOrRemove(CONTENT_KEYS.business, d.business);
    setOrRemove(CONTENT_KEYS.reviews, d.reviews);
    window.location.reload();
  }

  restoreDefaultBtn.addEventListener('click', async function () {
    restoreDefault(await AdminStore.getDefaultCheckpoint(), true);
  });

  defaultHistoryToggle.addEventListener('click', function () {
    const willOpen = defaultHistoryList.hidden;
    defaultHistoryList.hidden = !willOpen;
    defaultHistoryToggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  });

  /* ── Go ── */
  boot();
})();
