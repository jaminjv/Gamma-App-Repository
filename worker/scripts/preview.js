/* Renders each notification with sample data so the layout can be checked
   without deploying or sending anything:
     node worker/scripts/preview.js [output directory]
   Writes application.html, contact.html and review.html. */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { renderEmail, renderText, escapeHtml } from '../src/email.js';
import { buildSpec, detectFormType } from '../src/forms.js';

const SITE_URL = 'https://www.nixoraservices.com';

const form = (fields) => {
  const data = new FormData();
  Object.keys(fields).forEach((key) => data.append(key, fields[key]));
  return data;
};

const SAMPLES = {
  application: form({
    'Position Applied For': 'Green Team Associate (Waste Room)',
    'Full Name': 'Pepito Perez',
    email: 'pepito@ejemplo.com',
    Phone: '(314) 555-0000',
    'Date of Birth': '1990-02-02',
    'Street Address': '9 Oak St',
    City: 'St. Louis',
    State: 'MO',
    'ZIP Code': '63101',
    'Emergency Contact': 'Maria Perez',
    'Emergency Phone': '(314) 555-2222',
    'Emergency Relationship': 'Sister',
    'Cleaning Experience': '1–3 years',
    Availability: 'Full-time',
    'Shifts Available': 'Any shift',
    'Experience Notes': 'Floor buffers and pressure washers. Reference available.',
    'Certified Accurate': 'yes',
    'Accepted SMS and WhatsApp': 'yes',
    'Accepted Digital Data Handling': 'yes',
    'Accepted Background and Drug Screening': 'yes',
    'Electronic Signature': 'Pepito Perez',
    'Signed On': '2026-08-28'
  }),

  contact: form({
    name: 'Laura Gomez',
    Company: 'Chase Park Plaza',
    email: 'laura@chaseparkplaza.com',
    Phone: '(314) 555-4410',
    'Service Needed': 'Event & Industrial Staffing',
    Message: 'We need 12 people for a three-day conference starting October 14.\nOvernight turnovers between sessions. Can you quote?'
  }),

  review: form({
    name: 'Carlos Ruiz',
    'Reviewer Type': 'Client',
    Rating: '4',
    Message: 'The crew arrived on time every shift and the waste room has never looked better. Billing took a while to sort out.',
    'Consented To Publish': 'yes'
  })
};

const outDir = process.argv[2] || join(process.cwd(), 'worker', 'preview');
mkdirSync(outDir, { recursive: true });

Object.keys(SAMPLES).forEach((key) => {
  const data = SAMPLES[key];
  const spec = buildSpec(data, detectFormType(data));
  const pageUrl = SITE_URL + '/' + spec.page;

  spec.logoUrl = SITE_URL + '/assets/img/mail-logo.png';
  spec.footer = `Sent from the ${escapeHtml(spec.formName)} at ` +
    `<a href="${escapeHtml(pageUrl)}" style="color:#054a8b;">nixoraservices.com</a>. ` +
    escapeHtml(spec.footerNote);
  spec.footerText = 'Sent from the ' + spec.formName + ' at ' + pageUrl + '. ' + spec.footerNote;

  writeFileSync(join(outDir, key + '.html'), renderEmail(spec));
  console.log(key.padEnd(12), '→', spec.subject);
  console.log(renderText(spec).split('\n').map((l) => '   ' + l).join('\n'));
  console.log();
});

console.log('HTML written to', outDir);
