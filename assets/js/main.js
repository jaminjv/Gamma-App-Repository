/* ==========================================================================
   Nixora Services LLC — site behaviour
   Vanilla JS, no dependencies. Loaded with `defer`.
   ========================================================================== */
(function () {
  'use strict';

  /* ----------------------------------------------------------------------
     Configuration
     ---------------------------------------------------------------------- */
  // Fallback inbox used when a form's Formspree endpoint has not been set up yet.
  var FALLBACK_EMAIL = 'info@nixoraservices.com';
  var UNCONFIGURED = 'YOUR_FORM_ID';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ----------------------------------------------------------------------
     Mobile navigation
     ---------------------------------------------------------------------- */
  var toggle = document.getElementById('navToggle');
  var menu = document.getElementById('navMenu');

  if (toggle && menu) {
    var closeMenu = function () {
      menu.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open menu');
    };

    toggle.addEventListener('click', function () {
      var open = menu.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });

    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) closeMenu();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('is-open')) {
        closeMenu();
        toggle.focus();
      }
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 1150) closeMenu();
    });
  }

  /* ----------------------------------------------------------------------
     Theme switch

     The stored choice wins over the operating system, and an inline script
     in <head> stamps data-theme before first paint so the page never flashes
     the wrong theme. This only keeps the control in sync and persists.
     ---------------------------------------------------------------------- */
  var THEME_KEY = 'nixora-theme';
  var themeToggle = document.getElementById('themeToggle');

  var setTheme = function (theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (themeToggle) {
      themeToggle.setAttribute('aria-checked', String(theme === 'dark'));
      themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }
  };

  if (themeToggle) {
    setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

    themeToggle.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      setTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* private mode */ }
    });
  }

  /* ----------------------------------------------------------------------
     Sticky header shadow
     ---------------------------------------------------------------------- */
  var header = document.getElementById('siteHeader');
  if (header) {
    var onScroll = function () {
      header.classList.toggle('is-stuck', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ----------------------------------------------------------------------
     Reveal on scroll
     ---------------------------------------------------------------------- */
  var revealables = document.querySelectorAll('.reveal');
  if (revealables.length) {
    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
      revealables.forEach(function (el) { el.classList.add('is-visible'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

      revealables.forEach(function (el, i) {
        el.style.transitionDelay = Math.min(i % 6, 5) * 60 + 'ms';
        io.observe(el);
      });
    }
  }

  /* ----------------------------------------------------------------------
     Active section highlighting in the nav
     ---------------------------------------------------------------------- */
  var navAnchors = Array.prototype.slice.call(
    document.querySelectorAll('.nav__links a[href^="#"]')
  );
  if (navAnchors.length && 'IntersectionObserver' in window) {
    var sections = navAnchors
      .map(function (a) { return document.querySelector(a.getAttribute('href')); })
      .filter(Boolean);

    var sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        navAnchors.forEach(function (a) {
          a.classList.toggle('is-active', a.getAttribute('href') === '#' + entry.target.id);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

    sections.forEach(function (s) { sectionObserver.observe(s); });
  }

  /* ----------------------------------------------------------------------
     Current year in the footer
     ---------------------------------------------------------------------- */
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  /* ----------------------------------------------------------------------
     Application page: preselect the position
     ---------------------------------------------------------------------- */
  var positionSelect = document.getElementById('a-position');

  var setPosition = function (value) {
    if (!positionSelect) return;
    var match = Array.prototype.find.call(positionSelect.options, function (opt) {
      return opt.value.toLowerCase() === value.toLowerCase();
    });
    if (match) positionSelect.value = match.value;
  };

  if (positionSelect) {
    var roleParam = new URLSearchParams(window.location.search).get('role');
    var roleMap = {
      'housekeeping': 'House Keeping',
      'house-keeping': 'House Keeping',
      'green-team': 'Green Team Associate',
      'greenteam': 'Green Team Associate'
    };
    if (roleParam && roleMap[roleParam.toLowerCase()]) {
      setPosition(roleMap[roleParam.toLowerCase()]);
    }
  }

  document.querySelectorAll('[data-select-role]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setPosition(btn.getAttribute('data-select-role'));
      if (positionSelect) {
        window.setTimeout(function () { positionSelect.focus({ preventScroll: true }); }, 400);
      }
    });
  });

  /* ----------------------------------------------------------------------
     Forms
     ---------------------------------------------------------------------- */
  var showStatus = function (form, type, message) {
    var box = form.querySelector('.form-status');
    if (!box) return;
    box.textContent = message;
    box.classList.remove('form-status--ok', 'form-status--err');
    box.classList.add('is-visible', type === 'ok' ? 'form-status--ok' : 'form-status--err');
  };

  // A field's human name. The short data-label wins where one is set: the
  // declaration checkboxes are wrapped in labels that are whole paragraphs,
  // which would make an unreadable list.
  var fieldLabel = function (form, el) {
    var explicit = el.getAttribute('data-label');
    if (explicit) return explicit;

    var label = el.id ? form.querySelector('label[for="' + el.id + '"]') : null;
    if (!label && el.closest) label = el.closest('label');
    if (!label) return el.name || 'a required field';

    var text = label.textContent.replace(/\*/g, '').replace(/\s+/g, ' ').trim();
    return text.length > 42 ? text.slice(0, 40).replace(/[\s,.;:]+$/, '') + '…' : text;
  };

  var invalidFields = function (form) {
    return Array.prototype.filter.call(form.elements, function (el) {
      return el.willValidate && !el.checkValidity();
    });
  };

  // Some labels end in their own punctuation — "How can we help?" — so the
  // sentence must not add a second full stop after it.
  var endSentence = function (text) {
    return /[.?!…]$/.test(text) ? text : text + '.';
  };

  // Reads as a sentence rather than a dump: three names at most, then a count.
  var listNames = function (names) {
    if (names.length === 1) return names[0];
    if (names.length === 2) return names[0] + ' and ' + names[1];
    if (names.length <= 3) return names[0] + ', ' + names[1] + ' and ' + names[2];
    return names.slice(0, 3).join(', ') + ' and ' + (names.length - 3) + ' more';
  };

  // Builds a readable mailto: body from the form fields — used as the fallback
  // path while no Formspree endpoint is configured.
  var mailtoFallback = function (form) {
    var subjectField = form.querySelector('input[name="_subject"]');
    var subject = subjectField ? subjectField.value : 'Website enquiry — Nixora Services';
    var lines = [];

    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.name.charAt(0) === '_' || el.type === 'submit') return;
      if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) return;
      if (!el.value) return;
      var label = form.querySelector('label[for="' + el.id + '"]');
      var name = label ? label.textContent.replace('*', '').trim() : el.name;
      lines.push(name + ': ' + el.value);
    });

    return 'mailto:' + FALLBACK_EMAIL +
      '?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(lines.join('\n'));
  };

  document.querySelectorAll('form[data-form]').forEach(function (form) {
    var clearMark = function (e) {
      var el = e.target;
      if (el && el.hasAttribute && el.hasAttribute('aria-invalid') && el.checkValidity()) {
        el.removeAttribute('aria-invalid');
        if (!invalidFields(form).length) {
          var box = form.querySelector('.form-status');
          if (box && box.classList.contains('form-status--err')) {
            box.classList.remove('is-visible', 'form-status--err');
            box.textContent = '';
          }
        }
      }
    };
    form.addEventListener('input', clearMark);
    form.addEventListener('change', clearMark);

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      if (!form.checkValidity()) {
        // Leaving this to the browser is what made the button look dead: its
        // validation bubble is easy to miss on a desktop and frequently never
        // appears on a phone, so nothing on the page changed. The form now
        // says what is missing, marks the fields, and scrolls to the first.
        var missing = invalidFields(form);

        Array.prototype.forEach.call(form.elements, function (el) {
          if (el.removeAttribute) el.removeAttribute('aria-invalid');
        });
        missing.forEach(function (el) { el.setAttribute('aria-invalid', 'true'); });

        showStatus(form, 'err', endSentence(missing.length === 1
          ? 'One thing is still missing: ' + fieldLabel(form, missing[0])
          : 'Please complete ' + listNames(missing.map(function (el) {
              return fieldLabel(form, el);
            }))));

        var bad = missing[0];
        if (bad) {
          if (bad.scrollIntoView) bad.scrollIntoView({ block: 'center' });
          bad.focus({ preventScroll: true });
        }
        // Still worth showing where the browser will show it.
        form.reportValidity();
        return;
      }

      // Stamp when the signature was given, not when the page loaded.
      var signedAt = form.querySelector('[data-signed-date]');
      if (signedAt) signedAt.value = new Date().toISOString().slice(0, 10);

      // Build the subject line from the form's own values, so the inbox shows
      // who wrote in rather than which form they used. Falls back to the
      // static subject if any placeholder comes back empty.
      var subjectField = form.querySelector('input[name="_subject"][data-subject-template]');
      if (subjectField) {
        var complete = true;
        var built = subjectField.getAttribute('data-subject-template')
          .replace(/\{([^}]+)\}/g, function (match, key) {
            var field = form.elements[key];
            var value = field && field.value ? String(field.value).trim() : '';
            if (!value) complete = false;
            return value;
          });
        if (complete) subjectField.value = built;
      }

      // Honeypot: silently accept and drop obvious bots.
      var honey = form.querySelector('input[name="_gotcha"]');
      if (honey && honey.value) return;

      var action = form.getAttribute('action') || '';
      var submitBtn = form.querySelector('button[type="submit"]');

      // No endpoint configured yet → hand off to the visitor's mail client.
      if (action.indexOf(UNCONFIGURED) !== -1 || !action) {
        window.location.href = mailtoFallback(form);
        showStatus(form, 'ok',
          'Opening your email app so you can send this message to ' + FALLBACK_EMAIL + '.');
        return;
      }

      var originalLabel = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending…';
      }

      fetch(action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' }
      })
        .then(function (response) {
          if (response.ok) return;
          // The visitor gets the plain line below; whoever is diagnosing gets
          // the status and the endpoint's own reason in the console, which is
          // otherwise only visible in the endpoint's server logs.
          return response.text().then(function (body) {
            throw new Error('endpoint returned ' + response.status + ' — ' + body);
          });
        })
        .then(function () {
          form.reset();
          showStatus(form, 'ok', 'Thank you — your message has been sent. We will be in touch within one business day.');
        })
        .catch(function (error) {
          if (window.console && console.error) {
            console.error('[nixora] form submission failed:', action, error && error.message ? error.message : error);
          }
          showStatus(form, 'err',
            'Something went wrong sending the form. Please email us directly at ' + FALLBACK_EMAIL + '.');
        })
        .then(function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalLabel;
          }
        });
    });
  });
})();
