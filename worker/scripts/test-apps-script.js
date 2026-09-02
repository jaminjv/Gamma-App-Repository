/* Runs the Apps Script against a fake spreadsheet, to check the parts the
   Worker's own tests cannot reach: growing the header, aligning old rows,
   the token, and pinning values that would otherwise become formulas. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'google-apps-script.gs'), 'utf8');

function makeSheet(name) {
  const rows = [];
  return {
    name, rows,
    getLastRow: () => rows.length,
    getLastColumn: () => (rows[0] ? rows[0].length : 0),
    getRange: (r, c, nr, nc) => ({
      getValues: () => [ (rows[r - 1] || []).slice(c - 1, c - 1 + nc) ],
      setValues: (v) => { rows[r - 1] = v[0].slice(); },
      setFontWeight: () => {}
    }),
    setFrozenRows: () => {},
    appendRow: (row) => rows.push(row)
  };
}

const book = { sheets: {},
  getSheetByName(n) { return this.sheets[n] || null; },
  insertSheet(n) { this.sheets[n] = makeSheet(n); return this.sheets[n]; } };

const sandbox = {
  SpreadsheetApp: { getActiveSpreadsheet: () => book },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: { MimeType: { JSON: 'json' },
    createTextOutput: (t) => ({ body: t, setMimeType() { return this; } }) },
  console
};
vm.createContext(sandbox);
vm.runInContext(src.replace("'PUT-THE-SAME-TOKEN-HERE'", "'secret123'"), sandbox);

const call = (payload) => JSON.parse(
  vm.runInContext('doPost(' + JSON.stringify({ postData: { contents: JSON.stringify(payload) } }) + ')',
    sandbox).body);

let pass = 0, fail = 0;
const check = (n, c, extra) => c ? (pass++, console.log('  ok   ' + n))
                                 : (fail++, console.log('  FAIL ' + n + (extra ? '  → ' + extra : '')));

check('a wrong token is refused',
  call({ token: 'nope', tab: 'Applications', columns: ['A'], values: ['1'] }).ok === false);
check('nothing was written by the refused call', !book.sheets['Applications']);

check('a valid row is accepted', call({ token: 'secret123', tab: 'Applications',
  columns: ['Received', 'Full Name', 'Email'],
  values: ['2026-09-02 10:00 UTC', 'Pepito Perez', 'pepito@ejemplo.com'] }).ok === true);

let s = book.sheets['Applications'];
check('the header was written', JSON.stringify(s.rows[0]) === '["Received","Full Name","Email"]', JSON.stringify(s.rows[0]));
check('the row landed under it', s.rows[1][1] === 'Pepito Perez', JSON.stringify(s.rows[1]));

// A later submission carrying a field the sheet has never seen.
call({ token: 'secret123', tab: 'Applications',
  columns: ['Received', 'Full Name', 'Email', 'Phone'],
  values: ['2026-09-02 11:00 UTC', 'Ana Gomez', 'ana@ejemplo.com', '(314) 555-0000'] });
check('a new field becomes a new column',
  JSON.stringify(s.rows[0]) === '["Received","Full Name","Email","Phone"]', JSON.stringify(s.rows[0]));
check('the older row keeps its meaning', s.rows[1][1] === 'Pepito Perez');
check('the newer row fills the new column', s.rows[2][3] === '(314) 555-0000', JSON.stringify(s.rows[2]));

// A field the sheet knows but this submission omitted.
call({ token: 'secret123', tab: 'Applications',
  columns: ['Received', 'Full Name'], values: ['2026-09-02 12:00 UTC', 'Luis Diaz'] });
check('a missing field leaves an empty cell, not a shift',
  s.rows[3][1] === 'Luis Diaz' && s.rows[3][2] === '' && s.rows[3][3] === '', JSON.stringify(s.rows[3]));

// Text that a spreadsheet would otherwise execute.
call({ token: 'secret123', tab: 'Applications',
  columns: ['Received', 'Full Name'], values: ['2026-09-02 13:00 UTC', '=HYPERLINK("http://evil","click")'] });
check('a value that looks like a formula is pinned to text',
  s.rows[4][1].charAt(0) === "'", JSON.stringify(s.rows[4][1]));

call({ token: 'secret123', tab: 'Reviews', columns: ['Received', 'Name'], values: ['x', 'Carlos'] });
check('a second tab is created on demand', Boolean(book.sheets['Reviews']));
check('and it does not disturb the first', book.sheets['Applications'].rows.length === 5);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
