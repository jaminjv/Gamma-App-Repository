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
     Signature pad

     Pointer events cover finger, stylus and mouse in one path. The canvas
     is sized in device pixels so the stroke is not blurry on a phone, and
     the drawn image is written into a hidden field on submit.
     ---------------------------------------------------------------------- */
  var sigpad = document.querySelector('[data-sigpad]');

  if (sigpad && sigpad.querySelector('canvas').getContext) {
    var canvas = sigpad.querySelector('canvas');
    var ctx = canvas.getContext('2d');
    var valueField = document.querySelector('[data-sigpad-value]');
    var clearBtn = sigpad.querySelector('[data-sigpad-clear]');
    var drawing = false;
    var hasInk = false;
    var last = null;

    var resize = function () {
      var ratio = Math.max(window.devicePixelRatio || 1, 1);
      var rect = canvas.getBoundingClientRect();
      // Resizing clears the canvas, so keep what was already drawn.
      var previous = hasInk ? canvas.toDataURL() : null;

      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue('color') || '#0e1626';

      if (previous) {
        var img = new Image();
        img.onload = function () { ctx.drawImage(img, 0, 0, rect.width, rect.height); };
        img.src = previous;
      }
    };

    var point = function (e) {
      var rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    var start = function (e) {
      drawing = true;
      last = point(e);
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    };

    var move = function (e) {
      if (!drawing) return;
      var p = point(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
      if (!hasInk) {
        hasInk = true;
        sigpad.classList.add('is-signed');
      }
      e.preventDefault();
    };

    var end = function () { drawing = false; last = null; };

    canvas.addEventListener('pointerdown', start);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', end);

    clearBtn.addEventListener('click', function () {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasInk = false;
      sigpad.classList.remove('is-signed');
      if (valueField) valueField.value = '';
    });

    window.addEventListener('resize', resize);
    resize();

    window.nixoraSignature = {
      isSigned: function () { return hasInk; },
      commit: function () {
        if (valueField) valueField.value = hasInk ? canvas.toDataURL('image/png') : '';
        return hasInk;
      },
      element: sigpad
    };
  }

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

  var firstInvalid = function (form) {
    return form.querySelector(':invalid');
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
    form.addEventListener('submit', function (e) {
      e.preventDefault();

      if (!form.checkValidity()) {
        form.reportValidity();
        var bad = firstInvalid(form);
        if (bad) bad.focus();
        return;
      }

      // A signature pad is not a form control, so checkValidity cannot see it.
      var sig = window.nixoraSignature;
      if (sig && form.contains(sig.element)) {
        var sigError = sig.element.parentNode.querySelector('.sigpad__error');
        if (!sig.commit()) {
          if (sigError) {
            sigError.textContent = 'Please sign in the box above before submitting.';
            sigError.classList.add('is-visible', 'form-status--err');
          }
          sig.element.scrollIntoView({ block: 'center' });
          return;
        }
        if (sigError) sigError.classList.remove('is-visible', 'form-status--err');
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
          if (!response.ok) throw new Error('Request failed with status ' + response.status);
          form.reset();
          if (sig && form.contains(sig.element)) {
            sig.element.querySelector('[data-sigpad-clear]').click();
          }
          showStatus(form, 'ok', 'Thank you — your message has been sent. We will be in touch within one business day.');
        })
        .catch(function () {
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
