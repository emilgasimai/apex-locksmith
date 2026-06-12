/* ============================================================================
   admin-store.js — Aston Admin storage layer (BACKEND-FIRST)
   ----------------------------------------------------------------------------
   This is the ONLY module that talks to persistence. As designed, swapping
   localStorage for the real backend happened inside this file — call sites in
   admin.js kept the same async signatures.

   Backend (window.API_BASE_URL from config.js):
     POST /api/auth/login                  → { token }  (JWT)
     GET  /api/content                     → { content: <bundle> }
     PUT  /api/content                     → save the whole bundle (auth)
     GET  /api/content/snapshots             → list snapshots (auth)
     POST /api/content/snapshots             → create snapshot (auth)
     POST /api/content/snapshots/:id/restore → restore snapshot (auth)
     PATCH  /api/content/snapshots/:id       → rename snapshot (auth)
     DELETE /api/content/snapshots/:id       → delete snapshot (auth; 403 if protected)
     POST /api/upload                        → upload image, returns { url, publicId } (auth)

   The bundle is one document holding every admin-managed channel:
     { content, carousel, services, business, reviews, menu }

   Offline fallback: every read/write is mirrored to the same localStorage keys
   the public site reads (apex_admin_*_v1), so (a) the public site keeps
   working from the last-known state if the backend is down, and (b) the admin
   can keep editing locally — with a clear warning — until it comes back.

   Session: JWT kept in memory + sessionStorage (NOT localStorage), so closing
   the tab signs the admin out. A 401 from any call clears the session and
   fires 'admin:unauthorized' (admin.js redirects to the login view).
   ============================================================================ */

const AdminStore = (function () {
  const KEYS = {
    session: 'apex_admin_session_v1',   // sessionStorage (JWT lives here)
    content: 'apex_admin_content_v1',
    carousel: 'apex_admin_carousel_v1',
    services: 'apex_admin_services_v1',
    business: 'apex_admin_business_v1',
    reviews: 'apex_admin_reviews_v1',
    menu: 'apex_admin_menu_v1',
  };
  const BUNDLE_KEYS = ['content', 'carousel', 'services', 'business', 'reviews', 'menu'];
  const DEFAULT_PREFIX = '[DEFAULT] ';

  /* ── tiny utils ── */
  function readLocal(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  }
  function writeLocal(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch { /* storage full/blocked — non-fatal */ }
  }
  function emit(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch {}
  }

  /* ── session (memory + sessionStorage) ── */
  let memSession = null;
  function readSession() {
    if (memSession) return memSession;
    try {
      const raw = sessionStorage.getItem(KEYS.session);
      memSession = raw ? JSON.parse(raw) : null;
    } catch { memSession = null; }
    return memSession;
  }
  function writeSession(s) {
    memSession = s;
    try {
      if (s) sessionStorage.setItem(KEYS.session, JSON.stringify(s));
      else sessionStorage.removeItem(KEYS.session);
    } catch {}
  }

  /* ── authed backend call; 401 → sign out + notify admin.js ── */
  let backendDown = false;
  function markOffline() {
    if (!backendDown) {
      backendDown = true;
      emit('admin:offline', { message: 'Backend unreachable — changes are being kept locally only.' });
    }
  }
  function markOnline() { backendDown = false; }

  async function api(path, options) {
    options = options || {};
    const s = readSession();
    if (s && s.token) options.token = s.token;
    const res = await window.apiFetch(path, options);
    if (res.status === 401) {
      writeSession(null);
      emit('admin:unauthorized', {});
    }
    if (res.status === 0) markOffline(); else markOnline();
    return res;
  }

  /* ── the content bundle (single source of truth on the backend) ── */
  let bundle = null;        // { content, carousel, services, business, reviews, menu }
  let bundleLoaded = false; // true once we tried the backend at least once

  function bundleFromLocal() {
    const b = {};
    BUNDLE_KEYS.forEach(function (k) { b[k] = readLocal(KEYS[k], null); });
    return b;
  }
  function mirrorBundle(b) {
    BUNDLE_KEYS.forEach(function (k) { writeLocal(KEYS[k], b[k] == null ? null : b[k]); });
  }

  async function ensureBundle(force) {
    if (bundleLoaded && !force) return bundle;
    const res = await api('/api/content');
    if (res.ok && res.data) {
      const remote = res.data.content || {};
      if (remote && typeof remote === 'object' && Object.keys(remote).length) {
        bundle = {};
        BUNDLE_KEYS.forEach(function (k) { bundle[k] = remote[k] != null ? remote[k] : null; });
        mirrorBundle(bundle);
      } else {
        // Backend reachable but nothing published yet → seed from local mirror.
        bundle = bundleFromLocal();
      }
    } else {
      // Backend unreachable → offline fallback to the local mirror.
      bundle = bundleFromLocal();
    }
    bundleLoaded = true;
    return bundle;
  }

  // PUT the whole bundle. Tolerates either { content: bundle } or raw-bundle
  // request schemas. Returns true when persisted remotely.
  async function pushBundle() {
    if (!bundle) return false;
    let res = await api('/api/content', { method: 'PUT', json: { content: bundle } });
    if (!res.ok && res.status === 400) {
      res = await api('/api/content', { method: 'PUT', json: bundle });
    }
    if (!res.ok) { if (res.status === 0) markOffline(); return false; }
    return true;
  }

  async function saveSection(key, value) {
    await ensureBundle();
    bundle[key] = value == null ? null : value;
    writeLocal(KEYS[key], value);
    const remote = await pushBundle();
    if (!remote) emit('admin:offline', { message: 'Backend unreachable — saved locally only.' });
    return { ok: true, remote: remote };
  }

  /* ── snapshots (version history + Default checkpoints) ── */
  let lastSnapshotsRaw = [];   // cache for restore-fallback
  let snapFetchedAt = 0;       // short TTL so getVersions + getDefault* share one GET

  function mapSnapshot(s) {
    const label = s.label || s.name || null;
    const isDefault = !!(label && label.indexOf(DEFAULT_PREFIX) === 0);
    const cleanName = isDefault ? label.slice(DEFAULT_PREFIX.length).trim() : label;
    return {
      id: s.id || s._id || null,
      ts: s.ts || (s.createdAt ? Date.parse(s.createdAt) : Date.now()),
      name: cleanName || null,
      isDefault: isDefault,
      data: s.content || s.data || null,
    };
  }

  async function fetchSnapshots() {
    if (Date.now() - snapFetchedAt < 1500 && lastSnapshotsRaw.length) return lastSnapshotsRaw;
    const res = await api('/api/content/snapshots');
    if (!res.ok || !res.data) return null;   // null = backend unreachable / error
    const arr = res.data.items || res.data.snapshots || (Array.isArray(res.data) ? res.data : []);
    lastSnapshotsRaw = arr.map(mapSnapshot).filter(function (s) { return s.id != null; });
    // newest first
    lastSnapshotsRaw.sort(function (a, b) { return b.ts - a.ts; });
    snapFetchedAt = Date.now();
    return lastSnapshotsRaw;
  }

  async function createSnapshot(name, isDefault) {
    await ensureBundle();
    const label = (isDefault ? DEFAULT_PREFIX : '') + (name || '');
    const res = await api('/api/content/snapshots', {
      method: 'POST',
      json: { label: label || null, name: label || null, content: bundle },
    });
    if (res.ok) snapFetchedAt = 0;   // invalidate the short cache
    return res.ok;
  }

  async function renameSnapshotReq(id, label) {
    const res = await api('/api/content/snapshots/' + encodeURIComponent(id), {
      method: 'PATCH',
      json: { label: label },
    });
    if (res.ok) snapFetchedAt = 0;   // invalidate the short cache
    return res.ok;
  }

  // Returns { ok, status, message } so admin.js can surface the backend's
  // 403 message for protected (default-checkpoint) snapshots.
  async function deleteSnapshotReq(id) {
    const res = await api('/api/content/snapshots/' + encodeURIComponent(id), { method: 'DELETE' });
    if (res.ok) snapFetchedAt = 0;
    return { ok: res.ok, status: res.status, message: (res.data && res.data.message) || null };
  }

  async function restoreSnapshot(id) {
    let res = await api('/api/content/snapshots/' + encodeURIComponent(id) + '/restore', { method: 'POST' });
    if (!res.ok) {
      // Fallback: re-publish the snapshot's content ourselves (if we have it).
      const snap = lastSnapshotsRaw.find(function (s) { return String(s.id) === String(id); });
      if (!snap || !snap.data) return false;
      bundle = {};
      BUNDLE_KEYS.forEach(function (k) { bundle[k] = snap.data[k] != null ? snap.data[k] : null; });
      const ok = await pushBundle();
      if (!ok) return false;
    }
    // Sync the restored state down + into the local mirror.
    await ensureBundle(true);
    return true;
  }

  return {
    KEYS: KEYS,

    /* ───────────── AUTH / SESSION ───────────── */

    lastLoginError: null,   // 'invalid' | 'network' | null — admin.js reads this for messaging

    async login(username, password) {
      this.lastLoginError = null;
      const res = await window.apiFetch('/api/auth/login', {
        method: 'POST',
        json: { username: username, password: password },
      });
      if (res.ok && res.data) {
        const token = res.data.token || res.data.accessToken || res.data.jwt ||
                      (res.data.data && res.data.data.token);
        if (token) {
          const now = Date.now();
          const session = { token: token, createdAt: now, lastActivity: now };
          writeSession(session);
          markOnline();
          return session;
        }
      }
      this.lastLoginError = (res.status === 0) ? 'network' : 'invalid';
      return null;
    },

    async getSession() { return readSession(); },

    async touchSession() {
      const s = readSession();
      if (s) { s.lastActivity = Date.now(); writeSession(s); }
      return s;
    },

    async clearSession() { writeSession(null); },

    isOffline() { return backendDown; },

    /* ───────────── CONTENT BUNDLE (per-channel API kept for admin.js) ───────────── */

    async getContent()  { return (await ensureBundle()).content || {}; },
    async getCarousel() { return (await ensureBundle()).carousel; },
    async getServices() { return (await ensureBundle()).services; },
    async getBusinessInfo() { return (await ensureBundle()).business; },
    async getReviews()  { return (await ensureBundle()).reviews; },
    async getMenu()     { return (await ensureBundle()).menu; },

    async saveContent(map)     { return saveSection('content', map); },
    async saveCarousel(arr)    { return saveSection('carousel', arr); },
    async saveServices(map)    { return saveSection('services', map); },
    async saveBusinessInfo(o)  { return saveSection('business', o); },
    async saveReviews(arr)     { return saveSection('reviews', arr); },
    async saveMenu(map)        { return saveSection('menu', map); },

    // Bulk APPLY: update several channels then PUT /api/content ONCE.
    async saveBundle(partial) {
      await ensureBundle();
      Object.keys(partial || {}).forEach(function (k) {
        if (BUNDLE_KEYS.indexOf(k) !== -1) {
          bundle[k] = partial[k] == null ? null : partial[k];
          writeLocal(KEYS[k], partial[k]);
        }
      });
      const remote = await pushBundle();
      if (!remote) emit('admin:offline', { message: 'Backend unreachable — saved locally only.' });
      return { ok: true, remote: remote };
    },

    // Re-pull the published bundle from the backend (used after restores).
    async refreshBundle() { return ensureBundle(true); },

    /* ───────────── VERSION HISTORY (backend snapshots) ───────────── */
    // A version row = { id, ts, name, data } — same shape admin.js renders.

    async getVersions() {
      const list = await fetchSnapshots();
      if (list == null) return null;   // backend unreachable — admin.js shows a notice
      return list.filter(function (s) { return !s.isDefault; });
    },

    async createSnapshot(name) { return createSnapshot(name, false); },

    async restoreSnapshot(id) { return restoreSnapshot(id); },

    async renameSnapshot(id, name) { return renameSnapshotReq(id, name); },

    async deleteSnapshot(id) { return deleteSnapshotReq(id); },

    /* ───────────── DEFAULT CHECKPOINT (protected, backend snapshots) ───────────── */

    async getDefaultCheckpoint() {
      const list = await fetchSnapshots();
      if (list == null) return null;
      const defaults = list.filter(function (s) { return s.isDefault; });
      return defaults.length ? defaults[0] : null;   // newest
    },

    async getDefaultHistory() {
      const list = await fetchSnapshots();
      if (list == null) return [];
      return list.filter(function (s) { return s.isDefault; });
    },

    async saveDefaultCheckpoint(name) { return createSnapshot(name, true); },

    /* ───────────── IMAGE UPLOAD ───────────── */
    // POST /api/upload (multipart) → { url }. Falls back to ok:false so the
    // caller can keep the base64 data-URL behaviour with a warning.

    async uploadImage(file) {
      const fd = new FormData();
      // Single "image" field only — the backend uses multer.single('image')
      // and rejects requests carrying any extra file field ("Unexpected field").
      fd.append('image', file, file.name || 'upload');
      const res = await api('/api/upload', { method: 'POST', body: fd, timeout: 30000 });
      if (res.ok && res.data) {
        const url = res.data.url || res.data.secure_url || res.data.location ||
                    res.data.path || (res.data.data && res.data.data.url);
        if (url) return { ok: true, url: url };
      }
      return { ok: false, url: null };
    },
  };
})();

// Expose globally for the (non-module) admin script.
window.AdminStore = AdminStore;
