/* ==========================================================================
   Nixora Services LLC — notification email rendering.

   Tables and inline styles only: Gmail and Outlook strip <style> blocks,
   flexbox and grid. 600px is the width every client renders without
   horizontal scrolling, and the logo is a hosted PNG because most clients
   refuse to draw SVG.
   ========================================================================== */

const NAVY = '#054a8b';
const INK = '#0e1626';
const MUTED = '#5d6b82';
const LINE = '#eef2f7';
const TINT = '#f4f7fb';
const LIME = '#57741b';

export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* Turns a typed phone number into a dialable href. US numbers arrive as
   (314) 555-0000; anything already carrying a + is left alone. */
export function telHref(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  if (raw.charAt(0) === '+') return raw.replace(/[^\d+]/g, '');
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return digits.length === 10 ? '+1' + digits : '+' + digits;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/* Formats the YYYY-MM-DD that <input type="date"> submits. Parsed by hand
   rather than through Date, which would shift the day across time zones. */
export function formatDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return String(value || '');
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return value;
  return month + ' ' + Number(match[3]) + ', ' + match[1];
}

const label = (text) =>
  `<p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:1.3px;` +
  `text-transform:uppercase;color:${NAVY};">${escapeHtml(text)}</p>`;

const cell = (style) =>
  `padding:9px 0;border-bottom:1px solid ${LINE};${style || ''}`;

/* A label/value table. `html` is already-escaped markup so a value can carry
   a link or a line break. */
function rowsTable(rows) {
  const body = rows.map(([name, html]) =>
    `<tr><td style="${cell('width:180px;color:' + MUTED + ';')}">${escapeHtml(name)}</td>` +
    `<td style="${cell()}">${html}</td></tr>`
  ).join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="font-size:15px;color:${INK};border-collapse:collapse;">${body}</table>`;
}

/* Ticked declarations. The tick is an entity rather than an emoji so it keeps
   its colour, and the sentence still reads if a client drops the glyph. */
function checksTable(items) {
  const last = items.length - 1;
  const body = items.map((item, i) => {
    const pad = i === 0 ? '14px 16px 4px'
      : i === last ? '4px 16px 14px'
        : '4px 16px';
    return `<tr><td style="padding:${pad};">` +
      `<span style="color:${LIME};font-weight:700;">&#10003;</span>&nbsp; ${escapeHtml(item)}</td></tr>`;
  }).join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="font-size:14px;color:#33425c;background-color:${TINT};border-radius:10px;">${body}</table>`;
}

function messageBlock(text) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background-color:${TINT};border-radius:10px;">
    <tr><td style="padding:16px;font-size:15px;line-height:1.6;color:${INK};">
      ${escapeHtml(text).replace(/\r?\n/g, '<br>')}
    </td></tr></table>`;
}

function section(block) {
  let inner = '';
  if (block.rows) inner = rowsTable(block.rows);
  else if (block.checks) inner = checksTable(block.checks);
  else if (block.text) inner = messageBlock(block.text);
  else return '';

  return `<tr><td style="padding:26px 32px 0;">${label(block.title)}${inner}</td></tr>`;
}

function buttons(actions) {
  if (!actions.length) return '';
  const html = actions.map((action, i) => {
    const style = i === 0
      ? `display:inline-block;background-color:${NAVY};color:#ffffff;text-decoration:none;` +
        `font-size:15px;font-weight:700;padding:12px 22px;border-radius:100px;`
      : `display:inline-block;margin-left:8px;color:${NAVY};text-decoration:none;` +
        `font-size:15px;font-weight:700;padding:12px 18px;border:1.5px solid #dee4ee;border-radius:100px;`;
    return `<a href="${escapeHtml(action.href)}" style="${style}">${escapeHtml(action.text)}</a>`;
  }).join('\n              ');

  return `<p style="margin:18px 0 0;">\n              ${html}\n            </p>`;
}

/**
 * Renders the notification body.
 *
 * spec: { eyebrow, title, subtitle, actions[], sections[], signature, footer,
 *         siteUrl, logoUrl }
 */
export function renderEmail(spec) {
  const sections = (spec.sections || []).map(section).join('\n');

  // Without a signature block the last section would sit flush against the
  // footer, so an empty row supplies the missing bottom margin.
  const spacer = spec.signature
    ? ''
    : `<tr><td style="height:30px;line-height:30px;font-size:0;">&nbsp;</td></tr>`;

  const signature = spec.signature
    ? `<tr><td style="padding:22px 32px 30px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="border-top:2px solid ${LINE};">
            <tr><td style="padding:16px 0 0;font-size:14px;color:${MUTED};">
              Signed electronically by
              <strong style="color:${INK};">${escapeHtml(spec.signature.name)}</strong>
              on ${escapeHtml(formatDate(spec.signature.date))}
            </td></tr>
          </table>
        </td></tr>`
    : '';

  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(spec.eyebrow)}</title></head>
<body style="margin:0;padding:0;background-color:${LINE};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="margin:0;padding:0;background-color:#eef2f7;">
  <tr>
    <td align="center" style="padding:24px 12px;">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="width:600px;max-width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;
                    font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

        <!-- Header. The alt text is styled white so it still reads on the
             navy band in clients that block images by default. -->
        <tr>
          <td style="background-color:${NAVY};padding:26px 32px;">
            <img src="${escapeHtml(spec.logoUrl)}" width="150" height="73" alt="Nixora Services"
                 style="display:block;border:0;outline:none;text-decoration:none;height:auto;
                        color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:20px;
                        font-weight:700;">
            <p style="margin:16px 0 0;font-size:13px;line-height:1.4;color:#b3d2ef;
                      letter-spacing:1.4px;text-transform:uppercase;font-weight:700;">
              ${escapeHtml(spec.eyebrow)}
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:30px 32px 8px;">
            <h1 style="margin:0 0 6px;font-size:26px;line-height:1.25;color:${INK};font-weight:700;">
              ${escapeHtml(spec.title)}
            </h1>
            <p style="margin:0;font-size:16px;line-height:1.5;color:${MUTED};">
              ${spec.subtitle}
            </p>
            ${buttons(spec.actions || [])}
          </td>
        </tr>

${sections}
${signature}${spacer}

        <tr>
          <td style="background-color:${TINT};padding:18px 32px;font-size:12px;line-height:1.6;color:${MUTED};">
            ${spec.footer}
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body></html>`;
}

/* Plain-text alternative. Every notification ships with one: it is what
   deliverability filters look for, and what a watch or a screen reader gets. */
export function renderText(spec) {
  const lines = [spec.eyebrow.toUpperCase(), '', spec.title, spec.subtitleText, ''];

  (spec.sections || []).forEach((block) => {
    lines.push(block.title.toUpperCase());
    if (block.rows) block.rows.forEach(([name, , plain]) => lines.push('  ' + name + ': ' + plain));
    else if (block.checks) block.checks.forEach((item) => lines.push('  [x] ' + item));
    else if (block.text) lines.push('  ' + block.text.replace(/\r?\n/g, '\n  '));
    lines.push('');
  });

  if (spec.signature) {
    lines.push('Signed electronically by ' + spec.signature.name +
      ' on ' + formatDate(spec.signature.date), '');
  }

  lines.push(spec.footerText);
  return lines.join('\n');
}
