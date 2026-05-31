/* ============================================================================
   admin-store.js — Apex Admin storage layer
   ----------------------------------------------------------------------------
   This is the ONLY module that talks to persistence. Everything is keyed and
   isolated here so that swapping localStorage for a real backend later is a
   single-file change: replace the body of each method with a fetch() call and
   keep the same (async) signatures. All methods return Promises for exactly
   this reason — call sites already `await`, so going async-over-the-wire later
   requires no changes outside this file.

   Storage shapes
   --------------
   session : { token, createdAt, lastActivity }
   content : { [path]: { type: 'text'|'image-src'|'image-bg', value } }   // editor overrides
   business: { ... }   // Part 2
   reviews : [ ... ]   // Part 2
   ============================================================================ */

const AdminStore = (function () {
  const KEYS = {
    session: 'apex_admin_session_v1',
    content: 'apex_admin_content_v1',
    carousel: 'apex_admin_carousel_v1',
    services: 'apex_admin_services_v1',
    business: 'apex_admin_business_v1',
    reviews: 'apex_admin_reviews_v1',
    versions: 'apex_admin_versions_v1',
    menu: 'apex_admin_menu_v1',
    defaultCheckpoint: 'apex_default_checkpoint',
    defaultHistory: 'apex_default_history',
  };

  // Hardcoded credentials for now — see login().
  const HARDCODED_USER = 'admin';
  const HARDCODED_PASS = 'apex2025';

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
  function makeToken() {
    return 'apex-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
  }

  return {
    KEYS,

    /* ───────────── AUTH / SESSION ───────────── */

    async login(username, password) {
      // TODO: replace hardcoded auth with backend authentication
      // (POST credentials, receive a real session token / JWT from the server)
      if (username === HARDCODED_USER && password === HARDCODED_PASS) {
        const now = Date.now();
        const session = { token: makeToken(), createdAt: now, lastActivity: now };
        // TODO: replace localStorage with backend API call (persist server-issued session)
        write(KEYS.session, session);
        return session;
      }
      return null;
    },

    async getSession() {
      // TODO: replace localStorage with backend API call (validate token server-side)
      return read(KEYS.session, null);
    },

    async touchSession() {
      // Refresh the inactivity timestamp on the stored session.
      // TODO: replace localStorage with backend API call (sliding-expiry refresh)
      const s = read(KEYS.session, null);
      if (s) {
        s.lastActivity = Date.now();
        write(KEYS.session, s);
      }
      return s;
    },

    async clearSession() {
      // TODO: replace localStorage with backend API call (invalidate session server-side)
      localStorage.removeItem(KEYS.session);
    },

    /* ───────────── CONTENT EDITOR OVERRIDES ───────────── */

    async getContent() {
      // TODO: replace localStorage with backend API call (fetch published content overrides)
      return read(KEYS.content, {});
    },

    async saveContent(map) {
      // Uploaded images arrive here as base64 data URLs inside `map`.
      // TODO: upload image to backend/storage and save URL (don't ship base64 to a real DB)
      // TODO: replace localStorage with backend API call (persist content overrides)
      write(KEYS.content, map);
      return true;
    },

    /* ───────────── SERVICES CAROUSEL (Part 2) ───────────── */

    async getCarousel() {
      // Returns null when nothing has been saved (caller falls back to defaults).
      // TODO: replace localStorage with backend API call (fetch carousel cards)
      return read(KEYS.carousel, null);
    },
    async saveCarousel(arr) {
      // Uploaded card images arrive here as base64 data URLs inside `arr`.
      // TODO: upload image to backend/storage and save URL (don't ship base64 to a real DB)
      // TODO: replace localStorage with backend API call (persist carousel cards)
      write(KEYS.carousel, arr);
      return true;
    },

    /* ───────────── SERVICE FINDER (Part 2) ───────────── */

    async getServices() {
      // TODO: replace localStorage with backend API call (fetch service-finder map)
      return read(KEYS.services, null);
    },
    async saveServices(map) {
      // TODO: replace localStorage with backend API call (persist service-finder map)
      write(KEYS.services, map);
      return true;
    },

    /* ───────────── BUSINESS INFO (Part 2) ───────────── */

    async getBusinessInfo() {
      // TODO: replace localStorage with backend API call
      return read(KEYS.business, null);
    },
    async saveBusinessInfo(obj) {
      // TODO: replace localStorage with backend API call
      write(KEYS.business, obj);
      return true;
    },

    /* ───────────── REVIEWS (Part 2) ───────────── */

    async getReviews() {
      // TODO: replace localStorage with backend API call
      return read(KEYS.reviews, null);
    },
    async saveReviews(arr) {
      // TODO: replace localStorage with backend API call
      write(KEYS.reviews, arr);
      return true;
    },

    /* ───────────── ADMIN SIDEBAR MENU LABELS (Part 2) ───────────── */
    // Map of { [data-view]: customLabel }. Null/absent → use the built-in label.

    async getMenu() {
      // TODO: sync menu labels to backend
      return read(KEYS.menu, null);
    },
    async saveMenu(map) {
      // TODO: sync menu labels to backend
      write(KEYS.menu, map);
      return true;
    },

    /* ───────────── VERSION HISTORY / SAVED CHANGES (Part 2) ───────────── */
    // A snapshot = { id, ts, name, data:{ content, carousel, services, business, reviews } }.
    // The newest is stored first; the controller caps the list at 20.

    async getVersions() {
      // TODO: move version history to backend database
      return read(KEYS.versions, []);
    },
    async saveVersions(list) {
      // TODO: move version history to backend database
      write(KEYS.versions, list);
      return true;
    },

    /* ───────────── DEFAULT CHECKPOINT (protected) ───────────── */
    // The "Default" is a protected baseline kept separately from the rolling
    // 20-snapshot history. apex_default_checkpoint = the latest Default;
    // apex_default_history = every Default ever saved (never auto-deleted).

    async getDefaultCheckpoint() {
      // TODO: move to secure backend
      return read(KEYS.defaultCheckpoint, null);
    },
    async saveDefaultCheckpoint(cp) {
      // TODO: move to secure backend
      write(KEYS.defaultCheckpoint, cp);
      return true;
    },
    async getDefaultHistory() {
      // TODO: move to secure backend
      return read(KEYS.defaultHistory, []);
    },
    async saveDefaultHistory(list) {
      // TODO: move to secure backend
      write(KEYS.defaultHistory, list);
      return true;
    },
  };
})();

// Expose globally for the (non-module) admin script.
window.AdminStore = AdminStore;
