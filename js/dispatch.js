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
  var REFRESH_MS  = 60 * 1000;       // job-queue auto-refresh
  var JOB_LIMIT   = 100;
  var THEME_KEY   = 'aston_dispatch_theme';   // localStorage — persists across sessions

  var PRIORITY_RANK  = { emergency: 0, high: 1, normal: 2, low: 3 };
  var PRIORITY_LABEL = { emergency: 'Emergency', high: 'High', normal: 'Normal', low: 'Low' };
  var STATUS_LABEL   = {
    'pending-review': 'Pending Review', 'approved': 'Approved', 'assigned': 'Assigned',
    'in-progress': 'In Progress', 'completed': 'Completed', 'cancelled': 'Cancelled'
  };
  var STATUS_ORDER = ['pending-review', 'approved', 'assigned', 'in-progress', 'completed', 'cancelled'];
  var TERMINAL = { completed: 1, cancelled: 1 }; // sorted to the bottom of the live queue

  /* ───────────── DOM refs ───────────── */
  var $ = function (id) { return document.getElementById(id); };
  var loginView = $('loginView'), dashView = $('dashView');
  var loginForm = $('loginForm'), loginUser = $('loginUser'), loginPass = $('loginPass');
  var loginBtn = $('loginBtn'), loginError = $('loginError'), loginNotice = $('loginNotice');
  var topUser = $('topUser'), logoutBtn = $('logoutBtn'), themeToggle = $('themeToggle');
  var statToday = $('statToday'), statPending = $('statPending'), statProgress = $('statProgress'), statCompleted = $('statCompleted');
  var filterStatus = $('filterStatus'), filterPriority = $('filterPriority');
  var queue = $('queue'), lastUpdatedEl = $('lastUpdated'), refreshBtn = $('refreshBtn'), toastEl = $('toast');

  var filters = { status: '', priority: '' };
  var lastActivity = Date.now();
  var lastFetchTs = 0;
  var toastTimer = null;
  var technicians = [];   // active technicians for the assign dropdown (Fix 3)

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
    lastActivity = Date.now();
    // Load technicians first so the very first render of the queue already has
    // the assign dropdown populated.
    loadTechnicians().then(refresh);
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
    var prio = PRIORITY_RANK[job.priority] != null ? job.priority : 'normal';
    var status = STATUS_LABEL[job.status] ? job.status : 'pending-review';
    var tel = telHref(job.phone);
    var phoneInner = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h4l2 5-2 2a12 12 0 005 5l2-2 5 2v4a2 2 0 01-2 2A18 18 0 013 5a2 2 0 012-2z"/></svg>' + esc(job.phone || '');
    var phoneHtml = tel
      ? '<a class="job-phone" href="' + esc(tel) + '">' + phoneInner + '</a>'
      : '<span class="job-phone" style="border:0;color:var(--muted)">' + esc(job.phone || '') + '</span>';

    var ai = '';
    if (job.aiSummary) {
      var aiPrio = job.aiSuggestedPriority
        ? '<span class="ai-prio"> · suggests ' + esc(PRIORITY_LABEL[job.aiSuggestedPriority] || job.aiSuggestedPriority) + '</span>'
        : '';
      ai = '<div class="job-ai"><span class="job-ai-label">AI Summary' + aiPrio + '</span><p>' + esc(job.aiSummary) + '</p></div>';
    }

    // Full notes — show description plus any serviceDetails/notes the source
    // carried, deduped, each on its own line below the service type.
    var detailParts = [];
    [job.description, job.serviceDetails, job.notes].forEach(function (v) {
      v = (v == null ? '' : String(v)).trim();
      if (v && detailParts.indexOf(v) === -1) detailParts.push(v);
    });
    var desc = detailParts.map(function (p) { return '<p class="job-desc">' + esc(p) + '</p>'; }).join('');
    var sourceTag = job.source ? '<span class="job-source">' + esc(job.source) + '</span>' : '';
    var postalHtml = job.postalCode
      ? '<div class="job-postal"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0118 0z"/><circle cx="12" cy="10" r="2.6"/></svg>' + esc(job.postalCode) + '</div>'
      : '';
    var assigned = job.assignedTo
      ? 'Assigned to <b>' + esc(job.assignedTo) + '</b>'
      : '';

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

    return '' +
      '<div class="job-top">' +
        '<div class="job-badges">' +
          '<span class="badge prio prio-' + prio + '">' + PRIORITY_LABEL[prio] + '</span>' +
          '<span class="badge status status-' + status + '" data-status-badge>' + STATUS_LABEL[status] + '</span>' +
        '</div>' +
        '<time class="job-age" data-created="' + esc(job.createdAt) + '">' + timeAgo(job.createdAt) + '</time>' +
      '</div>' +
      '<div class="job-customer">' +
        '<span class="job-name">' + esc(job.customerName || 'Unknown') + '</span>' +
        phoneHtml + sourceTag +
      '</div>' +
      postalHtml +
      '<div class="job-service">' +
        '<span class="job-service-type">' + esc(job.serviceType || '—') + '</span>' +
        desc +
      '</div>' +
      ai +
      '<div class="assigned-pill" data-assigned' + (assigned ? '' : ' hidden') + '>' + assigned + '</div>' +
      '<div class="job-controls">' +
        '<div class="assign-row">' +
          assignControl +
          '<button type="button" class="btn btn-assign">Assign</button>' +
        '</div>' +
        techNote +
        '<label class="status-row"><span>Update status</span>' +
          '<select class="status-select" data-current="' + status + '" aria-label="Update status">' + statusOptions(status) + '</select>' +
        '</label>' +
      '</div>';
  }

  function renderJobs(items) {
    if (!items.length) {
      var none = (filters.status || filters.priority)
        ? 'No jobs match these filters.'
        : 'No dispatch jobs yet.';
      queue.innerHTML = '<div class="queue-empty">' + none + '</div>';
      return;
    }
    var sorted = sortJobs(items);
    var frag = document.createDocumentFragment();
    sorted.forEach(function (job) {
      var card = document.createElement('article');
      card.className = 'job-card prio-' + (PRIORITY_RANK[job.priority] != null ? job.priority : 'normal');
      card.setAttribute('data-id', job._id || job.id || '');
      card.innerHTML = cardHtml(job);
      frag.appendChild(card);
    });
    queue.innerHTML = '';
    queue.appendChild(frag);
  }

  function loadJobs() {
    var params = new URLSearchParams();
    params.set('limit', String(JOB_LIMIT));
    if (filters.status) params.set('status', filters.status);
    if (filters.priority) params.set('priority', filters.priority);
    return authedFetch('/api/dispatch?' + params.toString()).then(function (res) {
      if (!res.ok) {
        if (res.status !== 401) {
          queue.innerHTML = '<div class="queue-empty">Couldn’t load the job queue' +
            (res.status === 0 ? ' — backend unreachable.' : '.') + ' <button type="button" class="btn btn-ghost" id="retryBtn" style="margin-top:10px;">Retry</button></div>';
          var rb = $('retryBtn'); if (rb) rb.addEventListener('click', loadJobs);
        }
        return;
      }
      var items = (res.data && res.data.items) || [];
      renderJobs(items);
      markUpdated();
    });
  }

  /* ───────────── refresh orchestration ───────────── */
  function refresh() {
    return loadStats().then(function () {
      var a = document.activeElement;
      var editing = a && queue.contains(a) && (a.matches && a.matches('input, select'));
      if (editing) { markUpdated(); return; } // don't clobber a dispatcher mid-edit
      return loadJobs();
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
  filterStatus.addEventListener('change', function () { filters.status = filterStatus.value; loadJobs(); });
  filterPriority.addEventListener('change', function () { filters.priority = filterPriority.value; loadJobs(); });

  /* ───────────── per-card actions (event delegation) ───────────── */
  queue.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.btn-assign');
    if (btn) doAssign(btn);
  });
  queue.addEventListener('change', function (e) {
    var sel = e.target.closest && e.target.closest('.status-select');
    if (sel) doStatus(sel);
  });

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

    btn.disabled = true; var label = btn.textContent; btn.textContent = '…';
    authedFetch('/api/dispatch/' + id + '/assign', { method: 'PATCH', json: body })
      .then(function (res) {
        btn.disabled = false; btn.textContent = label;
        if (res.ok) {
          // Prefer the name the backend snapshotted onto the job.
          var nm = (res.data && res.data.assignedTo) || displayName;
          var pill = card.querySelector('[data-assigned]');
          if (pill) { pill.innerHTML = 'Assigned to <b>' + esc(nm) + '</b>'; pill.hidden = false; }
          toast('Assigned to ' + nm, 'ok');
        } else if (res.status !== 401) {
          toast((res.data && res.data.message) || 'Could not assign — try again.', 'err');
        }
      });
  }

  function doStatus(sel) {
    var card = sel.closest('.job-card'); if (!card) return;
    var id = card.getAttribute('data-id');
    var next = sel.value;
    var current = sel.getAttribute('data-current');
    if (next === current) return;
    sel.disabled = true;
    authedFetch('/api/dispatch/' + id + '/status', { method: 'PATCH', json: { status: next } })
      .then(function (res) {
        sel.disabled = false;
        if (res.ok) {
          sel.setAttribute('data-current', next);
          var badge = card.querySelector('[data-status-badge]');
          if (badge) { badge.className = 'badge status status-' + next; badge.setAttribute('data-status-badge', ''); badge.textContent = STATUS_LABEL[next]; }
          toast('Status → ' + STATUS_LABEL[next], 'ok');
          loadStats(); // keep the counters honest
        } else if (res.status !== 401) {
          sel.value = current; // revert the dropdown
          toast((res.data && res.data.message) || 'Could not update status.', 'err');
        }
      });
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
  setInterval(function () { if (hasActiveSession() && !dashView.hidden) refresh(); }, REFRESH_MS);    // 60s auto-refresh

  /* ───────────── boot ───────────── */
  function init() {
    initTheme();
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
