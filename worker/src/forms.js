/* ==========================================================================
   Nixora Services LLC — turning a submitted form into a notification.

   One module per concern: this one knows the field names used by the site's
   three forms, email.js knows how to draw them, index.js moves the request.
   ========================================================================== */

import { escapeHtml, telHref, formatDate } from './email.js';

/* Field names as they appear in the HTML. Kept here so a rename on the site
   is a one-line change rather than a hunt through the renderer. */
const A = {
  position: 'Position Applied For',
  name: 'Full Name',
  email: 'email',
  phone: 'Phone',
  dob: 'Date of Birth',
  street: 'Street Address',
  city: 'City',
  state: 'State',
  zip: 'ZIP Code',
  ecName: 'Emergency Contact',
  ecPhone: 'Emergency Phone',
  ecRelation: 'Emergency Relationship',
  experience: 'Cleaning Experience',
  availability: 'Availability',
  shifts: 'Shifts Available',
  notes: 'Experience Notes',
  resume: 'Resume Link',
  signature: 'Electronic Signature',
  signedOn: 'Signed On'
};

const DECLARATIONS = [
  ['Certified Accurate', 'Certified the information is accurate'],
  ['Accepted SMS and WhatsApp', 'Accepted SMS and WhatsApp updates'],
  ['Accepted Digital Data Handling', 'Accepted digital handling of their data'],
  ['Accepted Background and Drug Screening', 'Accepted background check and drug screening']
];

/* Reads a form value, trimmed, never undefined. */
const get = (form, key) => String(form.get(key) || '').trim();

const firstName = (full) => String(full || '').trim().split(/\s+/)[0] || 'the applicant';

const mailLink = (address) =>
  `<a href="mailto:${escapeHtml(address)}" style="color:#054a8b;">${escapeHtml(address)}</a>`;

const urlLink = (href) =>
  `<a href="${escapeHtml(href)}" style="color:#054a8b;">${escapeHtml(href)}</a>`;

/* Drops rows whose value came back empty, so an optional field the applicant
   skipped leaves no blank line in the email. */
const rows = (list) => list.filter(([, , plain]) => plain);

const textRow = (name, value) => [name, escapeHtml(value), value];

const STARS = (rating) => {
  const n = Math.max(0, Math.min(5, Number(rating) || 0));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
};

/* ------------------------------------------------------------------ */

function applicationSpec(form) {
  const name = get(form, A.name);
  const email = get(form, A.email);
  const phone = get(form, A.phone);
  const position = get(form, A.position);

  const cityLine = [get(form, A.city), get(form, A.state)].filter(Boolean).join(', ');
  const address = [get(form, A.street), [cityLine, get(form, A.zip)].filter(Boolean).join(' ')]
    .filter(Boolean);

  const emergency = [get(form, A.ecName), get(form, A.ecPhone)].filter(Boolean).join(' · ');
  const relation = get(form, A.ecRelation);

  const schedule = [get(form, A.availability), get(form, A.shifts)]
    .filter(Boolean).join(' · ');

  const actions = [];
  if (email) actions.push({ href: 'mailto:' + email, text: 'Reply to ' + firstName(name) });
  if (telHref(phone)) actions.push({ href: 'tel:' + telHref(phone), text: phone });

  const checks = DECLARATIONS
    .filter(([field]) => get(form, field))
    .map(([, sentence]) => sentence);

  const sections = [
    {
      title: 'Applicant',
      rows: rows([
        ['Email', email ? mailLink(email) : '', email],
        textRow('Date of birth', formatDate(get(form, A.dob))),
        ['Address', address.map(escapeHtml).join('<br>'), address.join(', ')],
        ['Emergency contact',
          escapeHtml(emergency) + (relation ? ` <span style="color:#5d6b82;">(${escapeHtml(relation)})</span>` : ''),
          emergency + (relation ? ' (' + relation + ')' : '')]
      ])
    },
    {
      title: 'Availability',
      rows: rows([
        textRow('Experience', get(form, A.experience)),
        textRow('Schedule', schedule),
        textRow('Notes', get(form, A.notes)),
        ['Resume', get(form, A.resume) ? urlLink(get(form, A.resume)) : '', get(form, A.resume)]
      ])
    }
  ];

  if (checks.length) sections.push({ title: 'Declarations', checks });

  const signatureName = get(form, A.signature);

  return {
    subject: position ? `${name} applied — ${position}` : `${name} applied`,
    replyTo: email,
    eyebrow: 'New job application',
    title: name,
    subtitle: `applied for <strong style="color:#054a8b;">${escapeHtml(position)}</strong>`,
    subtitleText: 'applied for ' + position,
    actions,
    sections,
    signature: signatureName
      ? { name: signatureName, date: get(form, A.signedOn) }
      : null,
    page: 'apply.html',
    formName: 'application form',
    footerNote: 'Replying to this email goes straight to the applicant.'
  };
}

function contactSpec(form) {
  const name = get(form, 'name');
  const email = get(form, 'email');
  const phone = get(form, 'Phone');
  const service = get(form, 'Service Needed');
  const company = get(form, 'Company');

  const actions = [];
  if (email) actions.push({ href: 'mailto:' + email, text: 'Reply to ' + firstName(name) });
  if (telHref(phone)) actions.push({ href: 'tel:' + telHref(phone), text: phone });

  return {
    subject: `${name} — new service request`,
    replyTo: email,
    eyebrow: 'New service request',
    title: name,
    subtitle: service
      ? `is asking about <strong style="color:#054a8b;">${escapeHtml(service)}</strong>`
      : 'wrote in through the contact form',
    subtitleText: service ? 'is asking about ' + service : 'wrote in through the contact form',
    actions,
    sections: [
      {
        title: 'Contact',
        rows: rows([
          ['Email', email ? mailLink(email) : '', email],
          textRow('Phone', phone),
          textRow('Company', company),
          textRow('Service needed', service)
        ])
      },
      { title: 'Message', text: get(form, 'Message') }
    ],
    signature: null,
    page: '#contact',
    formName: 'contact form',
    footerNote: 'Replying to this email goes straight to the sender.'
  };
}

function reviewSpec(form) {
  const name = get(form, 'name');
  const rating = get(form, 'Rating');
  const type = get(form, 'Reviewer Type');
  const consent = get(form, 'Consented To Publish');

  return {
    subject: `${name} left a ${rating}-star review`,
    replyTo: '',
    eyebrow: 'New website review',
    title: name,
    subtitle: `left a <strong style="color:#054a8b;">${escapeHtml(rating)}-star review</strong> ` +
      `<span style="color:#d9922c;">${STARS(rating)}</span>`,
    subtitleText: 'left a ' + rating + '-star review',
    actions: [],
    sections: [
      {
        title: 'Reviewer',
        rows: rows([
          textRow('Name', name),
          textRow('Reviewer type', type),
          textRow('Rating', rating ? rating + ' of 5  ' + STARS(rating) : '')
        ])
      },
      { title: 'Review', text: get(form, 'Message') },
      {
        title: 'Permission',
        checks: [consent
          ? 'Allowed Nixora Services to publish this review with their first name and role'
          : 'Did NOT allow this review to be published — keep it internal']
      }
    ],
    signature: null,
    page: '#feedback',
    formName: 'feedback form',
    footerNote: 'The reviewer did not leave an email address, so this thread cannot be replied to.'
  };
}

const BUILDERS = {
  application: applicationSpec,
  contact: contactSpec,
  review: reviewSpec
};

/* Trusts the hidden _form field, and works out the type from the fields
   themselves when it is missing — a submission should never be lost to a
   markup slip. */
export function detectFormType(form) {
  const declared = get(form, '_form').toLowerCase();
  if (BUILDERS[declared]) return declared;
  if (form.get(A.position)) return 'application';
  if (form.get('Rating')) return 'review';
  return 'contact';
}

export function buildSpec(form, type) {
  const build = BUILDERS[type] || contactSpec;
  const spec = build(form);

  // A submission with no name would produce an empty subject line, so fall
  // back to something an inbox can still sort on.
  if (!spec.title) {
    spec.title = 'Website submission';
    spec.subject = spec.eyebrow + ' — Nixora Services';
  }
  return spec;
}
