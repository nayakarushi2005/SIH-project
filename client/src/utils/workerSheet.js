import { WORKER_MESSAGES, checkImportRow } from './workerFields';

export const IMPORT_LIMIT = 2000;

export const SHEET_MESSAGES = {
  unreadable: 'Could not read this file. Save it as an Excel workbook (.xlsx) and try again.',
  empty: 'The sheet has no workers to import.',
  tooMany: `Import up to ${IMPORT_LIMIT} workers at a time.`,
};

const REQUIRED_COLUMNS = [
  ['name', 'Name'],
  ['phone', 'Mobile Number'],
  ['aadhaar', 'Aadhaar Number'],
];

const FIELD_ORDER = ['name', 'phone', 'aadhaar', 'photoUrl'];

export function cellToText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return value.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 });
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  }
  return String(value).trim();
}

export function columnForHeading(heading) {
  const key = cellToText(heading).toLowerCase().replace(/[^\p{L}]/gu, '');
  if (key.includes('aadha') || key.includes('adhar')) return 'aadhaar';
  if (key.includes('mobile') || key.includes('phone')) return 'phone';
  if (key.startsWith('photo')) return 'photoUrl';
  if (key.includes('name')) return 'name';
  return null;
}

export function rowProblem(errors) {
  return FIELD_ORDER.filter((field) => errors[field]).map((field) => errors[field]).join(' ');
}

export function parseWorkerSheet(rows) {
  const columns = {};
  (rows[0] || []).forEach((heading, index) => {
    const field = columnForHeading(heading);
    if (field && columns[field] === undefined) columns[field] = index;
  });

  const missing = REQUIRED_COLUMNS.filter(([field]) => columns[field] === undefined).map(([, label]) => label);
  if (missing.length > 0) {
    return { error: `The sheet needs these columns: ${missing.join(', ')}.` };
  }

  const entries = [];
  for (let index = 1; index < rows.length; index += 1) {
    const cells = rows[index] || [];
    if (cells.every((cell) => cellToText(cell) === '')) continue;
    entries.push({ row: index + 1, cells });
  }
  if (entries.length === 0) return { error: SHEET_MESSAGES.empty };
  if (entries.length > IMPORT_LIMIT) return { error: SHEET_MESSAGES.tooMany };

  const readCell = (cells, field) => (columns[field] === undefined ? '' : cellToText(cells[columns[field]]));
  const seenPhones = new Set();
  const valid = [];
  const problems = [];

  for (const { row, cells } of entries) {
    const { values, errors } = checkImportRow({
      name: readCell(cells, 'name'),
      phone: readCell(cells, 'phone'),
      aadhaar: readCell(cells, 'aadhaar'),
      photoUrl: readCell(cells, 'photoUrl'),
    });
    if (Object.keys(errors).length === 0) {
      if (seenPhones.has(values.phone)) errors.phone = WORKER_MESSAGES.duplicateInSheet;
      else seenPhones.add(values.phone);
    }
    if (Object.keys(errors).length > 0) {
      problems.push({ row, message: rowProblem(errors) });
    } else {
      valid.push({ row, ...values });
    }
  }

  return { valid, problems };
}

export async function readWorkerSheet(file) {
  if (!file || !/\.xlsx$/i.test(file.name || '')) return { error: SHEET_MESSAGES.unreadable };
  let rows;
  try {
    const { readSheet } = await import('read-excel-file/browser');
    rows = await readSheet(file);
  } catch {
    return { error: SHEET_MESSAGES.unreadable };
  }
  if (!Array.isArray(rows)) return { error: SHEET_MESSAGES.unreadable };
  return parseWorkerSheet(rows);
}
