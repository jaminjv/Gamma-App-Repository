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
     Language

     A real Spanish version rather than the browser's, which turned the ZIP
     label into "cremallera" and made a mess of the state names. The English
     text stays in the markup and is the default; the Spanish rides along in
     data-es attributes and is swapped in.

     What the form *submits* never changes. Option values stay English, so
     the email, the spreadsheet and the endpoint's field names are the same
     whichever language the applicant read.
     ---------------------------------------------------------------------- */
  var LANG_KEY = 'nixora-lang';
  var langToggle = document.getElementById('langToggle');

  // Filled the first time Spanish is applied, so English survives the swap.
  var englishText = new WeakMap();
  var englishPlaceholder = new WeakMap();

  var applyLanguage = function (lang) {
    var spanish = lang === 'es';
    document.documentElement.setAttribute('lang', spanish ? 'es' : 'en');

    document.querySelectorAll('[data-es]').forEach(function (el) {
      if (!englishText.has(el)) englishText.set(el, el.textContent);
      el.textContent = spanish ? el.getAttribute('data-es') : englishText.get(el);
    });

    document.querySelectorAll('[data-es-ph]').forEach(function (el) {
      if (!englishPlaceholder.has(el)) englishPlaceholder.set(el, el.placeholder);
      el.placeholder = spanish ? el.getAttribute('data-es-ph') : englishPlaceholder.get(el);
    });

    if (langToggle) {
      langToggle.setAttribute('aria-label',
        spanish ? 'Switch to English' : 'Cambiar a español');
    }
  };

  // Spanish by default for a browser set to Spanish — most applicants are
  // Spanish-speaking, and the point is that nobody has to go looking.
  var storedLang = null;
  try { storedLang = localStorage.getItem(LANG_KEY); } catch (e) { /* private mode */ }

  var startingLang = storedLang ||
    (String(navigator.language || '').toLowerCase().indexOf('es') === 0 ? 'es' : 'en');

  if (langToggle) {
    applyLanguage(startingLang);

    langToggle.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('lang') === 'es' ? 'en' : 'es';
      applyLanguage(next);
      try { localStorage.setItem(LANG_KEY, next); } catch (e) { /* private mode */ }
    });
  }

  /* The handful of sentences the script writes rather than the markup. Keyed
     by the English, so a string with no translation still reads correctly. */
  var SPANISH = {
    'Sending…': 'Enviando…',
    'Thank you — your message has been sent. We will be in touch within one business day.':
      'Gracias — tu mensaje fue enviado. Te contactaremos dentro de un día hábil.',
    'One thing is still missing: ': 'Falta una cosa: ',
    'Please complete ': 'Completa ',
    ' and ': ' y ',
    ' more': ' más',
    'Pick your address from the list that appears as you type.':
      'Elige tu dirección de la lista que aparece mientras escribes.',
    'Verify your email address — send yourself the code and enter it below.':
      'Verifica tu correo — envíate el código e ingrésalo abajo.',
    'Address confirmed.': 'Dirección confirmada.',
    'We could not confirm this address. Check it, or leave it as it is if you know it is right.':
      'No pudimos confirmar esta dirección. Revísala, o déjala así si sabes que es correcta.',
    'Use this': 'Usar esta',
    'Did you mean ': '¿Quisiste decir ',
    'Something went wrong sending the form. Please email us directly at ':
      'Algo salió mal al enviar el formulario. Escríbenos directamente a ',
    'Checking…': 'Comprobando…',
    'Send code': 'Enviar código',
    'Send again': 'Enviar de nuevo',
    'Email verified.': 'Correo verificado.',
    'Enter the 6 digits from the email.': 'Ingresa los 6 dígitos del correo.',
    'That code is not right.': 'Ese código no es correcto.',
    'We could not send the code. Please try again in a moment.':
      'No pudimos enviar el código. Inténtalo de nuevo en un momento.',
    'We could not send the code. Please check your connection and try again.':
      'No pudimos enviar el código. Revisa tu conexión e inténtalo de nuevo.',
    'We could not check the code. Please try again.':
      'No pudimos comprobar el código. Inténtalo de nuevo.'
  };

  var t = function (text) {
    if (document.documentElement.getAttribute('lang') !== 'es') return text;
    return SPANISH[text] || text;
  };

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

      /* The address has to be one Google offered, not one typed freely.
         Enforced through setCustomValidity so it blocks the submit the same
         way a missing required field does, with the same message and the
         same red mark, rather than through a second mechanism.

         It stops being enforced the moment the lookup stops working. A
         Google outage or a spent quota must not take the whole application
         form down with it — nobody could apply at all, and neither side
         would know why. */
      var chosenStreet = null;
      // Starts off, and is turned on only by a lookup that plainly worked —
      // a well-formed answer carrying a list. Anything else, including an
      // answer this page does not recognise, leaves the field accepting a
      // typed address. Being strict is worth nothing next to being the
      // reason somebody could not apply.
      var lookupWorks = false;

      var ADDRESS_RULE = 'Pick your address from the list that appears as you type.';

      var refreshAddressValidity = function () {
        if (!lookupWorks) return addressInput.setCustomValidity('');
        var value = addressInput.value.trim();
        // An empty field is already caught by `required`, which says it better.
        if (!value) return addressInput.setCustomValidity('');
        addressInput.setCustomValidity(value === chosenStreet ? '' : t(ADDRESS_RULE));
      };
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
        chosenStreet = option.line;
        refreshAddressValidity();

        fetch(detailsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ placeId: option.id, sessionToken: token })
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (!data || !data.ok || !data.address) return;
            // The details call returns the tidied street, which replaces what
            // the suggestion showed — so that is what counts as chosen.
            chosenStreet = data.address.street || option.line;
            setField('a-address', chosenStreet);
            refreshAddressValidity();
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
            // configured:false means no key is set, which is a working state
            // for the field — it just cannot be strict about it.
            lookupWorks = Boolean(data && data.configured !== false &&
              Object.prototype.toString.call(data.suggestions) === '[object Array]');
            refreshAddressValidity();
            render((data && data.suggestions) || []);
          })
          .catch(function () {
            // Unreachable, out of quota, refused: whatever the reason, the
            // field goes back to accepting a typed address.
            lookupWorks = false;
            refreshAddressValidity();
            close();
          });
      };

      addressInput.addEventListener('input', function () {
        refreshAddressValidity();
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
          button.textContent = t('Use this');
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
                t('We could not confirm this address. Check it, or leave it as it is if you know it is right.'));
            }

            var found = data.address;
            if (sameAddress(found.street, street)) {
              return showNote('ok', t('Address confirmed.'));
            }

            showNote('info', t('Did you mean ') + found.formatted + '?', function () {
              setField('a-address', found.street);
              setField('a-city', found.city);
              setField('a-zip', found.zip);
              if (stateInput && found.state) {
                var match = Array.prototype.find.call(stateInput.options, function (opt) {
                  return opt.value === found.state;
                });
                if (match) stateInput.value = match.value;
              }
              showNote('ok', t('Address confirmed.'));
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
     One field, two rules

     The email field is refused for two unrelated reasons — a domain that
     cannot receive mail, and an address whose code has not been entered —
     and setCustomValidity holds exactly one message. Whichever block wrote
     last used to win, which meant the domain check silently cleared the
     verification requirement and let an unverified application through.

     Reasons are recorded by name and the message is decided in one place.
     ---------------------------------------------------------------------- */
  var validityReasons = new WeakMap();
  var REASON_ORDER = ['domain', 'verify'];

  var setReason = function (input, name, message) {
    var reasons = validityReasons.get(input) || {};
    if (message) reasons[name] = message;
    else delete reasons[name];
    validityReasons.set(input, reasons);

    var first = '';
    REASON_ORDER.forEach(function (key) {
      if (!first && reasons[key]) first = reasons[key];
    });
    input.setCustomValidity(first);
  };

  /* ----------------------------------------------------------------------
     Email addresses that cannot receive mail

     Replies were bouncing, because a mistyped domain looks perfectly valid
     to a browser: gmial.com passes every format check there is. This asks
     the endpoint whether the domain has anywhere to deliver mail, and
     refuses the submission when it does not.

     What it cannot do is prove the mailbox exists. Nothing can, short of
     sending to it or paying a verification service, so the part before the @
     is still taken on trust. The mistyped domain is where the bounces come
     from, and that is what this catches.
     ---------------------------------------------------------------------- */
  var emailFields = document.querySelectorAll('form[data-form] input[type="email"]');

  if (emailFields.length && window.fetch) {
    emailFields.forEach(function (input) {
      var emailForm = input.form;
      var action = emailForm && emailForm.getAttribute('action');
      if (!action || action.indexOf(UNCONFIGURED) !== -1) return;

      var checkUrl = new URL('email/check', action).href;
      var note = document.createElement('p');
      note.className = 'field-check';
      note.hidden = true;
      note.setAttribute('role', 'status');
      note.setAttribute('aria-live', 'polite');
      input.parentNode.appendChild(note);

      var lastChecked = '';

      var clearNote = function () {
        note.hidden = true;
        note.textContent = '';
      };

      var announce = function (kind, text, fix) {
        note.className = 'field-check field-check--' + kind;
        note.textContent = text;
        if (fix) {
          var button = document.createElement('button');
          button.type = 'button';
          button.className = 'field-check__use';
          button.textContent = t('Use this');
          button.addEventListener('click', fix);
          note.appendChild(document.createTextNode(' '));
          note.appendChild(button);
        }
        note.hidden = false;
      };

      var check = function () {
        var value = input.value.trim();
        if (!value || value === lastChecked) return;
        if (!input.validity.valid && !input.validity.customError) return;
        lastChecked = value;

        fetch(checkUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ email: value })
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (!data || input.value.trim() !== value) return;

            // A lookup that did not answer is not evidence against an
            // address, so an unchecked result leaves the field alone.
            if (!data.checked) {
              setReason(input, 'domain', '');
              return clearNote();
            }

            if (!data.deliverable) {
              setReason(input, 'domain', document.documentElement.getAttribute('lang') === 'es'
                ? 'Este correo no puede recibir mensajes — el dominio "' + data.domain +
                  '" no existe. Revisa que esté bien escrito.'
                : 'This email cannot receive mail — the domain "' + data.domain +
                  '" does not exist. Check the spelling.');
              input.setAttribute('aria-invalid', 'true');
              return announce('warn', document.documentElement.getAttribute('lang') === 'es'
                ? 'No podemos entregar a "' + data.domain +
                  '". Revisa que esté bien escrito — ahí llegarían las respuestas.'
                : 'We cannot deliver to "' + data.domain +
                  '". Check the spelling — this is where replies would go.');
            }

            setReason(input, 'domain', '');
            input.removeAttribute('aria-invalid');

            if (data.suggestion) {
              var fixed = value.replace(/@.*$/, '@' + data.suggestion);
              return announce('info', t('Did you mean ') + fixed + '?', function () {
                input.value = fixed;
                lastChecked = '';
                clearNote();
                check();
              });
            }

            clearNote();
          })
          .catch(function () {
            setReason(input, 'domain', '');
            clearNote();
          });
      };

      input.addEventListener('blur', function () { window.setTimeout(check, 150); });
      input.addEventListener('input', function () {
        // Typing clears the previous verdict; it is about text that is gone.
        // Only this block's verdict — the code requirement is not ours.
        setReason(input, 'domain', '');
        clearNote();
      });
    });
  }

  /* ----------------------------------------------------------------------
     Proving the applicant owns the email they typed

     A domain check catches a mistyped domain but says nothing about the
     mailbox, and replies were still bouncing. So the application form emails
     a code and asks for it back. Nothing is stored: the endpoint signs the
     code, the page holds the signature, and the code itself only ever exists
     in the inbox.

     Only this form. A code in the way of a contact message would cost more
     enquiries than it saves bounces — someone asking for a quote can be
     replied to, and if the address is wrong, that is their loss to notice.
     ---------------------------------------------------------------------- */
  var verifyEmail = document.getElementById('a-email');
  var verifyBox = document.getElementById('a-verify');

  if (verifyEmail && verifyBox && window.fetch) {
    var verifyForm = verifyEmail.form;
    var verifyAction = verifyForm && verifyForm.getAttribute('action');

    if (verifyAction && verifyAction.indexOf(UNCONFIGURED) === -1) {
      var proofField = document.getElementById('a-email-proof');
      var codeRow = document.getElementById('a-code-row');
      var codeInput = document.getElementById('a-code');
      var sendButton = document.getElementById('a-send-code');
      var checkButton = document.getElementById('a-check-code');
      var askLine = verifyBox.querySelector('.verify__ask');

      var sendUrl = new URL('email/send-code', verifyAction).href;
      var checkUrl = new URL('email/verify-code', verifyAction).href;

      var challenge = null;
      var verifiedAddress = null;
      var sentOnce = false;
      var ASK = askLine.textContent;

      var NEEDS_CODE = 'Verify your email address — send yourself the code and enter it below.';

      var refreshEmailValidity = function () {
        var value = verifyEmail.value.trim().toLowerCase();
        setReason(verifyEmail, 'verify',
          !value || value === verifiedAddress ? '' : t(NEEDS_CODE));
      };

      var tell = function (text, kind) {
        askLine.textContent = text;
        verifyBox.classList.toggle('verify--done', kind === 'done');
      };

      // `next` lets the caller change the label it comes back to, so a button
      // that has done its job once can say so instead of reverting.
      var busy = function (button, on, label, next) {
        button.disabled = on;
        if (on) {
          button.setAttribute('data-label', button.textContent.trim());
          button.textContent = label;
          return;
        }
        button.textContent = next || button.getAttribute('data-label') || button.textContent;
      };

      // The block only appears once there is a plausible address to verify,
      // so it does not greet people as an obstacle before they have typed.
      var showBox = function () {
        verifyBox.hidden = !(verifyEmail.value.trim() && verifyEmail.validity.typeMismatch === false);
      };

      sendButton.addEventListener('click', function () {
        var address = verifyEmail.value.trim();
        if (!address) return verifyEmail.focus();

        busy(sendButton, true, t('Sending…'));
        fetch(sendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ email: address })
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (!data || !data.ok) {
              return tell((data && data.error) ||
                t('We could not send the code. Please try again in a moment.'));
            }
            challenge = data.challenge;
            codeRow.hidden = false;
            sentOnce = true;
            tell(document.documentElement.getAttribute('lang') === 'es'
              ? 'Enviamos un código de 6 dígitos a ' + address + '. Es válido por 15 minutos.'
              : 'We sent a 6-digit code to ' + address + '. It is good for 15 minutes.');
            codeInput.focus();
          })
          .catch(function () {
            tell(t('We could not send the code. Please check your connection and try again.'));
          })
          .then(function () {
            busy(sendButton, false, null, t(sentOnce ? 'Send again' : 'Send code'));
          });
      });

      checkButton.addEventListener('click', function () {
        var typed = codeInput.value.replace(/\D/g, '');
        if (typed.length !== 6) {
          codeInput.focus();
          return tell(t('Enter the 6 digits from the email.'));
        }

        busy(checkButton, true, t('Checking…'));
        fetch(checkUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            email: verifyEmail.value.trim(), code: typed, challenge: challenge
          })
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (!data || !data.ok) {
              codeInput.select();
              return tell((data && data.error) || t('That code is not right.'));
            }
            proofField.value = data.proof;
            verifiedAddress = verifyEmail.value.trim().toLowerCase();
            verifyEmail.removeAttribute('aria-invalid');
            refreshEmailValidity();
            tell(t('Email verified.'), 'done');
          })
          .catch(function () { tell(t('We could not check the code. Please try again.')); })
          .then(function () { busy(checkButton, false); });
      });

      codeInput.addEventListener('keydown', function (e) {
        // Enter in the code box means "check this", not "submit the form".
        if (e.key === 'Enter') {
          e.preventDefault();
          checkButton.click();
        }
      });

      verifyEmail.addEventListener('input', function () {
        showBox();
        // Changing the address undoes the proof: it was issued for the old
        // one, and the endpoint will refuse it against the new one anyway.
        if (verifyEmail.value.trim().toLowerCase() !== verifiedAddress) {
          proofField.value = '';
          challenge = null;
          codeRow.hidden = true;
          codeInput.value = '';
          sendButton.textContent = t('Send code');
          sentOnce = false;
          tell(ASK);
        }
        refreshEmailValidity();
      });

      verifyEmail.addEventListener('blur', showBox);

      // A sent application clears the form, and the block has to go back to
      // asking rather than still reading "Email verified" over empty fields.
      verifyForm.addEventListener('reset', function () {
        window.setTimeout(function () {
          verifiedAddress = null;
          challenge = null;
          proofField.value = '';
          codeRow.hidden = true;
          codeInput.value = '';
          sendButton.textContent = t('Send code');
          sentOnce = false;
          tell(ASK);
          showBox();
          refreshEmailValidity();
        }, 0);
      });

      showBox();
      refreshEmailValidity();
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
    var and = t(' and ');
    if (names.length === 1) return names[0];
    if (names.length === 2) return names[0] + and + names[1];
    if (names.length <= 3) return names[0] + ', ' + names[1] + and + names[2];
    return names.slice(0, 3).join(', ') + and + (names.length - 3) + t(' more');
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

        // A field carrying a rule of its own — an address that has to come
        // from the list, an email whose domain cannot receive mail — has a
        // message written for it. Naming the field would not explain why it
        // is being refused when it visibly has something in it.
        var explained = missing.filter(function (el) {
          return el.validity && el.validity.customError && el.validationMessage;
        });

        showStatus(form, 'err', explained.length
          ? endSentence(explained[0].validationMessage)
          : endSentence(missing.length === 1
              ? t('One thing is still missing: ') + fieldLabel(form, missing[0])
              : t('Please complete ') + listNames(missing.map(function (el) {
                  return fieldLabel(form, el);
                }))));

        // Take the visitor to the field that needs explaining, not to the
        // first blank one further up.
        if (explained.length) missing = explained.concat(missing);

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
        submitBtn.textContent = t('Sending…');
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
          showStatus(form, 'ok', t('Thank you — your message has been sent. We will be in touch within one business day.'));
        })
        .catch(function (error) {
          if (window.console && console.error) {
            console.error('[nixora] form submission failed:', action, error && error.message ? error.message : error);
          }
          showStatus(form, 'err',
            t('Something went wrong sending the form. Please email us directly at ') + FALLBACK_EMAIL + '.');
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
