/* ============================================================================
   dispatch.js — Aston Dispatch console
   Standalone from the admin panel. Talks to the same backend via config.js
   (window.apiFetch / window.API_BASE_URL). JWT lives in sessionStorage only,
   so closing the tab signs out. 30-minute inactivity auto-logout. Any 401
   clears the session and returns to the dispatch login.

   Backend contract (project_locksmith_backend):
     POST  /api/auth/login            → { token, user:{username,role,displayName} }
     GET   /api/dispatch/stats        → { byStatus:{[status]:n}, total, today, completedToday }
     GET   /api/dispatch?status=&priority=&limit=  → { items:[job], total, page, pages }
     PATCH /api/dispatch/:id/assign   → { assignedTo }            (staff)
     PATCH /api/dispatch/:id/status   → { status }   (400 if unchanged) (staff)
     DELETE /api/dispatch/:id         → admin only — NOT exposed here.
   ============================================================================ */
(function () {
  'use strict';

  /* ───────────── Config / constants ───────────── */
  var SESSION_KEY = 'aston_dispatch_session_v1';
  var IDLE_MS     = 30 * 60 * 1000;  // 30-minute inactivity auto-logout
  var REFRESH_MS  = 25 * 1000;       // job-queue auto-refresh
  var JOB_LIMIT   = 100;
  var THEME_KEY   = 'aston_dispatch_theme';   // localStorage — persists across sessions
  var MUTE_KEY    = 'aston_dispatch_muted';   // localStorage — notification-sound preference

  var PRIORITY_RANK  = { emergency: 0, high: 1, normal: 2, low: 3 };
  var PRIORITY_LABEL = { emergency: 'Emergency', high: 'High', normal: 'Normal', low: 'Low' };
  var STATUS_LABEL   = {
    'pending-review': 'Pending Review', 'approved': 'Approved', 'assigned': 'Assigned',
    'in-progress': 'In Progress', 'completed': 'Completed', 'cancelled': 'Cancelled'
  };
  var STATUS_ORDER = ['pending-review', 'approved', 'assigned', 'in-progress', 'completed', 'cancelled'];
  var TERMINAL = { completed: 1, cancelled: 1 }; // sorted to the bottom of the live queue

  // Top-level views. Each tab owns a set of statuses; the queue is grouped by
  // these client-side (the working set is fetched once, unfiltered, into the
  // store below — so a status change can move a card between tabs instantly).
  var TAB_STATUSES = {
    active:    ['pending-review', 'approved', 'assigned', 'in-progress'],
    completed: ['completed'],
    cancelled: ['cancelled']
  };
  // statusHistory entries are status transitions; map each to a past-tense verb
  // for the per-card history panel ("Assigned by dispatch1 · 2h ago").
  var STATUS_VERB = {
    'pending-review': 'Opened', 'approved': 'Approved', 'assigned': 'Assigned',
    'in-progress': 'Started', 'completed': 'Completed', 'cancelled': 'Cancelled'
  };

  /* ───────────── client-side store (single source of truth) ─────────────
     state.jobs is the full working set from the last fetch. The visible queue
     is derived from it (tab → status/priority filters → sort), so mutations can
     update the store and re-render without a round-trip — cards move tabs and
     count badges update live. searchResults overrides the store while a search
     is active. */
  var state = {
    jobs: [],            // working set (all statuses), newest-first from server
    searchResults: [],   // results while searchActive
    tab: 'active',       // active | completed | cancelled
    myJobsOnly: false,   // dispatch-only "My jobs" toggle
    expanded: {},        // { [jobId]: true } open history panels (survive re-render)
    pending: 0           // in-flight optimistic mutations (auto-refresh pauses while > 0)
  };

  /* ───────────── DOM refs ───────────── */
  var $ = function (id) { return document.getElementById(id); };
  var loginView = $('loginView'), dashView = $('dashView');
  var loginForm = $('loginForm'), loginUser = $('loginUser'), loginPass = $('loginPass');
  var loginBtn = $('loginBtn'), loginError = $('loginError'), loginNotice = $('loginNotice');
  var topUser = $('topUser'), logoutBtn = $('logoutBtn'), themeToggle = $('themeToggle');
  var statToday = $('statToday'), statPending = $('statPending'), statProgress = $('statProgress'), statCompleted = $('statCompleted');
  var filterStatus = $('filterStatus'), filterPriority = $('filterPriority'), statusFilterGroup = $('statusFilterGroup');
  var tabBar = $('tabBar'), myJobsToggle = $('myJobsToggle');
  var countActive = $('countActive'), countCompleted = $('countCompleted'), countCancelled = $('countCancelled');
  var queue = $('queue'), lastUpdatedEl = $('lastUpdated'), refreshBtn = $('refreshBtn'), toastEl = $('toast');
  var searchForm = $('searchForm'), searchInput = $('searchInput'), searchClear = $('searchClear'), searchMeta = $('searchMeta');
  var muteToggle = $('muteToggle');
  var custModal = $('custModal'), custBody = $('custBody'), custClose = $('custClose'), custTitle = $('custTitle');

  var filters = { status: '', priority: '' };
  var lastActivity = Date.now();
  var lastFetchTs = 0;
  var toastTimer = null;
  var technicians = [];   // active technicians for the assign dropdown (Fix 3)
  var searchActive = false;     // when true, auto-refresh won't clobber search results
  var knownJobIds = null;       // Set of job ids seen so far (null until first load) — new-job sound
  var muted = false;            // notification-sound mute preference
  var audioCtx = null;          // lazily created on first user gesture

  /* ───────────── tiny helpers ───────────── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function telHref(phone) {
    var t = (String(phone || '').match(/[+\d]/g) || []).join('');
    return t ? 'tel:' + t : '';
  }
  function fmtMoney(n) {
    if (n == null || isNaN(n)) return '—';
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function timeAgo(iso) {
    var t = new Date(iso).getTime();
    if (!t) return '';
    var s = Math.floor((Date.now() - t) / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return s + ' sec ago';
    var m = Math.floor(s / 60);
    if (m < 60) return m + ' min ago';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' h ago';
    var d = Math.floor(h / 24);
    if (d < 7) return d + ' d ago';
    return new Date(t).toLocaleDateString();
  }
  function agoShort(t) {
    if (!t) return '';
    var s = Math.floor((Date.now() - t) / 1000);
    if (s < 8) return 'just now';
    if (s < 60) return s + 's ago';
    var m = Math.floor(s / 60);
    return m + 'm ago';
  }

  /* ───────────── inline-edit helpers (Fix 2) ─────────────
     Dispatch (and admin) can fix bad/missing job info right on the card. Each
     editable field is wrapped in a .editable container that carries its raw
     value + metadata; a pencil swaps the static view for an inline editor that
     PATCHes /api/dispatch/:id. jobId is editable by admins only. */
  var EDIT_MAX = { customerName: 100, address: 300, eta: 100, aiSummary: 1000, jobId: 7 };

  // EMBED means we're inside the admin panel (admin role); standalone uses the
  // dispatch session's stored role.
  function isAdminUser() {
    if (EMBED) return true;
    var s = getSession();
    return !!(s && s.role === 'admin');
  }

  function pencilSvg() {
    return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
  }

  // Builds an inline editable: optional `lead` markup, the value span, and a
  // pencil (unless opts.canEdit === false). opts: { label, type, placeholder,
  // valClass, lead, canEdit }.
  function editable(field, value, opts) {
    opts = opts || {};
    var raw = value == null ? '' : String(value);
    var isEmpty = raw.trim() === '';
    var ph = opts.placeholder || '—';
    var valCls = 'ed-val' + (opts.valClass ? ' ' + opts.valClass : '') + (isEmpty ? ' is-empty' : '');
    return '<span class="editable" data-edit="' + field + '" data-type="' + (opts.type || 'text') +
      '" data-label="' + esc(opts.label || field) + '" data-value="' + esc(raw) +
      '" data-placeholder="' + esc(ph) + '">' +
        (opts.lead || '') +
        '<span class="' + valCls + '" data-val>' + esc(isEmpty ? ph : raw) + '</span>' +
        (opts.canEdit === false ? '' :
          '<button type="button" class="ed-pencil" aria-label="Edit ' + esc(opts.label || field) + '">' + pencilSvg() + '</button>') +
      '</span>';
  }

  // Swap the static view for an editor.
  function startEdit(pencil) {
    var box = pencil.closest('.editable');
    if (!box || box.querySelector('.ed-editor')) return;
    var field = box.getAttribute('data-edit');
    var type = box.getAttribute('data-type') || 'text';
    var raw = box.getAttribute('data-value') || '';
    var label = box.getAttribute('data-label') || '';
    var max = EDIT_MAX[field] || 200;
    box._editBackup = box.innerHTML;
    var control = (type === 'textarea')
      ? '<textarea class="ed-input" rows="3" maxlength="' + max + '" aria-label="' + esc(label) + '">' + esc(raw) + '</textarea>'
      : '<input class="ed-input" type="text" maxlength="' + max + '"' +
          (field === 'jobId' ? ' inputmode="numeric" pattern="\\d{7}"' : '') +
          ' value="' + esc(raw) + '" aria-label="' + esc(label) + '"/>';
    box.innerHTML =
      '<span class="ed-editor">' + control +
        '<span class="ed-actions">' +
          '<button type="button" class="btn btn-primary ed-save">Save</button>' +
          '<button type="button" class="btn btn-ghost ed-cancel">Cancel</button>' +
        '</span>' +
      '</span>';
    var input = box.querySelector('.ed-input');
    if (input) { input.focus(); try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) {} }
  }

  function restoreView(box) {
    if (box._editBackup != null) { box.innerHTML = box._editBackup; box._editBackup = null; }
  }

  // Restore the static view, then patch in the new value (text + empty styling).
  function applyValue(box, raw) {
    restoreView(box);
    raw = raw == null ? '' : String(raw);
    box.setAttribute('data-value', raw);
    var val = box.querySelector('[data-val]');
    if (val) {
      var empty = raw.trim() === '';
      val.textContent = empty ? (box.getAttribute('data-placeholder') || '—') : raw;
      val.classList.toggle('is-empty', empty);
    }
  }

  function commitEdit(box) {
    if (!box) return;
    var card = box.closest('.job-card'); if (!card) return;
    var id = card.getAttribute('data-id');
    var field = box.getAttribute('data-edit');
    var label = box.getAttribute('data-label') || 'Field';
    var input = box.querySelector('.ed-input'); if (!input) return;
    var val = (input.value || '').trim();
    if (field === 'jobId' && val && !/^\d{7}$/.test(val)) { toast('Job ID must be 7 digits.', 'err'); input.focus(); return; }
    if (field === 'customerName' && !val) { toast('Customer name can’t be empty.', 'err'); input.focus(); return; }
    var saveBtn = box.querySelector('.ed-save');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '…'; }
    var body = {}; body[field] = val;
    authedFetch('/api/dispatch/' + id, { method: 'PATCH', json: body }).then(function (res) {
      if (res.ok) {
        var saved = (res.data && res.data[field] != null) ? res.data[field] : val;
        applyValue(box, saved);
        var jb = findJob(id); if (jb) jb[field] = saved; // keep the store in sync for re-renders
        toast(label + ' updated', 'ok');
      } else if (res.status !== 401) {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
        toast((res.data && res.data.message) || 'Could not save — try again.', 'err');
      }
    });
  }

  /* ───────────── session ───────────── */
  function getSession() {
    try { var raw = sessionStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }
  function setSession(s) {
    try { if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); else sessionStorage.removeItem(SESSION_KEY); }
    catch (e) { /* storage blocked — non-fatal */ }
  }
  function clearSession() { setSession(null); }

  /* ───────────── embedded mode (inside the admin panel) ─────────────
     When opened as /dispatch.html?embed=1 from the admin panel we run inside a
     same-origin iframe. There's no separate dispatch login: we reuse the admin
     JWT (apex_admin_session_v1), since the admin role has staff API access. The
     topbar + login are hidden via CSS, and the admin panel owns idle-logout. */
  var EMBED = /[?&]embed=1(?:&|$)/.test(location.search);
  var ADMIN_SESSION_KEY = 'apex_admin_session_v1';
  function getAdminSession() {
    try {
      var raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
      // Same-origin iframe shares the parent's sessionStorage, but fall back to
      // reading it through window.parent defensively.
      if (!raw && window.parent && window.parent !== window) {
        raw = window.parent.sessionStorage.getItem(ADMIN_SESSION_KEY);
      }
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function activeToken() {
    if (EMBED) { var a = getAdminSession(); return a && a.token; }
    var s = getSession(); return s && s.token;
  }
  function hasActiveSession() { return !!activeToken(); }

  /* ───────────── authed backend call (401 → back to login) ───────────── */
  function authedFetch(path, options) {
    options = options || {};
    var token = activeToken();
    if (token) options.token = token;
    return window.apiFetch(path, options).then(function (res) {
      if (res.status === 401) { handleUnauthorized(); }
      return res;
    });
  }
  function handleUnauthorized() {
    if (EMBED) {
      // Don't show the dispatch login inside the admin panel — the admin owns auth.
      if (queue) queue.innerHTML = '<div class="queue-empty">Your admin session expired — reload the admin panel to sign in again.</div>';
      return;
    }
    clearSession();
    showLogin('Your session ended — please sign in again.');
  }

  /* ───────────── view switching ───────────── */
  function showLogin(noticeMsg) {
    dashView.hidden = true;
    loginView.hidden = false;
    if (noticeMsg) { loginNotice.textContent = noticeMsg; loginNotice.hidden = false; }
    else { loginNotice.hidden = true; }
    loginError.hidden = true;
    if (loginPass) loginPass.value = '';
    setTimeout(function () { try { (loginUser.value ? loginPass : loginUser).focus(); } catch (e) {} }, 30);
  }
  function showDashboard() {
    loginView.hidden = true;
    dashView.hidden = false;
    var s = getSession();
    topUser.textContent = (s && s.username) ? s.username : '—';
    // "My jobs" only makes sense for a dispatch user (admins see everything).
    if (myJobsToggle) myJobsToggle.hidden = isAdminUser();
    lastActivity = Date.now();
    // Load technicians first so the very first render of the queue already has
    // the assign dropdown populated. Animate the first paint.
    loadTechnicians().then(function () { loadStats(); return loadJobs(true); });
  }

  /* ───────────── technicians (assign dropdown) ───────────── */
  function loadTechnicians() {
    return authedFetch('/api/dispatch/technicians').then(function (res) {
      if (res.ok && res.data) {
        technicians = (res.data.technicians || []).filter(function (t) { return t && (t._id || t.id); });
      }
    }).catch(function () { /* keep whatever we had; cards fall back to free-text */ });
  }

  /* ───────────── login / logout ───────────── */
  loginForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var username = loginUser.value.trim();
    var password = loginPass.value;
    if (!username || !password) { return; }
    loginError.hidden = true; loginNotice.hidden = true;
    loginBtn.disabled = true; var label = loginBtn.textContent; loginBtn.textContent = 'Signing in…';

    window.apiFetch('/api/auth/login', { method: 'POST', json: { username: username, password: password } })
      .then(function (res) {
        loginBtn.disabled = false; loginBtn.textContent = label;
        var token = res.data && res.data.token;
        if (res.ok && token) {
          var u = (res.data && res.data.user) || {};
          var now = Date.now();
          setSession({
            token: token,
            username: u.displayName || u.username || username,
            role: u.role || '',
            createdAt: now,
            lastActivity: now
          });
          showDashboard();
        } else {
          loginError.textContent = (res.status === 0)
            ? 'Network error — check your connection and try again.'
            : 'Invalid username or password.';
          loginError.hidden = false;
        }
      });
  });

  function logout(reason) {
    clearSession();
    var msg = reason === 'idle' ? 'Signed out after 30 minutes of inactivity.' : null;
    showLogin(msg);
  }
  logoutBtn.addEventListener('click', function () { logout('manual'); });

  /* ───────────── light / dark theme (localStorage) ───────────── */
  function applyTheme(t) {
    var theme = t === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    if (themeToggle) {
      var moonIco = themeToggle.querySelector('.theme-ico-moon');
      var sunIco = themeToggle.querySelector('.theme-ico-sun');
      if (moonIco) moonIco.style.display = theme === 'light' ? 'none' : '';
      if (sunIco) sunIco.style.display = theme === 'light' ? '' : 'none';
      themeToggle.setAttribute('aria-label', theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
      themeToggle.setAttribute('title', theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
    }
  }
  function initTheme() {
    var t = null;
    try { t = localStorage.getItem(THEME_KEY); } catch (e) {}
    applyTheme(t === 'light' ? 'light' : 'dark');
  }
  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      var next = cur === 'light' ? 'dark' : 'light';
      try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
      applyTheme(next);
    });
  }

  /* ───────────── inactivity auto-logout (30 min) ───────────── */
  function bumpActivity() {
    lastActivity = Date.now();
    var s = getSession();
    if (s && Date.now() - (s.lastActivity || 0) > 15000) { // throttle writes
      s.lastActivity = Date.now(); setSession(s);
    }
  }
  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(function (ev) {
    window.addEventListener(ev, bumpActivity, { passive: true });
  });
  setInterval(function () {
    if (EMBED) return;            // admin panel owns idle-logout when embedded
    if (!getSession()) return;
    if (Date.now() - lastActivity > IDLE_MS) { logout('idle'); }
  }, 30000);

  /* ───────────── stats ───────────── */
  function loadStats() {
    return authedFetch('/api/dispatch/stats').then(function (res) {
      if (!res.ok) return;
      var d = res.data || {}; var bs = d.byStatus || {};
      statToday.textContent = d.today != null ? d.today : 0;
      statPending.textContent = bs['pending-review'] != null ? bs['pending-review'] : 0;
      statProgress.textContent = bs['in-progress'] != null ? bs['in-progress'] : 0;
      // Prefer completedToday; fall back to all-time completed on older backends.
      statCompleted.textContent = d.completedToday != null
        ? d.completedToday
        : (bs['completed'] != null ? bs['completed'] : 0);
    });
  }

  /* ───────────── job queue ───────────── */
  function sortJobs(items) {
    return items.slice().sort(function (a, b) {
      var at = TERMINAL[a.status] ? 1 : 0, bt = TERMINAL[b.status] ? 1 : 0;
      if (at !== bt) return at - bt;                                  // active jobs first
      var ar = PRIORITY_RANK[a.priority] != null ? PRIORITY_RANK[a.priority] : 9;
      var br = PRIORITY_RANK[b.priority] != null ? PRIORITY_RANK[b.priority] : 9;
      if (ar !== br) return ar - br;                                  // emergency → high → normal → low
      return new Date(b.createdAt) - new Date(a.createdAt);           // newest first within a tier
    });
  }

  function statusOptions(current) {
    return STATUS_ORDER.map(function (s) {
      return '<option value="' + s + '"' + (s === current ? ' selected' : '') + '>' + STATUS_LABEL[s] + '</option>';
    }).join('');
  }

  function cardHtml(job) {
    var id = String(job._id || job.id || '');
    var prio = PRIORITY_RANK[job.priority] != null ? job.priority : 'normal';
    var status = STATUS_LABEL[job.status] ? job.status : 'pending-review';
    var isActive = TAB_STATUSES.active.indexOf(status) !== -1;
    // Phone is a button that opens the customer-history modal (the modal itself
    // offers a tap-to-call link for the actual dialing).
    var phoneStr = job.phone || '';
    var phoneInner = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3h4l2 5-2 2a12 12 0 005 5l2-2 5 2v4a2 2 0 01-2 2A18 18 0 013 5a2 2 0 012-2z"/></svg>' + esc(phoneStr);
    var phoneHtml = phoneStr
      ? '<button type="button" class="job-phone" data-phone="' + esc(phoneStr) + '" title="View customer history" aria-label="View customer history for ' + esc(phoneStr) + '">' + phoneInner + '</button>'
      : '<span class="job-phone is-empty">' + esc(phoneStr) + '</span>';

    // AI summary — always rendered (editable), so dispatch can add one when the
    // AI failed or fix a wrong one. Pencil sits in the corner of the box.
    var aiPrio = job.aiSuggestedPriority
      ? '<span class="ai-prio"> · suggests ' + esc(PRIORITY_LABEL[job.aiSuggestedPriority] || job.aiSuggestedPriority) + '</span>'
      : '';
    var aiEmpty = !(job.aiSummary && String(job.aiSummary).trim());
    var aiPh = 'No AI summary yet — click to add one.';
    var ai =
      '<div class="job-ai editable editable-block" data-edit="aiSummary" data-type="textarea" data-label="AI summary"' +
        ' data-value="' + esc(job.aiSummary || '') + '" data-placeholder="' + esc(aiPh) + '">' +
        '<span class="job-ai-label">AI Summary' + aiPrio + '</span>' +
        '<button type="button" class="ed-pencil ed-pencil-corner" aria-label="Edit AI summary">' + pencilSvg() + '</button>' +
        '<p class="ed-val' + (aiEmpty ? ' is-empty' : '') + '" data-val>' + esc(aiEmpty ? aiPh : job.aiSummary) + '</p>' +
      '</div>';

    // Full notes — show description plus any serviceDetails/notes the source
    // carried, deduped, each on its own line below the service type.
    var detailParts = [];
    [job.description, job.serviceDetails, job.notes].forEach(function (v) {
      v = (v == null ? '' : String(v)).trim();
      if (v && detailParts.indexOf(v) === -1) detailParts.push(v);
    });
    var desc = detailParts.map(function (p) { return '<p class="job-desc">' + esc(p) + '</p>'; }).join('');
    var sourceTag = job.source ? '<span class="job-source">' + esc(job.source) + '</span>' : '';

    // Address (editable) — street address for routing a tech. Postal code stays
    // as a read-only line beneath it.
    var pinSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0118 0z"/><circle cx="12" cy="10" r="2.6"/></svg>';
    var clockSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
    var addrHtml = '<div class="job-line job-loc">' + pinSvg +
      editable('address', job.address || '', { label: 'Address', placeholder: 'Add address' }) + '</div>';
    var postalHtml = job.postalCode
      ? '<div class="job-postal">' + pinSvg + esc(job.postalCode) + '</div>'
      : '';
    // ETA (editable).
    var etaHtml = '<div class="job-line job-eta">' + clockSvg +
      '<span class="job-line-label">ETA</span>' +
      editable('eta', job.eta || '', { label: 'ETA', placeholder: 'Set ETA' }) + '</div>';

    // Assignment visibility — a prominent chip at the top of the card so dispatch
    // sees who's on it at a glance. Unassigned *active* jobs get a distinct tag so
    // it's obvious they still need a technician. (data-assign-tag so it can be
    // refreshed in place after an assign.)
    var personSvg = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    var assignTag = job.assignedTo
      ? '<span class="badge assigned-tag" data-assign-tag>' + personSvg + esc(job.assignedTo) + '</span>'
      : (isActive ? '<span class="badge unassigned-tag" data-assign-tag>Unassigned</span>' : '<span data-assign-tag hidden></span>');

    // Assign control — a technician dropdown when any exist, otherwise the
    // legacy free-text input plus a hint pointing to the admin panel (Fix 3).
    var assignControl, techNote = '';
    if (technicians.length) {
      var jobTechId = job.technicianId ? String(job.technicianId) : '';
      var opts = '<option value="">Select technician…</option>';
      technicians.forEach(function (t) {
        var tid = String(t._id || t.id);
        var nm = ((t.firstName || '') + ' ' + (t.lastName || '')).trim();
        opts += '<option value="' + esc(tid) + '"' + (tid === jobTechId ? ' selected' : '') + '>' + esc(nm) + '</option>';
      });
      assignControl = '<select class="tech-select" aria-label="Assign technician">' + opts + '</select>';
    } else {
      assignControl = '<input class="tech-input" type="text" maxlength="100" placeholder="Technician name" value="' + esc(job.assignedTo || '') + '" aria-label="Technician name"/>';
      techNote = '<p class="tech-empty-note">No technicians added yet — add them in the admin panel.</p>';
    }

    // Job ID — editable by admins only (display-only for dispatch). The "#" is
    // drawn via CSS so it isn't part of the editable value.
    var jobIdHtml = job.jobId
      ? editable('jobId', job.jobId, { label: 'Job ID', valClass: 'job-id', canEdit: isAdminUser() })
      : '';

    // History panel (per-card toggle). statusHistory comes back on every job from
    // the list endpoint, newest entry last — we reverse for display.
    var expanded = !!state.expanded[id];
    var hist = job.statusHistory || [];
    var historyBlock =
      '<button type="button" class="job-history-toggle" data-history-toggle aria-expanded="' + (expanded ? 'true' : 'false') + '">' +
        '<span class="hist-caret" aria-hidden="true">' + (expanded ? '▾' : '▸') + '</span> History (' + hist.length + ')' +
      '</button>' +
      '<div class="job-history" data-history' + (expanded ? '' : ' hidden') + '>' + historyHtml(job) + '</div>';

    return '' +
      '<div class="job-top">' +
        '<div class="job-badges">' +
          '<span class="badge prio prio-' + prio + '">' + PRIORITY_LABEL[prio] + '</span>' +
          '<span class="badge status status-' + status + '" data-status-badge>' + STATUS_LABEL[status] + '</span>' +
          assignTag +
        '</div>' +
        '<div class="job-top-right">' +
          jobIdHtml +
          '<time class="job-age" data-created="' + esc(job.createdAt) + '">' + timeAgo(job.createdAt) + '</time>' +
        '</div>' +
      '</div>' +
      '<div class="job-customer">' +
        editable('customerName', job.customerName || '', { label: 'Customer name', valClass: 'job-name', placeholder: 'Unknown' }) +
        phoneHtml + sourceTag +
      '</div>' +
      addrHtml +
      postalHtml +
      etaHtml +
      '<div class="job-service">' +
        '<span class="job-service-type">' + esc(job.serviceType || '—') + '</span>' +
        desc +
      '</div>' +
      ai +
      '<div class="job-controls">' +
        '<div class="assign-row">' +
          assignControl +
          '<button type="button" class="btn btn-assign">Assign</button>' +
        '</div>' +
        techNote +
        '<label class="status-row"><span>Update status</span>' +
          '<select class="status-select" data-current="' + status + '" aria-label="Update status">' + statusOptions(status) + '</select>' +
        '</label>' +
        '<div class="price-row">' +
          '<span class="price-label">Price</span>' +
          '<span class="price-currency" aria-hidden="true">$</span>' +
          '<input class="price-input" type="number" min="0" step="0.01" inputmode="decimal" value="' + (job.price != null ? esc(job.price) : '') + '" placeholder="0.00" aria-label="Job price"/>' +
          '<button type="button" class="btn btn-ghost btn-price">Save</button>' +
        '</div>' +
      '</div>' +
      historyBlock;
  }

  // statusHistory → readable rows, newest first. Each entry is a status
  // transition; `note` (e.g. a merge note) is shown when present.
  function historyHtml(job) {
    var h = (job.statusHistory || []).slice().reverse();
    if (!h.length) return '<div class="job-history-empty">No history recorded yet.</div>';
    return h.map(function (e) {
      var st = STATUS_LABEL[e.status] ? e.status : 'pending-review';
      var verb = STATUS_VERB[e.status] || STATUS_LABEL[st] || e.status;
      // Entries with a note (assignment, repeat-contact merge) lead with the note;
      // plain status transitions lead with the verb.
      var headline = e.note ? esc(e.note) : esc(verb);
      var who = e.changedBy ? ' by <b>' + esc(e.changedBy) + '</b>' : '';
      var when = e.timestamp ? ' · ' + timeAgo(e.timestamp) : '';
      return '<div class="hist-row">' +
        '<span class="hist-dot status-' + st + '" aria-hidden="true"></span>' +
        '<span class="hist-text">' + headline + who + when + '</span>' +
      '</div>';
    }).join('');
  }

  // Completed/cancelled tabs sort by most-recent activity; the active tab keeps
  // priority order (emergency → low) then newest-first within a tier.
  function jobTs(j) { return new Date(j.updatedAt || j.createdAt || 0).getTime(); }
  function sortForTab(items, tab) {
    if (tab !== 'active') {
      return items.slice().sort(function (a, b) { return jobTs(b) - jobTs(a); });
    }
    return items.slice().sort(function (a, b) {
      var ar = PRIORITY_RANK[a.priority] != null ? PRIORITY_RANK[a.priority] : 9;
      var br = PRIORITY_RANK[b.priority] != null ? PRIORITY_RANK[b.priority] : 9;
      if (ar !== br) return ar - br;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  function findJob(id) {
    id = String(id);
    for (var i = 0; i < state.jobs.length; i++) {
      if (String(state.jobs[i]._id || state.jobs[i].id) === id) return state.jobs[i];
    }
    return null;
  }
  // Replace a store job with the authoritative server doc after a successful
  // mutation, then re-render so every derived view stays consistent.
  function reconcileJob(doc) {
    if (!doc) return;
    var id = String(doc._id || doc.id || '');
    for (var i = 0; i < state.jobs.length; i++) {
      if (String(state.jobs[i]._id || state.jobs[i].id) === id) { state.jobs[i] = doc; break; }
    }
    render(false);
  }

  function currentUserName() { var s = getSession(); return (s && s.username) ? s.username : ''; }
  // "My jobs": strictly jobs whose assignedTo equals the logged-in user's name.
  function jobIsMine(job) {
    var me = currentUserName();
    return !!(me && job.assignedTo && job.assignedTo === me);
  }

  function jobInTab(job, tab) { return TAB_STATUSES[tab].indexOf(job.status) !== -1; }

  // The store filtered down to what the current tab + dropdowns + toggle should show.
  function visibleJobs() {
    var list = state.jobs.filter(function (j) { return jobInTab(j, state.tab); });
    if (state.tab === 'active' && filters.status) {
      list = list.filter(function (j) { return j.status === filters.status; });
    }
    if (filters.priority) {
      list = list.filter(function (j) { return (j.priority || 'normal') === filters.priority; });
    }
    if (state.myJobsOnly && !isAdminUser()) list = list.filter(jobIsMine);
    return list;
  }

  function tabCounts() {
    var c = { active: 0, completed: 0, cancelled: 0 };
    state.jobs.forEach(function (j) {
      if (jobInTab(j, 'active')) c.active++;
      else if (j.status === 'completed') c.completed++;
      else if (j.status === 'cancelled') c.cancelled++;
    });
    return c;
  }

  function updateTabCounts() {
    var c = tabCounts();
    if (countActive) countActive.textContent = c.active;
    if (countCompleted) countCompleted.textContent = c.completed;
    if (countCancelled) countCancelled.textContent = c.cancelled;
  }
  function syncTabButtons() {
    if (!tabBar) return;
    var tabs = tabBar.querySelectorAll('[data-tab]');
    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i].getAttribute('data-tab') === state.tab;
      tabs[i].classList.toggle('is-active', on);
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
  }
  // The status dropdown only applies to the Active tab (Completed/Cancelled have a
  // single status, so the filter would be pointless/confusing there).
  function syncStatusFilter() {
    var onActive = state.tab === 'active';
    if (statusFilterGroup) statusFilterGroup.hidden = !onActive;
    if (!onActive && filters.status) { filters.status = ''; if (filterStatus) filterStatus.value = ''; }
  }

  function emptyMessage() {
    if (searchActive) return 'No jobs found.';
    if (filters.status || filters.priority || state.myJobsOnly) return 'No jobs match these filters.';
    if (state.tab === 'completed') return 'No completed jobs in the current window.';
    if (state.tab === 'cancelled') return 'No cancelled jobs in the current window.';
    return 'No active jobs right now.';
  }

  // Single render path. `animate` plays the entrance animation (first load, tab
  // switch, filter change) — suppressed on optimistic/refresh re-renders so the
  // queue doesn't flash every 25s or on every click.
  function render(animate) {
    if (tabBar) tabBar.hidden = searchActive;
    if (!searchActive) { updateTabCounts(); syncTabButtons(); syncStatusFilter(); }

    var list = searchActive ? state.searchResults : visibleJobs();
    if (!list.length) {
      queue.classList.remove('animate-in');
      queue.innerHTML = '<div class="queue-empty">' + esc(emptyMessage()) + '</div>';
      return;
    }
    var sorted = searchActive ? sortJobs(list) : sortForTab(list, state.tab);
    var frag = document.createDocumentFragment();
    sorted.forEach(function (job) {
      var card = document.createElement('article');
      card.className = 'job-card prio-' + (PRIORITY_RANK[job.priority] != null ? job.priority : 'normal');
      card.setAttribute('data-id', job._id || job.id || '');
      card.innerHTML = cardHtml(job);
      frag.appendChild(card);
    });
    queue.classList.toggle('animate-in', !!animate);
    queue.innerHTML = '';
    queue.appendChild(frag);
    if (animate) setTimeout(function () { queue.classList.remove('animate-in'); }, 340);
    updateAges();
  }

  function loadJobs(animate) {
    if (searchActive) return Promise.resolve(); // don't clobber search results
    // Filtering is client-side now: fetch the full working set once, derive every
    // tab/filter view from the store so a mutation can move cards live.
    var params = new URLSearchParams();
    params.set('limit', String(JOB_LIMIT));
    return authedFetch('/api/dispatch?' + params.toString()).then(function (res) {
      if (!res.ok) {
        if (res.status !== 401) {
          queue.innerHTML = '<div class="queue-empty">Couldn’t load the job queue' +
            (res.status === 0 ? ' — backend unreachable.' : '.') + ' <button type="button" class="btn btn-ghost" id="retryBtn" style="margin-top:10px;">Retry</button></div>';
          var rb = $('retryBtn'); if (rb) rb.addEventListener('click', function () { loadJobs(true); });
        }
        return;
      }
      var items = (res.data && res.data.items) || [];
      detectNewJobs(items);
      state.jobs = items;
      render(!!animate);
      markUpdated();
    });
  }

  // Notification sound: chime when a job ID we've never seen shows up on a
  // refresh (skips the very first load so the queue filling in is silent).
  function detectNewJobs(items) {
    var ids = items.map(function (j) { return j._id || j.id; }).filter(Boolean);
    if (knownJobIds !== null) {
      var hasNew = ids.some(function (id) { return !knownJobIds.has(id); });
      if (hasNew) playChime();
    } else {
      knownJobIds = new Set();
    }
    ids.forEach(function (id) { knownJobIds.add(id); });
  }

  /* ───────────── refresh orchestration ───────────── */
  function refresh() {
    return loadStats().then(function () {
      if (state.pending > 0) { markUpdated(); return; } // don't clobber an in-flight optimistic change
      var a = document.activeElement;
      var editing = a && queue.contains(a) && (a.matches && a.matches('input, select, textarea'));
      if (editing) { markUpdated(); return; } // don't clobber a dispatcher mid-edit
      return loadJobs(false);
    });
  }
  function markUpdated() { lastFetchTs = Date.now(); updateAges(); }

  function updateAges() {
    if (lastFetchTs) lastUpdatedEl.textContent = 'Updated ' + agoShort(lastFetchTs);
    var ages = queue.querySelectorAll('[data-created]');
    for (var i = 0; i < ages.length; i++) {
      ages[i].textContent = timeAgo(ages[i].getAttribute('data-created'));
    }
  }

  refreshBtn.addEventListener('click', function () { refresh(); });
  // Filters are client-side: changing one re-derives the view from the store (no
  // refetch) and exits search mode so the dropdown can't silently do nothing.
  filterStatus.addEventListener('change', function () {
    if (searchActive) clearSearch();
    filters.status = filterStatus.value;
    render(true);
  });
  filterPriority.addEventListener('change', function () {
    if (searchActive) clearSearch();
    filters.priority = filterPriority.value;
    render(true);
  });

  // Tabs (Active / Completed / Cancelled).
  if (tabBar) {
    tabBar.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-tab]');
      if (!btn) return;
      var tab = btn.getAttribute('data-tab');
      if (!TAB_STATUSES[tab]) return;
      if (searchActive) clearSearch();
      if (tab === state.tab) return;
      state.tab = tab;
      filters.status = ''; if (filterStatus) filterStatus.value = ''; // status filter is per-active-tab
      render(true);
    });
  }

  // "My jobs" toggle (dispatch only).
  if (myJobsToggle) {
    myJobsToggle.addEventListener('click', function () {
      state.myJobsOnly = !state.myJobsOnly;
      myJobsToggle.classList.toggle('is-on', state.myJobsOnly);
      myJobsToggle.setAttribute('aria-pressed', state.myJobsOnly ? 'true' : 'false');
      render(true);
    });
  }

  /* ───────────── per-card actions (event delegation) ───────────── */
  queue.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    var pencil = e.target.closest('.ed-pencil');
    if (pencil) { startEdit(pencil); return; }
    var edSave = e.target.closest('.ed-save');
    if (edSave) { commitEdit(edSave.closest('.editable')); return; }
    var edCancel = e.target.closest('.ed-cancel');
    if (edCancel) { restoreView(edCancel.closest('.editable')); return; }
    var histBtn = e.target.closest('[data-history-toggle]');
    if (histBtn) { toggleHistory(histBtn); return; }
    var assignBtn = e.target.closest('.btn-assign');
    if (assignBtn) { doAssign(assignBtn); return; }
    var priceBtn = e.target.closest('.btn-price');
    if (priceBtn) { doSetPrice(priceBtn); return; }
    var phoneBtn = e.target.closest('.job-phone[data-phone]');
    if (phoneBtn) { openCustomerHistory(phoneBtn.getAttribute('data-phone')); return; }
  });
  queue.addEventListener('change', function (e) {
    var sel = e.target.closest && e.target.closest('.status-select');
    if (sel) doStatus(sel);
  });
  // Enter inside a price input saves it.
  queue.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('price-input')) {
      e.preventDefault();
      var card = e.target.closest('.job-card');
      var btn = card && card.querySelector('.btn-price');
      if (btn) doSetPrice(btn);
      return;
    }
    // Inline editors: Enter saves (single-line only), Escape cancels.
    if (e.target.classList && e.target.classList.contains('ed-input')) {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        commitEdit(e.target.closest('.editable'));
      } else if (e.key === 'Escape') {
        e.preventDefault();
        restoreView(e.target.closest('.editable'));
      }
    }
  });

  // Expand/collapse a card's history panel. Tracked in state.expanded so the
  // panel stays open through re-renders (auto-refresh, optimistic updates).
  function toggleHistory(btn) {
    var card = btn.closest('.job-card'); if (!card) return;
    var id = card.getAttribute('data-id');
    var panel = card.querySelector('[data-history]');
    var open = btn.getAttribute('aria-expanded') === 'true';
    var next = !open;
    btn.setAttribute('aria-expanded', next ? 'true' : 'false');
    if (panel) panel.hidden = !next;
    var caret = btn.querySelector('.hist-caret');
    if (caret) caret.textContent = next ? '▾' : '▸';
    if (next) state.expanded[id] = true; else delete state.expanded[id];
  }

  function doSetPrice(btn) {
    var card = btn.closest('.job-card'); if (!card) return;
    var id = card.getAttribute('data-id');
    var input = card.querySelector('.price-input');
    var raw = (input.value || '').trim();
    if (raw === '') { toast('Enter a price first.', 'err'); input.focus(); return; }
    var price = Number(raw);
    if (isNaN(price) || price < 0) { toast('Enter a valid price.', 'err'); input.focus(); return; }
    btn.disabled = true; var label = btn.textContent; btn.textContent = '…';
    authedFetch('/api/dispatch/' + id + '/price', { method: 'PATCH', json: { price: price } })
      .then(function (res) {
        btn.disabled = false; btn.textContent = label;
        if (res.ok) {
          if (res.data && res.data.price != null) input.value = res.data.price;
          var jb = findJob(id); if (jb) jb.price = (res.data && res.data.price != null) ? res.data.price : price;
          toast('Price saved · ' + fmtMoney(res.data ? res.data.price : price), 'ok');
          loadStats(); // revenue counters may shift
        } else if (res.status !== 401) {
          toast((res.data && res.data.message) || 'Could not save the price.', 'err');
        }
      });
  }

  function doAssign(btn) {
    var card = btn.closest('.job-card'); if (!card) return;
    var id = card.getAttribute('data-id');
    var sel = card.querySelector('.tech-select');
    var input = card.querySelector('.tech-input');

    var body, displayName;
    if (sel) {
      var tid = sel.value;
      if (!tid) { toast('Select a technician first.', 'err'); sel.focus(); return; }
      body = { technicianId: tid };
      displayName = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : '';
    } else if (input) {
      var name = (input.value || '').trim();
      if (!name) { toast('Enter a technician name first.', 'err'); input.focus(); return; }
      body = { assignedTo: name };
      displayName = name;
    } else { return; }

    var job = findJob(id);
    var prevAssigned = job ? job.assignedTo : '';
    var prevTechId = job ? job.technicianId : null;
    // Optimistic: show the name immediately (prominent tag updates on re-render).
    if (job) {
      job.assignedTo = displayName;
      job.technicianId = body.technicianId || null;
      render(false);
    }
    btn.disabled = true; var label = btn.textContent; btn.textContent = '…';
    state.pending++;
    authedFetch('/api/dispatch/' + id + '/assign', { method: 'PATCH', json: body })
      .then(function (res) {
        state.pending--;
        if (res.ok) {
          var nm = (res.data && res.data.assignedTo) || displayName;
          reconcileJob(res.data); // authoritative; also re-enables the (rebuilt) button
          toast('Assigned to ' + nm, 'ok');
        } else if (res.status !== 401) {
          if (job) { job.assignedTo = prevAssigned; job.technicianId = prevTechId; render(false); }
          else { btn.disabled = false; btn.textContent = label; }
          toast((res.data && res.data.message) || 'Could not assign — try again.', 'err');
        } else {
          btn.disabled = false; btn.textContent = label;
        }
      });
  }

  function doStatus(sel) {
    var card = sel.closest('.job-card'); if (!card) return;
    var id = card.getAttribute('data-id');
    var next = sel.value;
    var current = sel.getAttribute('data-current');
    if (next === current) return;

    var job = findJob(id);
    if (!job) {
      // Not in the store (e.g. a search result) — patch + update this card only.
      sel.disabled = true;
      authedFetch('/api/dispatch/' + id + '/status', { method: 'PATCH', json: { status: next } }).then(function (res) {
        sel.disabled = false;
        if (res.ok) {
          sel.setAttribute('data-current', next);
          var b = card.querySelector('[data-status-badge]');
          if (b) { b.className = 'badge status status-' + next; b.setAttribute('data-status-badge', ''); b.textContent = STATUS_LABEL[next]; }
          toast('Status → ' + STATUS_LABEL[next], 'ok'); loadStats();
        } else if (res.status !== 401) {
          sel.value = current; toast((res.data && res.data.message) || 'Could not update status.', 'err');
        }
      });
      return;
    }

    var prevStatus = job.status;
    var prevHistory = (job.statusHistory || []).slice();
    // Optimistic: update the store + append a provisional history entry, then
    // re-render so the card moves tabs / leaves a filtered view and the count
    // badges update immediately — no full reload.
    job.status = next;
    job.statusHistory = prevHistory.concat([{ status: next, changedBy: currentUserName() || 'you', timestamp: new Date().toISOString() }]);
    state.pending++;
    render(false);
    authedFetch('/api/dispatch/' + id + '/status', { method: 'PATCH', json: { status: next } })
      .then(function (res) {
        state.pending--;
        if (res.ok) {
          reconcileJob(res.data); // swap in the authoritative doc + real history
          toast('Status → ' + STATUS_LABEL[next], 'ok');
          loadStats();
        } else if (res.status !== 401) {
          job.status = prevStatus; job.statusHistory = prevHistory; // revert
          render(false);
          toast((res.data && res.data.message) || 'Could not update status.', 'err');
        }
      });
  }

  /* ───────────── job search (by jobId or phone) ───────────── */
  if (searchForm) {
    searchForm.addEventListener('submit', function (e) {
      e.preventDefault();
      runSearch();
    });
  }
  if (searchClear) searchClear.addEventListener('click', exitSearch);

  function runSearch() {
    var q = (searchInput.value || '').trim();
    if (!q) { exitSearch(); return; }
    var param;
    if (/^\d{7}$/.test(q)) {
      param = 'jobId=' + encodeURIComponent(q);
    } else {
      var digits = q.replace(/[^\d+]/g, '');
      if (!digits) { toast('Enter a 7-digit Job ID or a phone number.', 'err'); return; }
      param = 'phone=' + encodeURIComponent(digits);
    }
    searchActive = true;
    queue.innerHTML = '<div class="queue-loading">Searching…</div>';
    authedFetch('/api/dispatch/search?' + param).then(function (res) {
      if (!res.ok) {
        if (res.status !== 401) {
          queue.innerHTML = '<div class="queue-empty">' +
            ((res.data && res.data.message) || 'Search failed — try again.') + '</div>';
        }
        return;
      }
      var items = (res.data && res.data.items) || [];
      state.searchResults = items;       // search spans all tabs; render() shows these
      render(true);                      // tab bar hides while searchActive
      searchMeta.hidden = false;
      searchMeta.innerHTML = 'Showing ' + items.length + ' result' + (items.length === 1 ? '' : 's') +
        ' for <b>' + esc(q) + '</b> · <button type="button" class="link-btn" id="searchMetaClear">show full queue</button>';
      var c = $('searchMetaClear'); if (c) c.addEventListener('click', exitSearch);
      if (searchClear) searchClear.hidden = false;
      markUpdated();
    });
  }
  // Reset the search UI/state without refetching (used when a filter/tab takes over).
  function clearSearch() {
    searchActive = false;
    state.searchResults = [];
    if (searchInput) searchInput.value = '';
    if (searchClear) searchClear.hidden = true;
    if (searchMeta) { searchMeta.hidden = true; searchMeta.innerHTML = ''; }
  }
  function exitSearch() {
    clearSearch();
    loadJobs(true); // pull a fresh working set on an explicit exit
  }

  /* ───────────── customer history modal ───────────── */
  function openCustomerHistory(phone) {
    if (!phone || !custModal) return;
    custModal.hidden = false;
    void custModal.offsetWidth;            // reflow → fade-in transition
    custModal.classList.add('is-open');
    custBody.innerHTML = '<div class="cust-loading">Loading…</div>';
    custTitle.textContent = 'Customer · ' + phone;
    authedFetch('/api/dispatch/customer/' + encodeURIComponent(phone)).then(function (res) {
      if (!res.ok) {
        if (res.status === 401) { closeCustModal(); return; }
        custBody.innerHTML = '<div class="cust-empty">' + ((res.data && res.data.message) || 'Could not load customer history.') + '</div>';
        return;
      }
      renderCustomerHistory(res.data || {});
    });
  }
  function renderCustomerHistory(data) {
    var s = data.summary || {};
    var jobs = data.jobs || [];
    var tel = telHref(data.phone || '');
    var head =
      '<div class="cust-summary">' +
        '<div class="cust-stat"><span class="cust-stat-num">' + (s.totalJobs || 0) + '</span><span class="cust-stat-label">Total jobs</span></div>' +
        '<div class="cust-stat"><span class="cust-stat-num">' + (s.completedJobs || 0) + '</span><span class="cust-stat-label">Completed</span></div>' +
        '<div class="cust-stat"><span class="cust-stat-num">' + fmtMoney(s.totalRevenue || 0) + '</span><span class="cust-stat-label">Total revenue</span></div>' +
      '</div>' +
      '<div class="cust-contact">' +
        (tel ? '<a class="cust-call" href="' + esc(tel) + '">Call ' + esc(data.phone || '') + '</a>' : '') +
        '<span class="cust-dates">First: ' + fmtDate(s.firstContact) + ' · Last: ' + fmtDate(s.lastContact) + '</span>' +
      '</div>';
    var rows = jobs.length
      ? jobs.map(function (j) {
          var st = STATUS_LABEL[j.status] ? j.status : 'pending-review';
          return '<div class="cust-job">' +
            '<div class="cust-job-top">' +
              '<span class="cust-job-id">' + (j.jobId ? '#' + esc(j.jobId) : '—') + '</span>' +
              '<span class="badge status status-' + st + '">' + STATUS_LABEL[st] + '</span>' +
              '<span class="cust-job-date">' + fmtDate(j.createdAt) + '</span>' +
            '</div>' +
            '<div class="cust-job-svc">' + esc(j.serviceType || '—') +
              (j.price != null ? '<span class="cust-job-price">' + fmtMoney(j.price) + '</span>' : '') +
            '</div>' +
          '</div>';
        }).join('')
      : '<div class="cust-empty">No past jobs on record.</div>';
    custBody.innerHTML = head + '<div class="cust-jobs">' + rows + '</div>';
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function closeCustModal() {
    if (!custModal) return;
    custModal.classList.remove('is-open');
    setTimeout(function () { if (!custModal.classList.contains('is-open')) custModal.hidden = true; }, 170);
  }
  if (custClose) custClose.addEventListener('click', closeCustModal);
  if (custModal) custModal.addEventListener('click', function (e) { if (e.target === custModal) closeCustModal(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && custModal && !custModal.hidden) closeCustModal();
  });

  /* ───────────── notification sound + mute ───────────── */
  function initMute() {
    try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) {}
    reflectMute();
  }
  function reflectMute() {
    if (!muteToggle) return;
    var on = muteToggle.querySelector('.mute-ico-on');
    var off = muteToggle.querySelector('.mute-ico-off');
    if (on) on.style.display = muted ? 'none' : '';
    if (off) off.style.display = muted ? '' : 'none';
    muteToggle.setAttribute('aria-label', muted ? 'Unmute new-job sound' : 'Mute new-job sound');
    muteToggle.setAttribute('title', muted ? 'Unmute new-job sound' : 'Mute new-job sound');
    muteToggle.classList.toggle('is-muted', muted);
  }
  if (muteToggle) {
    muteToggle.addEventListener('click', function () {
      muted = !muted;
      try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) {}
      reflectMute();
      if (!muted) { unlockAudio(); playChime(); }   // confirm sound on unmute
    });
  }
  // Browsers block audio until a user gesture — unlock on the first interaction.
  function unlockAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { audioCtx = null; }
  }
  ['click', 'keydown', 'touchstart'].forEach(function (ev) {
    window.addEventListener(ev, unlockAudio, { once: true, passive: true });
  });
  // A short, soft two-note chime via Web Audio (no asset file needed).
  function playChime() {
    if (muted) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var t0 = audioCtx.currentTime;
      [[880.0, 0], [1174.66, 0.12]].forEach(function (pair) {
        var freq = pair[0], at = pair[1];
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t0 + at);
        gain.gain.exponentialRampToValueAtTime(0.12, t0 + at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.35);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(t0 + at); osc.stop(t0 + at + 0.4);
      });
    } catch (e) { /* audio unavailable — silent */ }
  }

  /* ───────────── toast ───────────── */
  function toast(msg, kind) {
    toastEl.textContent = msg;
    toastEl.className = 'toast show' + (kind ? ' ' + kind : '');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.className = 'toast'; }, 3200);
  }

  /* ───────────── tickers ───────────── */
  setInterval(function () { if (hasActiveSession() && !dashView.hidden) updateAges(); }, 15000);     // freshen "X min ago" labels
  setInterval(function () { if (hasActiveSession() && !dashView.hidden) refresh(); }, REFRESH_MS);    // 25s auto-refresh

  /* ───────────── boot ───────────── */
  function init() {
    initTheme();
    initMute();
    if (EMBED) {
      // Embedded in the admin panel: reuse the admin JWT, skip the login UI.
      document.body.classList.add('is-embed');
      if (activeToken()) showDashboard();
      else if (queue) { dashView.hidden = false; loginView.hidden = true; queue.innerHTML = '<div class="queue-empty">Open the dispatch board from the admin panel.</div>'; }
      return;
    }
    var s = getSession();
    if (s && s.token) {
      // A tab left open past the idle window should not silently resume.
      if (Date.now() - (s.lastActivity || s.createdAt || 0) > IDLE_MS) { logout('idle'); return; }
      lastActivity = s.lastActivity || Date.now();
      showDashboard();
    } else {
      showLogin();
    }
  }
  init();
})();
