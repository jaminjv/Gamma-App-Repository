/* ==========================================================================
   Nixora Services LLC — site behaviour
   Vanilla JS, no dependencies. Loaded with `defer`.
   ========================================================================== */
(function () {
  'use strict';

  /* ----------------------------------------------------------------------
     Configuration
     ---------------------------------------------------------------------- */
  // Fallback inbox used when a form has no endpoint set up yet.
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
     Date fields

     A date input's placeholder is drawn by the browser from the operating
     system locale — MM/DD/YYYY here — and there is no way to set it from CSS
     or HTML. So the field starts as text, carrying the hint we want, and
     becomes a real date input the moment it is focused. That keeps the picker
     and the date validation, and the hint returns if it is left empty.

     Once a date is chosen the browser draws the value in its own format. That
     part is not ours to style either.
     ---------------------------------------------------------------------- */
  document.querySelectorAll('input[data-date]').forEach(function (input) {
    var toPicker = function () {
      if (input.type === 'date') return;
      input.type = 'date';
      // Not in every browser, and not needed where it is absent: the field is
      // already focused, so the picker is one tap away regardless.
      if (input.showPicker) {
        try { input.showPicker(); } catch (e) { /* needs a user gesture */ }
      }
    };

    input.addEventListener('focus', toPicker);
    input.addEventListener('click', toPicker);
    input.addEventListener('blur', function () {
      if (input.type === 'date' && !input.value) input.type = 'text';
    });
  });

  /* ----------------------------------------------------------------------
     Address suggestions

     Typing in the street field asks the form's own endpoint for matching US
     addresses and offers them; picking one fills the street, city, state and
     ZIP together. The Google key lives on that endpoint, not in this page.

     Everything here is an enhancement over a working text field. If the
     endpoint is unreachable, unconfigured or out of quota, no list appears
     and the field behaves exactly as it did before — an applicant is never
     stopped from typing their own address.
     ---------------------------------------------------------------------- */
  var addressInput = document.getElementById('a-address');

  if (addressInput && window.fetch) {
    var addressForm = addressInput.form;
    var endpoint = addressForm && addressForm.getAttribute('action');

    if (endpoint && endpoint.indexOf(UNCONFIGURED) === -1) {
      var suggestUrl = new URL('places/suggest', endpoint).href;
      var detailsUrl = new URL('places/details', endpoint).href;

      var list = document.createElement('ul');
      list.className = 'suggestions';
      list.id = 'a-address-suggestions';
      list.setAttribute('role', 'listbox');
      list.hidden = true;
      addressInput.parentNode.appendChild(list);

      addressInput.setAttribute('role', 'combobox');
      addressInput.setAttribute('aria-expanded', 'false');
      addressInput.setAttribute('aria-controls', list.id);
      addressInput.setAttribute('aria-autocomplete', 'list');
      addressInput.setAttribute('autocomplete', 'off');

      var options = [];
      var active = -1;
      var timer = null;
      var lastQuery = '';
      // One token covers the typing and the pick that follows, which Google
      // bills as a single lookup rather than one per keystroke.
      var token = null;

      var newToken = function () {
        token = (window.crypto && window.crypto.randomUUID)
          ? window.crypto.randomUUID()
          : String(Date.now()) + Math.random().toString(16).slice(2);
      };
      newToken();

      var close = function () {
        list.hidden = true;
        list.innerHTML = '';
        options = [];
        active = -1;
        addressInput.setAttribute('aria-expanded', 'false');
        addressInput.removeAttribute('aria-activedescendant');
      };

      var highlight = function (index) {
        var items = list.children;
        for (var i = 0; i < items.length; i++) {
          items[i].classList.toggle('is-active', i === index);
          items[i].setAttribute('aria-selected', String(i === index));
        }
        active = index;
        if (index >= 0 && items[index]) {
          addressInput.setAttribute('aria-activedescendant', items[index].id);
          if (items[index].scrollIntoView) items[index].scrollIntoView({ block: 'nearest' });
        } else {
          addressInput.removeAttribute('aria-activedescendant');
        }
      };

      var setField = function (id, value) {
        var el = document.getElementById(id);
        if (!el || !value) return;
        el.value = value;
        // The submit handler marks empty required fields; filling one here
        // has to clear that mark the same way typing would.
        if (el.hasAttribute('aria-invalid') && el.checkValidity()) {
          el.removeAttribute('aria-invalid');
        }
      };

      var choose = function (option) {
        close();
        addressInput.value = option.line;

        fetch(detailsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ placeId: option.id, sessionToken: token })
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (!data || !data.ok || !data.address) return;
            setField('a-address', data.address.street || option.line);
            setField('a-city', data.address.city);
            setField('a-zip', data.address.zip);

            var state = document.getElementById('a-state');
            if (state && data.address.state) {
              var match = Array.prototype.find.call(state.options, function (opt) {
                return opt.value === data.address.state;
              });
              if (match) {
                state.value = match.value;
                if (state.hasAttribute('aria-invalid')) state.removeAttribute('aria-invalid');
              }
            }
          })
          .catch(function () { /* the street line is already in place */ })
          .then(function () { newToken(); });
      };

      var render = function (suggestions) {
        list.innerHTML = '';
        options = suggestions;

        if (!suggestions.length) return close();

        suggestions.forEach(function (option, i) {
          var item = document.createElement('li');
          item.id = 'a-address-option-' + i;
          item.setAttribute('role', 'option');
          item.setAttribute('aria-selected', 'false');
          item.innerHTML = '<span class="suggestions__line"></span>' +
                           '<span class="suggestions__context"></span>';
          item.firstChild.textContent = option.line;
          item.lastChild.textContent = option.context;
          // mousedown, not click: blur would close the list first.
          item.addEventListener('mousedown', function (e) {
            e.preventDefault();
            choose(option);
          });
          list.appendChild(item);
        });

        list.hidden = false;
        addressInput.setAttribute('aria-expanded', 'true');
        highlight(-1);
      };

      var lookup = function () {
        var query = addressInput.value.trim();
        if (query.length < 4 || query === lastQuery) {
          if (query.length < 4) close();
          return;
        }
        lastQuery = query;

        fetch(suggestUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ input: query, sessionToken: token })
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            // A stale answer must not reopen a list for text already replaced.
            if (addressInput.value.trim() !== query) return;
            render((data && data.suggestions) || []);
          })
          .catch(function () { close(); });
      };

      addressInput.addEventListener('input', function () {
        window.clearTimeout(timer);
        timer = window.setTimeout(lookup, 250);
      });

      addressInput.addEventListener('keydown', function (e) {
        if (list.hidden || !options.length) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          highlight((active + 1) % options.length);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          highlight(active <= 0 ? options.length - 1 : active - 1);
        } else if (e.key === 'Enter' && active >= 0) {
          // Only swallow Enter when a suggestion is actually highlighted, so
          // the form can still be submitted from this field.
          e.preventDefault();
          choose(options[active]);
        } else if (e.key === 'Escape') {
          close();
        }
      });

      addressInput.addEventListener('blur', function () {
        window.setTimeout(close, 120);
      });

      /* ------------------------------------------------------------------
         Checking the address afterwards

         Independent of the suggestions above, and useful whether or not they
         are switched on: the ZIP fills the city and state, and the finished
         address is checked against the US Census file. Both are hints. An
         address the file does not know is reported as unconfirmed rather
         than wrong — new construction and recently renumbered streets are
         genuinely missing from it — and nothing here can block a submission.
         ------------------------------------------------------------------ */
      var zipInput = document.getElementById('a-zip');
      var cityInput = document.getElementById('a-city');
      var stateInput = document.getElementById('a-state');

      var note = document.createElement('p');
      note.className = 'field-check';
      note.hidden = true;
      note.setAttribute('role', 'status');
      note.setAttribute('aria-live', 'polite');
      if (zipInput && zipInput.parentNode) {
        addressInput.parentNode.appendChild(note);
      }

      var showNote = function (kind, text, action) {
        note.className = 'field-check field-check--' + kind;
        note.textContent = text;
        if (action) {
          var button = document.createElement('button');
          button.type = 'button';
          button.className = 'field-check__use';
          button.textContent = 'Use this';
          button.addEventListener('click', action);
          note.appendChild(document.createTextNode(' '));
          note.appendChild(button);
        }
        note.hidden = false;
      };

      var hideNote = function () { note.hidden = true; note.textContent = ''; };

      // The ZIP is the cheapest correction on the form: five digits settle
      // two fields that are otherwise typed and mistyped.
      if (zipInput) {
        zipInput.addEventListener('blur', function () {
          var zip = zipInput.value.trim();
          if (!/^\d{5}$/.test(zip)) return;

          fetch(new URL('address/zip', endpoint).href, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ zip: zip })
          })
            .then(function (r) { return r.json(); })
            .then(function (data) {
              if (!data || !data.found) return;
              // Only ever fills a blank. Someone who typed a city meant it.
              if (cityInput && !cityInput.value.trim()) setField('a-city', data.city);
              if (stateInput && !stateInput.value && data.state) {
                var match = Array.prototype.find.call(stateInput.options, function (opt) {
                  return opt.value === data.state;
                });
                if (match) {
                  stateInput.value = match.value;
                  if (stateInput.hasAttribute('aria-invalid')) stateInput.removeAttribute('aria-invalid');
                }
              }
            })
            .catch(function () { /* a hint that did not arrive */ });
        });
      }

      var sameAddress = function (a, b) {
        var tidy = function (t) { return String(t || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
        return tidy(a) === tidy(b);
      };

      var verify = function () {
        var street = addressInput.value.trim();
        var zip = zipInput ? zipInput.value.trim() : '';
        if (!street || !/^\d{5}$/.test(zip)) return hideNote();

        fetch(new URL('address/verify', endpoint).href, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            street: street,
            city: cityInput ? cityInput.value.trim() : '',
            state: stateInput ? stateInput.value : '',
            zip: zip
          })
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (!data || !data.checked) return hideNote();

            if (!data.verified) {
              return showNote('warn',
                'We could not confirm this address. Check it, or leave it as it is if you know it is right.');
            }

            var found = data.address;
            if (sameAddress(found.street, street)) {
              return showNote('ok', 'Address confirmed.');
            }

            showNote('info', 'Did you mean ' + found.formatted + '?', function () {
              setField('a-address', found.street);
              setField('a-city', found.city);
              setField('a-zip', found.zip);
              if (stateInput && found.state) {
                var match = Array.prototype.find.call(stateInput.options, function (opt) {
                  return opt.value === found.state;
                });
                if (match) stateInput.value = match.value;
              }
              showNote('ok', 'Address confirmed.');
            });
          })
          .catch(function () { hideNote(); });
      };

      // Checked once both halves are present, from whichever is filled last.
      addressInput.addEventListener('blur', function () { window.setTimeout(verify, 200); });
      if (zipInput) zipInput.addEventListener('blur', function () { window.setTimeout(verify, 400); });
      addressInput.addEventListener('input', hideNote);
    }
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

  // Builds a readable mailto: body from the form fields — the fallback path
  // for a form whose action was never pointed at an endpoint.
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
