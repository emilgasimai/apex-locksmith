/* ============================================================================
   admin.js — Aston Admin panel controller
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
      // Role gate: this panel is administrators only. A dispatch JWT left in
      // sessionStorage (e.g. signed into both tools) must not open the admin.
      if (isDispatchSession(session)) {
        await AdminStore.clearSession();
        showLoginNotice('Access denied. Administrators only.');
        showLogin();
        return;
      }
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
  function isDispatchSession(session) {
    return !!session && session.role === 'dispatch';
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
    const btn = loginForm.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    const session = await AdminStore.login(loginUser.value.trim(), loginPass.value);
    if (btn) btn.disabled = false;
    if (session) {
      // Valid credentials, wrong tool: dispatch staff can't use the admin panel.
      if (isDispatchSession(session)) {
        await AdminStore.clearSession();
        loginError.textContent = 'Access denied. Administrators only.';
        loginError.hidden = false;
        loginPass.value = '';
        loginUser.focus();
        return;
      }
      enterDashboard();
    } else {
      loginError.textContent = AdminStore.lastLoginError === 'network'
        ? 'Cannot reach the server — check your connection and try again.'
        : 'Invalid username or password.';
      loginError.hidden = false;
      loginPass.value = '';
      loginPass.focus();
    }
  });

  // Backend session invalidated (401 on any admin API call) → back to login.
  window.addEventListener('admin:unauthorized', function () {
    doLogout('Your session expired — please sign in again.');
  });
  // Backend unreachable → make it loud, but let the admin keep working locally.
  window.addEventListener('admin:offline', function (e) {
    showToast((e.detail && e.detail.message) || 'Backend unreachable — working locally');
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
    AdminStore.getSession().then(function (s) {
      topbarUser.textContent = (s && (s.displayName || s.username)) || 'admin';
    });
    startSessionWatch();
    startDispatchBadge();
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
    if (dispatchBadgeTimer) { clearInterval(dispatchBadgeTimer); dispatchBadgeTimer = null; }
  }

  logoutBtn.addEventListener('click', function () { doLogout(); });

  /* ── Unsaved-changes guard ──
     Nothing is ever persisted to localStorage except via an explicit
     Apply/Save button (Content Editor APPLY, Business Info Save, Reviews
     Apply, version/Default actions). So a page refresh / tab close / external
     navigation simply drops all in-memory pending edits. Warn before that
     happens — but ONLY when something is actually pending. */
  function hasUnsavedChanges() {
    try { if (typeof isDirty === 'function' && isDirty()) return true; } catch (e) {}
    try { if (typeof bizDirty === 'function' && bizDirty()) return true; } catch (e) {}
    try { if (typeof reviewDirty === 'function' && reviewDirty()) return true; } catch (e) {}
    return false;
  }
  window.addEventListener('beforeunload', function (e) {
    if (!hasUnsavedChanges()) return;                  // clean → no prompt
    var msg = 'You have unsaved changes. If you leave, all changes will be lost.';
    e.preventDefault();
    e.returnValue = msg;   // modern browsers show their own generic text
    return msg;
  });

  /* ========================================================================
     4. SECTION ROUTING
     ===================================================================== */
  let currentView = 'dashboard';

  navList.addEventListener('click', function (e) {
    const btn = e.target.closest('.nav-item');
    if (!btn || !btn.dataset.view) return;
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
    if (view === 'dispatch-users') loadDispatchUsers();
    if (view === 'technicians') loadTechnicians();
    if (view === 'dispatch-board') { loadDispatchBoard(); clearDispatchBadge(); }
    if (view === 'dashboard') loadDashboard();
    if (view === 'revenue') loadRevenue(revPeriod);
  }

  /* ── Dispatch Control — embedded dispatch board ──
     Lazily point the iframe at /dispatch.html?embed=1 the first time the view
     is opened. In embed mode dispatch.js reuses this admin's JWT (shared
     same-origin sessionStorage), so there's no second login. */
  let dispatchFrameLoaded = false;
  function loadDispatchBoard() {
    if (dispatchFrameLoaded) return;
    const f = document.getElementById('dispatchFrame');
    if (f) { f.src = '/dispatch.html?embed=1'; dispatchFrameLoaded = true; }
  }

  /* ── Dispatch "new jobs" notification badge (sidebar) ──
     A small blue count next to "Dispatch Control" showing how many jobs were
     created since the admin last opened the board. The baseline timestamp lives
     in localStorage so it survives reloads; opening the board clears it. */
  const DISPATCH_SEEN_KEY = 'aston_admin_dispatch_seen';
  let dispatchBadgeTimer = null;

  function getDispatchSeen() {
    try { return parseInt(localStorage.getItem(DISPATCH_SEEN_KEY), 10) || 0; } catch (e) { return 0; }
  }
  function setDispatchSeen(ts) {
    try { localStorage.setItem(DISPATCH_SEEN_KEY, String(ts)); } catch (e) {}
  }
  function paintDispatchBadge(count) {
    const badge = document.getElementById('dispatchBadge');
    if (!badge) return;
    if (count > 0) { badge.textContent = count > 99 ? '99+' : String(count); badge.hidden = false; }
    else { badge.hidden = true; }
  }
  async function pollDispatchBadge() {
    // While the admin is actually on the board there's nothing "new" to flag.
    if (currentView === 'dispatch-board') { paintDispatchBadge(0); return; }
    let seen = getDispatchSeen();
    if (!seen) { seen = Date.now(); setDispatchSeen(seen); } // first run: baseline = now, so history isn't all "new"
    try {
      const s = await AdminStore.getSession();
      const res = await window.apiFetch('/api/dispatch?limit=50', { token: s && s.token });
      if (!res.ok || !res.data) return;
      const items = res.data.items || [];
      const count = items.filter(function (j) { return new Date(j.createdAt).getTime() > seen; }).length;
      paintDispatchBadge(count);
    } catch (e) { /* offline — leave the badge as it was */ }
  }
  function clearDispatchBadge() { setDispatchSeen(Date.now()); paintDispatchBadge(0); }
  function startDispatchBadge() {
    pollDispatchBadge();
    if (dispatchBadgeTimer) clearInterval(dispatchBadgeTimer);
    dispatchBadgeTimer = setInterval(pollDispatchBadge, 30000);
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
    '.about-overlay', '.about-vignette', '.zone-map-scanline', '.aston-txt-skip'
  ].join(', ');

  // Editor-only CSS injected into the iframe document.
  const EDITOR_CSS = `
    .aston-ed-hover { outline: 2px dashed rgba(39,224,245,.75) !important; outline-offset: 1px !important; cursor: pointer !important; }
    .aston-ed-selected { outline: 3px solid #27E0F5 !important; outline-offset: 1px !important; }
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
  const DEFAULTS = window.ASTON_DEFAULTS || {};
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
    let s = doc.getElementById('aston-editor-style');
    if (!s) {
      s = doc.createElement('style');
      s.id = 'aston-editor-style';
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
        if (p.classList.contains('aston-txt')) return NodeFilter.FILTER_REJECT;
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
      span.className = 'aston-txt';
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
    if (hoverEl && hoverEl !== el) hoverEl.classList.remove('aston-ed-hover');
    if (el && el !== selectedEl) { el.classList.add('aston-ed-hover'); hoverEl = el; }
    else hoverEl = null;
  }
  function onFrameOut() {
    if (hoverEl) { hoverEl.classList.remove('aston-ed-hover'); hoverEl = null; }
  }

  function selectTarget(target) {
    if (selectedEl) selectedEl.classList.remove('aston-ed-selected');
    if (hoverEl) { hoverEl.classList.remove('aston-ed-hover'); hoverEl = null; }
    selectedEl = target.el;
    selectedEl.classList.add('aston-ed-selected');

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
    if (selectedEl) { selectedEl.classList.remove('aston-ed-selected'); selectedEl = null; }
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
      if (w && w.ASTON_PATCH && w.ASTON_PATCH.syncContentKey) { try { w.ASTON_PATCH.syncContentKey(key, v); } catch (e) {} }
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
      if (w && w.ASTON_PATCH && w.ASTON_PATCH.syncContentKey) { try { w.ASTON_PATCH.syncContentKey(key, v); } catch (e) {} }
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

  // Image file upload → POST /api/upload, save the returned URL. Falls back
  // to an inline base64 data URL (with a warning) if the upload fails.
  editImageFile.addEventListener('change', async function () {
    if (!active || active.kind !== 'image') return;
    const file = editImageFile.files && editImageFile.files[0];
    if (!file) return;
    const path = active.path, type = entryType(active);
    const up = await AdminStore.uploadImage(file);
    if (up.ok) {
      editImageUrl.value = up.url;
      setPreview(up.url);
      commitEdit(path, type, up.url);
      return;
    }
    showToast('Upload unavailable — image stored inline for now');
    const reader = new FileReader();
    reader.onload = function () {
      const dataUrl = String(reader.result);
      editImageUrl.value = '';
      setPreview(dataUrl);
      commitEdit(path, type, dataUrl);
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

  // Apply persists ALL channels in ONE bulk PUT /api/content, then reloads
  // the iframe so it re-renders pristinely from storage via content-patch.js.
  applyBtn.addEventListener('click', async function () {
    applyBtn.disabled = true;
    const partial = {
      content: pending,
      carousel: pendingCarousel,
      services: pendingServices,
      menu: pendingMenu
    };
    // Fold inline shared-value edits into the single source (business info).
    if (Object.keys(pendingShared).length) {
      const biz = readStoreSync('apex_admin_business_v1', null) || clone(DEFAULTS.business || {});
      Object.keys(pendingShared).forEach(function (k) { const f = SHARED_FIELDS[k]; if (f) biz[f] = pendingShared[k]; });
      if (pendingShared['phone-number'] != null) {
        const digits = String(pendingShared['phone-number']).replace(/\D/g, '');
        const norm = digits ? (digits.length === 10 ? '1' + digits : digits) : '';
        biz.phoneTel = norm ? '+' + norm : ''; biz.whatsapp = norm;
      }
      partial.business = biz;
    }
    const res = await AdminStore.saveBundle(partial);
    saved = clone(pending);
    savedCarousel = clone(pendingCarousel);
    savedServices = clone(pendingServices);
    savedMenu = clone(pendingMenu);
    pendingShared = {};
    history = [];
    sessionStarted = false;
    if (res && res.remote) await recordSnapshot();   // snapshot only when it reached the backend
    reloadFrame();
    refreshControls();
    showToast(res && res.remote === false
      ? (res.message || 'Backend unreachable — changes saved locally only')
      : 'Changes applied & saved');
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

  /* ── Collapsible mode switcher (mobile) ──
     The 2×2 tool grid eats vertical space on phones, leaving little room to
     edit in the preview. So on mobile it collapses behind a compact button
     that shows the current tool; tapping reveals the grid, and choosing a tool
     auto-collapses it. Desktop always shows the grid (the toggle is hidden). */
  const editorToolbar = document.querySelector('.editor-toolbar');
  const modeToggle    = document.getElementById('modeToggle');
  const modeToggleLabel = document.getElementById('modeToggleLabel');

  function setModesOpen(open) {
    if (!editorToolbar) return;
    editorToolbar.classList.toggle('modes-open', open);
    if (modeToggle) modeToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (modeToggle) {
    modeToggle.addEventListener('click', function () {
      setModesOpen(!editorToolbar.classList.contains('modes-open'));
    });
  }

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
    // Reflect the chosen tool in the toggle, then collapse so the preview
    // gets the full screen (mobile). No-op visually on desktop.
    const activeBtn = document.querySelector('.ed-mode[data-mode="' + mode + '"]');
    if (modeToggleLabel && activeBtn) modeToggleLabel.textContent = activeBtn.textContent.trim();
    setModesOpen(false);
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
    if (w && w.ASTON_PATCH && w.ASTON_PATCH.syncContentKey) { try { w.ASTON_PATCH.syncContentKey(key, value); } catch (e) {} }
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
      if (!w || !w.ASTON_PATCH) return;
      try {
        w.ASTON_PATCH.renderCarousel(pendingCarousel);
        w.ASTON_PATCH.applyBusiness(readStoreSync('apex_admin_business_v1', DEFAULTS.business));
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
        inp.addEventListener('change', async function () {
          const file = inp.files && inp.files[0];
          if (!file) return;
          // Upload to the backend first; keep the returned URL in the card.
          const up = await AdminStore.uploadImage(file);
          if (up.ok) {
            pendingCarousel[i].image = up.url;
            thumb.style.backgroundImage = "url('" + cssUrl(up.url) + "')";
            const urlInp = wrap.querySelector('input[data-field="image"]');
            if (urlInp) urlInp.value = up.url;
            previewCarousel(true); refreshControls();
            return;
          }
          showToast('Upload unavailable — image stored inline for now');
          const reader = new FileReader();
          reader.onload = function () {
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
    if (w && typeof w.__astonSetServices === 'function') {
      try { w.__astonSetServices(pendingServices); } catch (e) {}
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
    if (w && w.ASTON_PATCH) { try { w.ASTON_PATCH.applyBusiness(readBizInputs()); } catch (e) {} }
  }
  bizInputs.forEach(function (inp) {
    inp.addEventListener('input', function () { previewBusiness(); refreshBizControls(); });
  });
  bizSaveBtn.addEventListener('click', async function () {
    const b = readBizInputs();
    const res = await AdminStore.saveBusinessInfo(b);
    bizSaved = clone(b);
    previewBusiness();
    refreshBizControls();
    if (res && res.remote) await recordSnapshot();
    showToast(res && res.remote === false
      ? (res.message || 'Backend unreachable — business info saved locally only')
      : 'Business info saved');
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
    if (w && w.ASTON_PATCH) { try { w.ASTON_PATCH.renderReviews(pendingReviews); } catch (e) {} }
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
    const res = await AdminStore.saveReviews(pendingReviews);
    savedReviews = clone(pendingReviews);
    previewReviews();
    refreshReviewControls();
    if (res && res.remote) await recordSnapshot();
    showToast(res && res.remote === false
      ? (res.message || 'Backend unreachable — reviews saved locally only')
      : 'Reviews saved');
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
     Every Apply/Save records a snapshot on the BACKEND
     (POST /api/content/snapshots); restore goes through the backend too.
     ===================================================================== */
  const versionList = document.getElementById('versionList');

  function formatTs(ts) {
    const d = new Date(ts);
    const date = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return date + ' — ' + time;
  }

  // Called after every successful Apply / Save — the backend stores the
  // snapshot (capping/retention is the server's job now).
  async function recordSnapshot() {
    const ok = await AdminStore.createSnapshot(null);
    if (!ok) showToast('Snapshot not recorded — backend unreachable');
    if (currentView === 'versions') loadVersions();
  }

  async function loadVersions() {
    const list = await AdminStore.getVersions();
    if (list == null) {
      versionList.innerHTML = '<div class="manager-empty">Backend unreachable — version history is unavailable right now.</div>';
    } else {
      renderVersionList(list);
    }
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
        '<button class="btn btn-danger btn-sm" data-act="delete">Delete</button>' +
        '<button class="btn btn-primary btn-sm" data-act="restore">Restore</button>' +
      '</div>';
    row.querySelector('[data-act="rename"]').addEventListener('click', function () { renameVersion(v); });
    row.querySelector('[data-act="delete"]').addEventListener('click', function () { deleteVersion(v); });
    row.querySelector('[data-act="restore"]').addEventListener('click', function () { restoreVersion(v.id); });
    return row;
  }

  async function renameVersion(v) {
    const next = prompt('New name for this version:', v.name || '');
    if (next === null) return;          // cancelled
    const label = next.trim();
    if (!label) { showToast('Name cannot be empty'); return; }
    const ok = await AdminStore.renameSnapshot(v.id, label);
    if (!ok) { showToast('Rename failed — backend unreachable'); return; }
    showToast('Version renamed');
    loadVersions();
  }

  async function deleteVersion(v) {
    const what = v.name ? '"' + v.name + '"' : 'this version';
    if (!confirm('Delete ' + what + ' permanently? This cannot be undone.')) return;
    const res = await AdminStore.deleteSnapshot(v.id);
    if (!res.ok) {
      showToast(res.status === 403
        ? (res.message || 'This version is protected and cannot be deleted')
        : 'Delete failed — backend unreachable');
      return;
    }
    showToast('Version deleted');
    loadVersions();
  }

  async function restoreVersion(id) {
    if (!confirm('Restore site to this version? Current unsaved changes will be lost.')) return;
    const ok = await AdminStore.restoreSnapshot(id);
    if (!ok) { showToast('Restore failed — backend unreachable'); return; }
    // A full reload re-initialises the editor + preview iframe cleanly from the
    // restored (and freshly mirrored) state.
    window.location.reload();
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
    } else if (AdminStore.isOffline && AdminStore.isOffline()) {
      defaultCurrent.textContent = 'Backend unreachable — Default checkpoint status unknown.';
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
    if (!confirm('This will set the current site content as the Default checkpoint, REPLACING the previous one. Continue?')) return;
    const name = prompt('Name this Default checkpoint (optional):', '');
    if (name === null) return; // cancelled
    // The backend keeps exactly ONE protected default snapshot (upsert) — it
    // can never be deleted through the API, only overwritten here.
    const ok = await AdminStore.saveDefaultCheckpoint((name && name.trim()) ? name.trim() : null);
    if (!ok) { showToast('Backend unreachable — Default checkpoint NOT saved'); return; }
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
    const restored = await AdminStore.restoreSnapshot(cp.id);
    if (!restored) { showToast('Restore failed — backend unreachable'); return; }
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

  /* ========================================================================
     10. PEOPLE MANAGEMENT — Dispatch users + Technicians
     Live database operations (admin only). No Apply/staging: each create,
     toggle, edit and delete hits the backend immediately. Backend validation
     messages are surfaced inline / via toast.
     ===================================================================== */

  // ── Dispatch users ──
  const dispatchUserList = document.getElementById('dispatchUserList');
  const dispatchUserForm = document.getElementById('dispatchUserForm');
  const duFirst = document.getElementById('duFirst');
  const duLast  = document.getElementById('duLast');
  const duUser  = document.getElementById('duUser');
  const duPass  = document.getElementById('duPass');
  const duPass2 = document.getElementById('duPass2');
  const duErr   = document.getElementById('duErr');
  const duAddBtn = document.getElementById('duAddBtn');
  const duNotice = document.getElementById('duNotice');

  function peopleSwitchHtml(active) {
    return '<label class="people-switch" title="Toggle active">' +
      '<input type="checkbox" data-act="active"' + (active ? ' checked' : '') + '/>' +
      '<span class="people-switch-track"><span class="people-switch-thumb"></span></span>' +
      '<span class="people-switch-label">' + (active ? 'Active' : 'Inactive') + '</span>' +
    '</label>';
  }

  async function loadDispatchUsers() {
    dispatchUserList.innerHTML = '<div class="manager-empty">Loading…</div>';
    duNotice.hidden = true;
    const users = await AdminStore.listUsers();
    if (users == null) {
      dispatchUserList.innerHTML = '<div class="manager-empty">Backend unreachable — can’t load dispatch users right now.</div>';
      return;
    }
    const dispatch = users.filter(function (u) { return u.role === 'dispatch'; });
    dispatchUserList.innerHTML = '';
    if (!dispatch.length) {
      dispatchUserList.innerHTML = '<div class="manager-empty">No dispatch users yet. Add one below.</div>';
      return;
    }
    dispatch.forEach(function (u) { dispatchUserList.appendChild(buildDispatchUserRow(u)); });
  }

  function buildDispatchUserRow(u) {
    const id = u.id || u._id;
    const name = u.displayName || u.username;
    const row = document.createElement('div');
    row.className = 'people-row';
    row.setAttribute('data-id', id);
    row.innerHTML =
      '<div class="people-main">' +
        '<span class="people-name">' + esc(name) + '</span>' +
        '<span class="people-sub">@' + esc(u.username) + '</span>' +
      '</div>' +
      peopleSwitchHtml(u.active) +
      '<div class="people-actions">' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="pass">Password</button>' +
        '<button type="button" class="btn btn-danger btn-sm" data-act="del">Delete</button>' +
      '</div>' +
      '<form class="people-inline" data-pass-form hidden autocomplete="off">' +
        '<input type="password" data-f="p1" placeholder="New password" autocomplete="new-password"/>' +
        '<input type="password" data-f="p2" placeholder="Confirm password" autocomplete="new-password"/>' +
        '<button type="submit" class="btn btn-primary btn-sm">Save</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="pass-cancel">Cancel</button>' +
        '<span class="people-inline-err" data-pass-err hidden></span>' +
      '</form>';

    const cb = row.querySelector('[data-act="active"]');
    cb.addEventListener('change', async function () {
      cb.disabled = true;
      const res = await AdminStore.updateUser(id, { active: cb.checked });
      cb.disabled = false;
      if (!res.ok) { cb.checked = !cb.checked; showToast(res.message || 'Could not update — try again'); return; }
      row.querySelector('.people-switch-label').textContent = cb.checked ? 'Active' : 'Inactive';
      showToast('User ' + (cb.checked ? 'activated' : 'deactivated'));
    });

    const passForm = row.querySelector('[data-pass-form]');
    const passErr  = passForm.querySelector('[data-pass-err]');
    row.querySelector('[data-act="pass"]').addEventListener('click', function () {
      passForm.hidden = !passForm.hidden;
      passErr.hidden = true;
      if (!passForm.hidden) passForm.querySelector('[data-f="p1"]').focus();
    });
    row.querySelector('[data-act="pass-cancel"]').addEventListener('click', function () {
      passForm.hidden = true; passForm.reset(); passErr.hidden = true;
    });
    passForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      passErr.hidden = true;
      const p1 = passForm.querySelector('[data-f="p1"]').value;
      const p2 = passForm.querySelector('[data-f="p2"]').value;
      if (p1.length < 8) { passErr.textContent = 'Min 8 characters'; passErr.hidden = false; return; }
      if (p1 !== p2)     { passErr.textContent = 'Passwords do not match'; passErr.hidden = false; return; }
      const res = await AdminStore.updateUser(id, { password: p1 });
      if (!res.ok) { passErr.textContent = res.message || 'Could not update'; passErr.hidden = false; return; }
      passForm.hidden = true; passForm.reset();
      showToast('Password updated for ' + name);
    });

    row.querySelector('[data-act="del"]').addEventListener('click', async function () {
      if (!confirm('Delete dispatch user "' + name + '"? This cannot be undone.')) return;
      const res = await AdminStore.deleteUser(id);
      if (!res.ok) { showToast(res.message || 'Could not delete — try again'); return; }
      showToast('Dispatch user deleted');
      loadDispatchUsers();
    });
    return row;
  }

  function showDuErr(msg) { duErr.textContent = msg; duErr.hidden = false; }
  if (dispatchUserForm) {
    dispatchUserForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      duErr.hidden = true;
      const first = duFirst.value.trim(), last = duLast.value.trim();
      const username = duUser.value.trim(), p1 = duPass.value, p2 = duPass2.value;
      if (!first || !last) return showDuErr('Enter the first and last name');
      if (username.length < 3) return showDuErr('Username must be at least 3 characters');
      if (!/^[a-zA-Z0-9._-]+$/.test(username)) return showDuErr('Username: letters, numbers, dots, dashes, underscores only');
      if (p1.length < 8) return showDuErr('Password must be at least 8 characters');
      if (p1 !== p2) return showDuErr('Passwords do not match');
      duAddBtn.disabled = true;
      const res = await AdminStore.createUser({
        username: username, password: p1, role: 'dispatch', displayName: (first + ' ' + last).trim(),
      });
      duAddBtn.disabled = false;
      if (!res.ok) return showDuErr(res.message || (res.status === 409 ? 'Username already taken' : 'Could not create user'));
      dispatchUserForm.reset();
      showToast('Dispatch user added');
      loadDispatchUsers();
    });
  }

  // ── Technicians ──
  const techList  = document.getElementById('techList');
  const techForm  = document.getElementById('techForm');
  const tcFirst = document.getElementById('tcFirst');
  const tcLast  = document.getElementById('tcLast');
  const tcPhone = document.getElementById('tcPhone');
  const tcEmail = document.getElementById('tcEmail');
  const tcNotes = document.getElementById('tcNotes');
  const tcUsername = document.getElementById('tcUsername');
  const tcPassword = document.getElementById('tcPassword');
  const tcErr   = document.getElementById('tcErr');
  const tcAddBtn = document.getElementById('tcAddBtn');
  const PHONE_RE = /^[0-9+()\-.\s]{7,30}$/;

  async function loadTechnicians() {
    techList.innerHTML = '<div class="manager-empty">Loading…</div>';
    const techs = await AdminStore.listTechnicians();
    if (techs == null) {
      techList.innerHTML = '<div class="manager-empty">Backend unreachable — can’t load technicians right now.</div>';
      return;
    }
    techList.innerHTML = '';
    if (!techs.length) {
      techList.innerHTML = '<div class="manager-empty">No technicians yet. Add one below.</div>';
      return;
    }
    techs.forEach(function (t) { techList.appendChild(buildTechRow(t)); });
  }

  function buildTechRow(t) {
    const id = t.id || t._id;
    const name = ((t.firstName || '') + ' ' + (t.lastName || '')).trim();
    const row = document.createElement('div');
    row.className = 'people-row';
    row.setAttribute('data-id', id);
    var statusDot = '<span class="tech-status-dot" data-status="' + attr(t.status || 'offline') + '" title="' + attr(t.status || 'offline') + '"></span>';
    row.innerHTML =
      '<div class="people-main">' +
        '<span class="people-name">' + statusDot + esc(name) + '</span>' +
        '<span class="people-sub">' + esc(t.phone || '') + (t.email ? ' · ' + esc(t.email) : '') + (t.username ? ' · @' + esc(t.username) : '') + '</span>' +
      '</div>' +
      peopleSwitchHtml(t.active) +
      '<div class="people-actions">' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="edit">Edit</button>' +
        '<button type="button" class="btn btn-danger btn-sm" data-act="del">Delete</button>' +
      '</div>' +
      '<form class="people-inline people-inline-edit" data-edit-form hidden autocomplete="off">' +
        '<input type="text" data-f="firstName" value="' + attr(t.firstName || '') + '" placeholder="First name"/>' +
        '<input type="text" data-f="lastName" value="' + attr(t.lastName || '') + '" placeholder="Last name"/>' +
        '<input type="tel" data-f="phone" value="' + attr(t.phone || '') + '" placeholder="Phone"/>' +
        '<input type="email" data-f="email" value="' + attr(t.email || '') + '" placeholder="Email (optional)"/>' +
        '<input type="text" data-f="notes" value="' + attr(t.notes || '') + '" placeholder="Notes (optional)"/>' +
        '<input type="text" data-f="username" value="' + attr(t.username || '') + '" placeholder="Username (portal login)" spellcheck="false"/>' +
        '<input type="password" data-f="password" value="" placeholder="New password (leave blank to keep)" autocomplete="new-password"/>' +
        '<div class="people-inline-foot">' +
          '<span class="people-inline-err" data-edit-err hidden></span>' +
          '<button type="submit" class="btn btn-primary btn-sm">Save</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-act="edit-cancel">Cancel</button>' +
        '</div>' +
      '</form>';

    const cb = row.querySelector('[data-act="active"]');
    cb.addEventListener('change', async function () {
      cb.disabled = true;
      const res = await AdminStore.updateTechnician(id, { active: cb.checked });
      cb.disabled = false;
      if (!res.ok) { cb.checked = !cb.checked; showToast(res.message || 'Could not update'); return; }
      row.querySelector('.people-switch-label').textContent = cb.checked ? 'Active' : 'Inactive';
      showToast('Technician ' + (cb.checked ? 'activated' : 'deactivated'));
    });

    const editForm = row.querySelector('[data-edit-form]');
    const editErr  = editForm.querySelector('[data-edit-err]');
    row.querySelector('[data-act="edit"]').addEventListener('click', function () {
      editForm.hidden = !editForm.hidden;
      editErr.hidden = true;
      if (!editForm.hidden) editForm.querySelector('[data-f="firstName"]').focus();
    });
    row.querySelector('[data-act="edit-cancel"]').addEventListener('click', function () { editForm.hidden = true; editErr.hidden = true; });
    editForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      editErr.hidden = true;
      const firstName = editForm.querySelector('[data-f="firstName"]').value.trim();
      const lastName  = editForm.querySelector('[data-f="lastName"]').value.trim();
      const phone     = editForm.querySelector('[data-f="phone"]').value.trim();
      const email     = editForm.querySelector('[data-f="email"]').value.trim();
      const notes     = editForm.querySelector('[data-f="notes"]').value.trim();
      const username  = editForm.querySelector('[data-f="username"]').value.trim();
      const newPassword = editForm.querySelector('[data-f="password"]').value;
      if (!firstName || !lastName) { editErr.textContent = 'First and last name required'; editErr.hidden = false; return; }
      if (!PHONE_RE.test(phone))   { editErr.textContent = 'Enter a valid phone number'; editErr.hidden = false; return; }
      const payload = { firstName: firstName, lastName: lastName, phone: phone, notes: notes };
      if (email) payload.email = email;
      if (username) payload.username = username;
      if (newPassword) payload.password = newPassword;
      const res = await AdminStore.updateTechnician(id, payload);
      if (!res.ok) { editErr.textContent = res.message || 'Could not save'; editErr.hidden = false; return; }
      showToast('Technician updated');
      loadTechnicians();
    });

    row.querySelector('[data-act="del"]').addEventListener('click', async function () {
      if (!confirm('Delete technician "' + name + '"? This cannot be undone.')) return;
      const res = await AdminStore.deleteTechnician(id);
      if (!res.ok) { showToast(res.message || 'Could not delete'); return; }
      showToast('Technician deleted');
      loadTechnicians();
    });
    return row;
  }

  function showTcErr(msg) { tcErr.textContent = msg; tcErr.hidden = false; }
  if (techForm) {
    techForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      tcErr.hidden = true;
      const firstName = tcFirst.value.trim(), lastName = tcLast.value.trim();
      const phone = tcPhone.value.trim(), email = tcEmail.value.trim(), notes = tcNotes.value.trim();
      const username = tcUsername ? tcUsername.value.trim() : '';
      const password = tcPassword ? tcPassword.value : '';
      if (!firstName || !lastName) return showTcErr('Enter the first and last name');
      if (!PHONE_RE.test(phone)) return showTcErr('Enter a valid phone number');
      const payload = { firstName: firstName, lastName: lastName, phone: phone };
      if (email) payload.email = email;
      if (notes) payload.notes = notes;
      if (username) payload.username = username;
      if (password) payload.password = password;
      tcAddBtn.disabled = true;
      const res = await AdminStore.createTechnician(payload);
      tcAddBtn.disabled = false;
      if (!res.ok) return showTcErr(res.message || 'Could not add technician');
      techForm.reset();
      showToast('Technician added');
      loadTechnicians();
    });
  }

  /* ========================================================================
     11. DASHBOARD / REVENUE / EXPORT
     ===================================================================== */
  const DASH_STATUS_LABEL = {
    'pending-review': 'Pending Review', 'approved': 'Approved', 'assigned': 'Assigned',
    'in-progress': 'In Progress', 'completed': 'Completed', 'cancelled': 'Cancelled',
  };
  function money(n) {
    if (n == null || isNaN(n)) return '$0.00';
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function timeAgo(iso) {
    const t = new Date(iso).getTime();
    if (!t) return '';
    const s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60); if (m < 60) return m + ' min ago';
    const h = Math.floor(m / 60); if (h < 24) return h + ' h ago';
    const d = Math.floor(h / 24); if (d < 7) return d + ' d ago';
    return new Date(t).toLocaleDateString();
  }
  function statCard(value, label, opts) {
    opts = opts || {};
    return '<div class="stat-card' + (opts.cls ? ' ' + opts.cls : '') + '">' +
      '<span class="stat-card-num">' + esc(String(value)) + '</span>' +
      '<span class="stat-card-label">' + esc(label) + '</span>' +
    '</div>';
  }
  function statGroup(title, cardsHtml) {
    return '<div class="stat-group"><div class="stat-group-title">' + esc(title) + '</div>' +
      '<div class="stat-group-cards">' + cardsHtml + '</div></div>';
  }

  // ── Dashboard (analytics) ──
  const dashSummary    = document.getElementById('dashSummary');
  const dashAttention  = document.getElementById('dashAttention');
  const techWorkload   = document.getElementById('techWorkload');
  const sourceList     = document.getElementById('sourceList');
  const statusLegend   = document.getElementById('statusLegend');
  const recentList     = document.getElementById('recentList');
  const dashError      = document.getElementById('dashError');
  const dashRefreshBtn = document.getElementById('dashRefreshBtn');
  const dashPeriod     = document.getElementById('dashPeriod');
  const dashRange      = document.getElementById('dashRange');
  const dashFrom       = document.getElementById('dashFrom');
  const dashTo         = document.getElementById('dashTo');
  const dashRangeApply = document.getElementById('dashRangeApply');

  let chartPeriod = 'month';            // 'week' | 'month' | 'custom'
  let chartRange  = { from: null, to: null };
  const charts = { jobs: null, revenue: null, status: null }; // live Chart.js instances
  const hasChart = function () { return typeof window.Chart !== 'undefined'; };

  // Theme-harmonized palette (dark + cyan). Urgency in muted warm tones.
  const C = {
    accent: '#27e0f5', accentSoft: 'rgba(39,224,245,.20)',
    ok: '#5cd97a', ink: '#ededed', muted: '#9a9a9a', grid: 'rgba(255,255,255,.06)',
    tip: '#1d1d1f', tipLine: '#3a3a3e', panel: '#242427',
  };
  const STATUS_COLORS = {
    'pending-review': '#f4c20a', 'approved': '#7ee2e8', 'assigned': '#60a0ff',
    'in-progress': '#ff9f1c', 'completed': '#5cd97a', 'cancelled': '#ff5d5d',
  };
  const SOURCE_LABEL = { quote: 'Quote', contact: 'Contact', call: 'Call', note: 'Note', manual: 'Manual' };

  if (hasChart()) {
    Chart.defaults.color = C.muted;
    Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
    Chart.defaults.font.size = 11;
  }

  function isoDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  // 'YYYY-MM-DD' → 'Jun 17'
  function fmtDayLabel(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    if (!m) return String(s || '');
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  // Hour buckets ('…THH:00') → '2 PM'; otherwise fall back to the day label.
  function fmtLabel(s) {
    const hm = /T(\d{2}):/.exec(String(s || ''));
    if (!hm) return fmtDayLabel(s);
    const h = Number(hm[1]);
    const hr = (h % 12) || 12;
    return hr + (h < 12 ? ' AM' : ' PM');
  }

  async function loadDashboard() {
    dashError.hidden = true;
    const d = await AdminStore.getDashboardSummary();
    if (!d) {
      dashError.hidden = false;
      dashError.textContent = 'Backend unreachable — dashboard metrics are unavailable right now.';
      dashSummary.innerHTML = '<div class="manager-empty">No data</div>';
      dashAttention.innerHTML = '';
      techWorkload.innerHTML = '';
      sourceList.innerHTML = '<li class="manager-empty">No data</li>';
      recentList.innerHTML = '';
      return;
    }
    renderSummary(d);
    renderAttention(d);
    renderRecent(d.recentActivity || []);
    // Independent sections — fire in parallel; each degrades to "No data" on its own.
    loadCharts();
    loadStatusBreakdown();
    loadSourceBreakdown();
    loadTechWorkload();
  }

  // 1 — Today summary cards (big number + day-over-day trend arrow).
  function renderSummary(d) {
    const t = d.today || {};
    dashSummary.innerHTML =
      sumCard(t.newJobs != null ? t.newJobs : 0, 'New jobs today', 'is-accent', 'jobs') +
      sumCard(t.completedJobs != null ? t.completedJobs : 0, 'Completed today', 'is-ok', '') +
      sumCard(money(t.revenue), 'Revenue today', 'is-ok', 'revenue');
  }
  function sumCard(num, label, cls, trendKey) {
    return '<div class="sum-card ' + cls + '">' +
      '<div class="sum-card-top">' +
        '<span class="sum-num">' + esc(String(num)) + '</span>' +
        '<span class="sum-trend" data-trend="' + esc(trendKey || '') + '"></span>' +
      '</div>' +
      '<span class="sum-label">' + esc(label) + '</span>' +
    '</div>';
  }
  function setTrend(key, ts) {
    const el = dashSummary.querySelector('[data-trend="' + key + '"]');
    if (!el) return;
    const v = ts && Array.isArray(ts.values) ? ts.values : null;
    if (!v || v.length < 2) { el.innerHTML = ''; return; }
    const vs = ts && ts.period === 'day' ? 'vs. previous hour' : 'vs. previous day';
    const curr = v[v.length - 1], prev = v[v.length - 2];
    if (curr > prev) el.innerHTML = '<span class="trend up" title="' + vs + '">▲</span>';
    else if (curr < prev) el.innerHTML = '<span class="trend down" title="' + vs + '">▼</span>';
    else el.innerHTML = '<span class="trend flat" title="' + vs + '">–</span>';
  }

  // 4 — Needs attention cards.
  function renderAttention(d) {
    dashAttention.innerHTML =
      attnCard(d.pendingReviewJobs, 'Pending review', 'warn') +
      attnCard(d.inProgressJobs, 'In progress', 'prog') +
      attnCard(d.newContacts, 'Unread contacts', 'accent') +
      attnCard(d.pendingReviews, 'Pending reviews', 'muted');
  }
  function attnCard(n, label, tone) {
    return '<div class="attn-card attn-' + tone + '">' +
      '<span class="attn-num">' + esc(String(n != null ? n : 0)) + '</span>' +
      '<span class="attn-label">' + esc(label) + '</span>' +
    '</div>';
  }

  // 2 — Trend charts (jobs bar + revenue line). Re-fetch + redraw on period change.
  async function loadCharts() {
    const jobsEmpty = document.getElementById('jobsEmpty');
    const revEmpty  = document.getElementById('revenueEmpty');
    const period = chartPeriod === 'custom' ? null : chartPeriod;
    const from = chartPeriod === 'custom' ? chartRange.from : null;
    const to   = chartPeriod === 'custom' ? chartRange.to : null;
    const [jobsTs, revTs] = await Promise.all([
      AdminStore.getTimeseries('jobs', period, from, to),
      AdminStore.getTimeseries('revenue', period, from, to),
    ]);
    drawBar('jobs', 'jobsChart', jobsEmpty, jobsTs);
    drawLine('revenue', 'revenueChart', revEmpty, revTs);
    setTrend('jobs', jobsTs);
    setTrend('revenue', revTs);
  }

  function destroyChart(key) { if (charts[key]) { try { charts[key].destroy(); } catch (e) {} charts[key] = null; } }
  function showEmpty(el, msg) { if (el) { el.hidden = false; el.textContent = msg || 'No data'; } }
  function hideEmpty(el) { if (el) el.hidden = true; }
  function isBlank(ts) {
    return !ts || !Array.isArray(ts.values) || !ts.values.length ||
      ts.values.every(function (x) { return !x; });
  }

  function chartAxes(isRevenue) {
    return {
      responsive: true, maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: C.tip, borderColor: C.tipLine, borderWidth: 1,
          titleColor: C.ink, bodyColor: C.ink, padding: 10, displayColors: false,
          callbacks: isRevenue ? { label: function (c) { return money(c.parsed.y); } } : {},
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: C.muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
        y: {
          beginAtZero: true, grid: { color: C.grid, drawBorder: false },
          ticks: { color: C.muted, precision: 0, callback: isRevenue ? function (v) { return '$' + v; } : undefined },
        },
      },
    };
  }

  function drawBar(key, canvasId, emptyEl, ts) {
    destroyChart(key);
    if (!hasChart()) { showEmpty(emptyEl, 'Charts unavailable'); return; }
    if (isBlank(ts)) { showEmpty(emptyEl); return; }
    hideEmpty(emptyEl);
    charts[key] = new Chart(document.getElementById(canvasId), {
      type: 'bar',
      data: { labels: ts.labels.map(fmtLabel), datasets: [{
        data: ts.values, backgroundColor: C.accentSoft, hoverBackgroundColor: C.accent,
        borderColor: C.accent, borderWidth: 1, borderRadius: 3, maxBarThickness: 28,
      }] },
      options: chartAxes(false),
    });
  }

  function drawLine(key, canvasId, emptyEl, ts) {
    destroyChart(key);
    if (!hasChart()) { showEmpty(emptyEl, 'Charts unavailable'); return; }
    if (isBlank(ts)) { showEmpty(emptyEl); return; }
    hideEmpty(emptyEl);
    const cv = document.getElementById(canvasId);
    let fill = 'rgba(92,217,122,.14)';
    try {
      const g = cv.getContext('2d').createLinearGradient(0, 0, 0, cv.clientHeight || 220);
      g.addColorStop(0, 'rgba(92,217,122,.30)'); g.addColorStop(1, 'rgba(92,217,122,0)');
      fill = g;
    } catch (e) {}
    charts[key] = new Chart(cv, {
      type: 'line',
      data: { labels: ts.labels.map(fmtLabel), datasets: [{
        data: ts.values, borderColor: C.ok, backgroundColor: fill, fill: true,
        tension: .35, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4,
        pointBackgroundColor: C.ok, pointHoverBackgroundColor: C.ok,
      }] },
      options: chartAxes(true),
    });
  }

  // 3a — Status donut + legend.
  async function loadStatusBreakdown() {
    const emptyEl = document.getElementById('statusEmpty');
    const data = await AdminStore.getStatusBreakdown();
    destroyChart('status');
    statusLegend.innerHTML = '';
    if (!data) { showEmpty(emptyEl); return; }
    const entries = Object.keys(STATUS_COLORS)
      .map(function (k) { return { label: DASH_STATUS_LABEL[k] || k, val: data[k] || 0, color: STATUS_COLORS[k] }; })
      .filter(function (e) { return e.val > 0; });
    const total = entries.reduce(function (a, e) { return a + e.val; }, 0);
    if (!total) { showEmpty(emptyEl); return; }

    if (hasChart()) {
      hideEmpty(emptyEl);
      charts.status = new Chart(document.getElementById('statusChart'), {
        type: 'doughnut',
        data: { labels: entries.map(function (e) { return e.label; }), datasets: [{
          data: entries.map(function (e) { return e.val; }),
          backgroundColor: entries.map(function (e) { return e.color; }),
          borderColor: C.panel, borderWidth: 2, hoverOffset: 5,
        }] },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '64%',
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: C.tip, borderColor: C.tipLine, borderWidth: 1,
              titleColor: C.ink, bodyColor: C.ink, padding: 10,
              callbacks: { label: function (c) {
                return c.label + ': ' + c.parsed + ' (' + Math.round(c.parsed / total * 100) + '%)';
              } },
            },
          },
        },
      });
    } else {
      showEmpty(emptyEl, 'Charts unavailable'); // legend still renders below
    }

    statusLegend.innerHTML = entries.map(function (e) {
      return '<li class="legend-item">' +
        '<span class="legend-dot" style="background:' + e.color + '"></span>' +
        '<span class="legend-label">' + esc(e.label) + '</span>' +
        '<span class="legend-val">' + e.val + ' · ' + Math.round(e.val / total * 100) + '%</span>' +
      '</li>';
    }).join('');
  }

  // 3b — Source breakdown (stat list with proportional bars).
  async function loadSourceBreakdown() {
    const data = await AdminStore.getSourceBreakdown();
    if (!data) { sourceList.innerHTML = '<li class="manager-empty">No data</li>'; return; }
    const entries = Object.keys(SOURCE_LABEL).map(function (k) { return { label: SOURCE_LABEL[k], val: data[k] || 0 }; });
    const max = entries.reduce(function (a, e) { return Math.max(a, e.val); }, 0);
    const total = entries.reduce(function (a, e) { return a + e.val; }, 0);
    if (!total) { sourceList.innerHTML = '<li class="manager-empty">No data</li>'; return; }
    sourceList.innerHTML = entries.map(function (e) {
      const w = max ? Math.round(e.val / max * 100) : 0;
      return '<li class="source-row">' +
        '<span class="source-label">' + esc(e.label) + '</span>' +
        '<span class="source-bar"><span class="source-bar-fill" style="width:' + w + '%"></span></span>' +
        '<span class="source-val">' + e.val + '</span>' +
      '</li>';
    }).join('');
  }

  // 5 — Technician workload (open jobs per active tech).
  async function loadTechWorkload() {
    const data = await AdminStore.getTechnicianWorkload();
    if (!data) { techWorkload.innerHTML = '<div class="manager-empty">No data</div>'; return; }
    if (!data.length) { techWorkload.innerHTML = '<div class="manager-empty">No active technicians.</div>'; return; }
    const max = data.reduce(function (a, t) { return Math.max(a, t.openJobs || 0); }, 0);
    techWorkload.innerHTML = data.map(function (t) {
      const n = t.openJobs || 0;
      const w = max ? Math.round(n / max * 100) : 0;
      const tone = n >= 4 ? ' is-busy' : (n === 0 ? ' is-idle' : '');
      return '<div class="tech-row' + tone + '">' +
        '<span class="tech-name">' + esc(t.name || 'Unknown') + '</span>' +
        '<span class="tech-bar"><span class="tech-bar-fill" style="width:' + w + '%"></span></span>' +
        '<span class="tech-count">' + n + '</span>' +
      '</div>';
    }).join('');
  }

  // Period toggle: Week / Month / Custom (custom waits for Apply).
  if (dashPeriod) {
    dashPeriod.addEventListener('click', function (e) {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      chartPeriod = btn.dataset.period;
      dashPeriod.querySelectorAll('.seg-btn').forEach(function (b) { b.classList.toggle('is-active', b === btn); });
      if (chartPeriod === 'custom') {
        dashRange.hidden = false;
        if (!dashFrom.value || !dashTo.value) {
          const now = new Date();
          dashFrom.value = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
          dashTo.value = isoDate(now);
        }
        return; // don't fetch until Apply
      }
      dashRange.hidden = true;
      loadCharts();
    });
  }
  if (dashRangeApply) {
    dashRangeApply.addEventListener('click', function () {
      if (!dashFrom.value || !dashTo.value) return;
      if (dashFrom.value > dashTo.value) {
        dashError.hidden = false;
        dashError.textContent = 'Custom range: "From" must be on or before "To".';
        return;
      }
      dashError.hidden = true;
      chartRange = { from: dashFrom.value, to: dashTo.value };
      loadCharts();
    });
  }

  function renderRecent(items) {
    if (!items.length) { recentList.innerHTML = '<div class="manager-empty">No recent jobs.</div>'; return; }
    recentList.innerHTML = items.map(function (a) {
      const st = DASH_STATUS_LABEL[a.status] ? a.status : 'pending-review';
      return '<div class="recent-row">' +
        '<span class="recent-id">' + (a.jobId ? '#' + esc(a.jobId) : '—') + '</span>' +
        '<span class="recent-customer">' + esc(a.customer || 'Unknown') + '</span>' +
        '<span class="recent-status status-' + st + '">' + esc(DASH_STATUS_LABEL[st]) + '</span>' +
        '<span class="recent-time">' + esc(timeAgo(a.time)) + '</span>' +
      '</div>';
    }).join('');
  }
  if (dashRefreshBtn) dashRefreshBtn.addEventListener('click', loadDashboard);

  // ── Revenue ──
  const revCards = document.getElementById('revCards');
  const revError = document.getElementById('revError');
  const revPeriods = document.getElementById('revPeriods');
  let revPeriod = 'today';

  async function loadRevenue(period) {
    revPeriod = period || 'today';
    revPeriods.querySelectorAll('.seg-btn').forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.period === revPeriod);
    });
    revError.hidden = true;
    revCards.innerHTML = '<div class="manager-empty">Loading…</div>';
    const d = await AdminStore.getRevenue(revPeriod);
    if (!d) {
      revCards.innerHTML = '';
      revError.hidden = false;
      revError.textContent = 'Backend unreachable — revenue is unavailable right now.';
      return;
    }
    revCards.innerHTML = statGroup('',
      statCard(money(d.revenue), 'Revenue', { cls: 'is-revenue' }) +
      statCard(d.jobCount != null ? d.jobCount : 0, 'Completed jobs') +
      statCard(money(d.averageJobValue), 'Avg job value')
    );
  }
  if (revPeriods) {
    revPeriods.addEventListener('click', function (e) {
      const b = e.target.closest('.seg-btn');
      if (b) loadRevenue(b.dataset.period);
    });
  }

  // ── Export ──
  const exportFrom = document.getElementById('exportFrom');
  const exportTo = document.getElementById('exportTo');
  const exportErr = document.getElementById('exportErr');
  const exportSection = document.querySelector('section[data-view="export"]');
  if (exportSection) {
    exportSection.addEventListener('click', async function (e) {
      const btn = e.target.closest('[data-export]');
      if (!btn) return;
      const type = btn.dataset.export;
      exportErr.hidden = true;
      const from = exportFrom.value || '';
      // Make the "to" date inclusive of the whole day.
      const to = exportTo.value ? exportTo.value + 'T23:59:59' : '';
      const label = btn.textContent;
      btn.disabled = true; btn.textContent = 'Exporting…';
      const r = await AdminStore.exportCsv(type, from, to);
      btn.disabled = false; btn.textContent = label;
      if (!r.ok) {
        exportErr.hidden = false;
        exportErr.textContent = r.message || 'Export failed — try again.';
        return;
      }
      const url = URL.createObjectURL(r.blob);
      const a = document.createElement('a');
      a.href = url; a.download = r.filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      showToast('Exported ' + type + ' (' + r.filename + ')');
    });
  }

  /* ── Go ── */
  boot();
})();


