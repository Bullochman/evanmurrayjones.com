/*
 * auth.js — client-side "soft gate" for the QR generator on EvanMurrayJones.com
 * ----------------------------------------------------------------------------
 * HONEST SECURITY NOTE — READ THIS:
 *
 * This is a SOFT, CLIENT-SIDE gate. The site is static (GitHub Pages, no
 * backend), so ALL of this logic — including the usernames and password
 * hashes below — ships to the browser and can be read by anyone who opens
 * dev tools. This is NOT bank-grade security and is NOT a substitute for
 * real server-side authentication.
 *
 * What it DOES do well enough for this use case:
 *   - keeps casual/accidental visitors out,
 *   - gives each family member their own username + password,
 *   - avoids storing any plaintext password (only a salted SHA-256 hash).
 *
 * A determined, technical person can bypass it by reading this file. That is
 * an ACCEPTED limitation here: this only gates a personal QR-code generator
 * for family use — low stakes. If this ever guards anything sensitive, move
 * the auth check to a real server.
 * ----------------------------------------------------------------------------
 */

(function () {
  'use strict';

  var SESSION_KEY = 'emj_qr_session';

  /**
   * Convert an ArrayBuffer to a lowercase hex string.
   */
  function bufToHex(buffer) {
    var bytes = new Uint8Array(buffer);
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
  }

  /**
   * Compute SHA-256 hex of `${salt}:${password}` using the Web Crypto API.
   * Returns a Promise resolving to the lowercase hex digest.
   */
  async function sha256Hex(salt, password) {
    var data = new TextEncoder().encode(salt + ':' + password);
    var digest = await crypto.subtle.digest('SHA-256', data);
    return bufToHex(digest);
  }

  /* --- Safe sessionStorage helpers (degrade if storage is blocked) ------- */

  function storageGet(key) {
    try {
      return window.sessionStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      window.sessionStorage.setItem(key, value);
      return true;
    } catch (e) {
      return false;
    }
  }

  function storageRemove(key) {
    try {
      window.sessionStorage.removeItem(key);
    } catch (e) {
      /* ignore */
    }
  }

  window.Gate = {
    /*
     * Map of username -> { salt, hash }.
     * hash = SHA-256 hex of `${salt}:${password}`.
     *
     * Seeded with one real user. The hash below corresponds to a password the
     * owner holds. To add users later, run (in the browser console):
     *     await Gate.makeHash("some-salt", "their-password")
     * and paste the returned hex string in as a new entry.
     */
    users: {
      cecilia: {
        salt: 'emj-qr-2026',
        hash: '92b01e2caee495b71344045aceb53dae1333000dab00277ac7edb956db6e96f9'
      }
    },

    /**
     * True if a valid session is active (a known username is stored).
     */
    isAuthed: function () {
      var user = storageGet(SESSION_KEY);
      return !!user && Object.prototype.hasOwnProperty.call(this.users, user);
    },

    /**
     * The logged-in username, or null.
     */
    currentUser: function () {
      var user = storageGet(SESSION_KEY);
      if (user && Object.prototype.hasOwnProperty.call(this.users, user)) {
        return user;
      }
      return null;
    },

    /**
     * Attempt a login. Username is matched case-insensitively and trimmed.
     * Computes SHA-256 hex of `${salt}:${password}` and compares to the stored
     * hash. On match, stores the (canonical) username in sessionStorage and
     * returns true. On any failure — unknown user, wrong password, or crypto
     * error — returns false. Never throws on a wrong password.
     */
    login: async function (username, password) {
      try {
        if (typeof username !== 'string' || typeof password !== 'string') {
          return false;
        }

        var key = username.trim().toLowerCase();
        var record = Object.prototype.hasOwnProperty.call(this.users, key)
          ? this.users[key]
          : null;

        if (!record) {
          return false;
        }

        var computed = await sha256Hex(record.salt, password);
        if (computed === record.hash) {
          storageSet(SESSION_KEY, key);
          return true;
        }
        return false;
      } catch (e) {
        return false;
      }
    },

    /**
     * Clear the current session.
     */
    logout: function () {
      storageRemove(SESSION_KEY);
    },

    /**
     * Owner helper: compute the SHA-256 hex of `${salt}:${password}` to paste
     * into `users` when minting a new account. Returns a Promise<string>.
     *   e.g. await Gate.makeHash("emj-qr-2026", "reef-116e1a-wave")
     */
    makeHash: async function (salt, password) {
      return sha256Hex(salt, password);
    }
  };
})();
