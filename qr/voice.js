/*
 * voice.js — Voice Feedback module for EvanMurrayJones.com
 *
 * Self-contained, vanilla JS, no dependencies. Exposes window.VoiceFeedback.
 *
 * A non-technical user taps a mic button and SPEAKS feedback about the QR tool.
 * The browser transcribes speech -> text via the Web Speech API, the host page
 * shows the transcript for review/edit, then submits it so it reaches the owner.
 *
 * Served over HTTPS on a real domain (NOT an iframe/artifact), so getUserMedia +
 * SpeechRecognition + speechSynthesis are available in Chrome/Safari. We still
 * feature-detect and degrade gracefully everywhere.
 *
 * Browser support caveat: SpeechRecognition (SpeechRecognition /
 * webkitSpeechRecognition) works in Chrome (desktop + Android), Edge, and Safari
 * (iOS/macOS, prefixed). Firefox does NOT implement it — supported() returns
 * false there, and the host page should show a plain <textarea> fallback.
 */
(function () {
  'use strict';

  // --- Feature detection -----------------------------------------------------

  // Grab whichever constructor the browser provides (standard or webkit-prefixed).
  var SpeechRecognitionImpl =
    window.SpeechRecognition || window.webkitSpeechRecognition || null;

  // Holds the single live recognition instance while listening (null otherwise).
  var recognition = null;

  // Accumulated finalized text across pauses. SpeechRecognition hands back only
  // the latest final segment per 'result' event, so we track the running total
  // ourselves and pass the newly-finalized chunk to onFinal.
  var finalTranscript = '';

  // Guard so stop() triggered by us doesn't surface a spurious error.
  var manualStop = false;

  // --- Small helpers ---------------------------------------------------------

  // Short random id (e.g. "k3f9 x2" style) for identifying a feedback record.
  function shortId() {
    return (
      Date.now().toString(36).slice(-4) +
      Math.random().toString(36).slice(2, 8)
    );
  }

  // Map a raw SpeechRecognition error code to a clear, user-facing message.
  function describeError(err) {
    switch (err) {
      case 'not-allowed':
      case 'service-not-allowed':
        return 'Microphone access was blocked. Please allow microphone permission and try again.';
      case 'no-speech':
        return "I didn't hear anything. Try speaking again.";
      case 'audio-capture':
        return 'No microphone was found. Please check your device and try again.';
      case 'network':
        return 'A network problem interrupted speech recognition. Please try again.';
      case 'aborted':
        return 'Listening was stopped.';
      default:
        return 'Speech recognition error: ' + (err || 'unknown') + '.';
    }
  }

  // --- Public API ------------------------------------------------------------

  window.VoiceFeedback = {
    /**
     * @returns {boolean} true if the Web Speech API (SpeechRecognition) exists.
     * When false, the host page should show a plain textarea fallback.
     */
    supported: function () {
      return !!SpeechRecognitionImpl;
    },

    /**
     * Begin continuous dictation with interim (streaming) results.
     * @param {function(string)} onPartial - called with interim text as it streams.
     * @param {function(string)} onFinal   - called with each newly-finalized chunk.
     * @param {function(string)} onError   - called with a clear error message.
     */
    start: function (onPartial, onFinal, onError) {
      onPartial = typeof onPartial === 'function' ? onPartial : function () {};
      onFinal = typeof onFinal === 'function' ? onFinal : function () {};
      onError = typeof onError === 'function' ? onError : function () {};

      if (!SpeechRecognitionImpl) {
        onError(
          'Speech recognition is not supported in this browser. ' +
            'Try Chrome or Safari, or type your feedback instead.'
        );
        return;
      }

      // If something is already running, stop it cleanly before restarting.
      if (recognition) {
        try {
          manualStop = true;
          recognition.stop();
        } catch (e) {
          /* ignore */
        }
        recognition = null;
      }

      // Fresh session: reset accumulated final text and guard flag.
      finalTranscript = '';
      manualStop = false;

      try {
        recognition = new SpeechRecognitionImpl();
      } catch (e) {
        onError('Could not start speech recognition: ' + (e && e.message ? e.message : e));
        recognition = null;
        return;
      }

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      // Fired for each batch of results. We rebuild the interim string from any
      // non-final results in this event, and append any newly-final segments.
      recognition.onresult = function (event) {
        var interim = '';
        for (var i = event.resultIndex; i < event.results.length; i++) {
          var result = event.results[i];
          var text = result[0] && result[0].transcript ? result[0].transcript : '';
          if (result.isFinal) {
            // Append the finalized chunk to our running total and notify.
            var chunk = text.trim();
            if (chunk) {
              finalTranscript += (finalTranscript ? ' ' : '') + chunk;
              onFinal(chunk);
            }
          } else {
            interim += text;
          }
        }
        if (interim) {
          onPartial(interim);
        }
      };

      recognition.onerror = function (event) {
        // 'aborted' from our own stop() is expected; don't treat as an error.
        if (manualStop && event && event.error === 'aborted') {
          return;
        }
        onError(describeError(event && event.error));
      };

      // In continuous mode some browsers (notably Chrome) auto-end after a
      // silence timeout. If the user hasn't asked to stop, transparently
      // restart so dictation keeps flowing across longer pauses.
      recognition.onend = function () {
        if (manualStop || !recognition) {
          return;
        }
        try {
          recognition.start();
        } catch (e) {
          // If we can't restart (e.g. too-rapid restart), surface it quietly.
          onError(describeError('aborted'));
        }
      };

      try {
        recognition.start();
      } catch (e) {
        // Calling start() twice throws; report a friendly message.
        onError('Could not start listening: ' + (e && e.message ? e.message : e));
      }
    },

    /** Stop listening. Safe to call even if not currently listening. */
    stop: function () {
      manualStop = true;
      if (recognition) {
        try {
          recognition.stop();
        } catch (e) {
          /* ignore */
        }
        recognition = null;
      }
    },

    /**
     * Optionally speak a short prompt aloud via speechSynthesis.
     * No-op if unsupported.
     * @param {string} text
     */
    speak: function (text) {
      if (!text) return;
      if (typeof window.speechSynthesis === 'undefined' || typeof window.SpeechSynthesisUtterance === 'undefined') {
        return; // unsupported -> no-op
      }
      try {
        var utter = new window.SpeechSynthesisUtterance(String(text));
        utter.lang = 'en-US';
        utter.rate = 1;
        utter.pitch = 1;
        window.speechSynthesis.speak(utter);
      } catch (e) {
        /* no-op on failure */
      }
    },

    /**
     * Build a structured feedback object from the transcript + context.
     * @param {string} transcript
     * @param {object} [opts]
     * @param {string} [opts.page=location.pathname]
     * @param {('improvement'|'bug'|'request'|'other')} [opts.category='other']
     * @param {string} [opts.username='']
     * @returns {{id:string, created:string, page:string, userAgent:string, transcript:string, category:string, username:string}}
     */
    buildFeedback: function (transcript, opts) {
      opts = opts || {};
      var page = typeof opts.page === 'string' ? opts.page : location.pathname;
      var category = opts.category || 'other';
      var username = typeof opts.username === 'string' ? opts.username : '';

      // Normalize category to the accepted set.
      var allowed = ['improvement', 'bug', 'request', 'other'];
      if (allowed.indexOf(category) === -1) {
        category = 'other';
      }

      return {
        id: shortId(),
        created: new Date().toISOString(),
        page: page,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        transcript: (transcript || '').toString().trim(),
        category: category,
        username: username
      };
    },

    /**
     * Submit the feedback object.
     *  1. Always append to localStorage 'emj_feedback_log' (JSON array) [try/catch].
     *  2. If window.FEEDBACK_ENDPOINT is a non-empty string, POST JSON there.
     *  3. Otherwise fall back to a pre-filled mailto: to evan@evanmurrayjones.com.
     * @param {object} feedbackObj
     * @returns {Promise<{ok:true, via:('endpoint'|'mailto'|'local')}>}
     */
    submit: function (feedbackObj) {
      // --- Step 1: durable local record (best-effort) ------------------------
      var storedLocally = false;
      try {
        var KEY = 'emj_feedback_log';
        var existing = [];
        var raw = window.localStorage.getItem(KEY);
        if (raw) {
          try {
            existing = JSON.parse(raw);
            if (!Array.isArray(existing)) existing = [];
          } catch (e) {
            existing = [];
          }
        }
        existing.push(feedbackObj);
        window.localStorage.setItem(KEY, JSON.stringify(existing));
        storedLocally = true;
      } catch (e) {
        // localStorage can be unavailable (private mode, blocked) — ignore.
        storedLocally = false;
      }

      // --- Step 2: POST to endpoint if configured ----------------------------
      var endpoint =
        typeof window.FEEDBACK_ENDPOINT === 'string' && window.FEEDBACK_ENDPOINT
          ? window.FEEDBACK_ENDPOINT
          : '';

      if (endpoint) {
        return fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(feedbackObj)
        })
          .then(function (res) {
            if (!res.ok) {
              throw new Error('Feedback endpoint returned HTTP ' + res.status);
            }
            return { ok: true, via: 'endpoint' };
          })
          .catch(function (err) {
            // Endpoint failed — fall back to mailto so the feedback still reaches Evan.
            try {
              openMailto(feedbackObj);
              return { ok: true, via: 'mailto' };
            } catch (e) {
              if (storedLocally) {
                // At least it's saved locally; resolve so the user isn't stuck.
                return { ok: true, via: 'local' };
              }
              throw (err instanceof Error ? err : new Error(String(err)));
            }
          });
      }

      // --- Step 3: mailto fallback -------------------------------------------
      return new Promise(function (resolve, reject) {
        try {
          openMailto(feedbackObj);
          resolve({ ok: true, via: 'mailto' });
        } catch (e) {
          if (storedLocally) {
            resolve({ ok: true, via: 'local' });
          } else {
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        }
      });
    }
  };

  // --- Internal: build + open the pre-filled mailto: link --------------------

  function openMailto(fb) {
    var to = 'evan@evanmurrayjones.com';
    var who = fb && fb.username ? fb.username : 'a user';
    var subject = 'QR tool feedback from ' + who;

    var bodyLines = [
      'Feedback: ' + (fb && fb.transcript ? fb.transcript : ''),
      '',
      'Category: ' + (fb && fb.category ? fb.category : 'other'),
      'Page: ' + (fb && fb.page ? fb.page : ''),
      'When: ' + (fb && fb.created ? fb.created : ''),
      'ID: ' + (fb && fb.id ? fb.id : '')
    ];
    var body = bodyLines.join('\n');

    // encodeURIComponent turns spaces into %20 (not '+'), which is the
    // mailto-safe encoding we want for the subject/body.
    var href =
      'mailto:' +
      to +
      '?subject=' +
      encodeURIComponent(subject) +
      '&body=' +
      encodeURIComponent(body);

    // Navigating the location opens the user's default mail client with the
    // message pre-filled. This is a user-initiated action (submit button).
    window.location.href = href;
  }
})();
