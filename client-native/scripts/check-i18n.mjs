// Verifies the app's translations: every locale has exactly English's keys,
// no empty strings, the right script for each language, the same {{vars}},
// and every t('key') used in src/ exists in English.
//
//   npm run check:i18n
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = {
  hi: ['Devanagari', /\p{Script=Devanagari}/u],
  mr: ['Devanagari', /\p{Script=Devanagari}/u],
  bn: ['Bengali', /\p{Script=Bengali}/u],
  ta: ['Tamil', /\p{Script=Tamil}/u],
  te: ['Telugu', /\p{Script=Telugu}/u],
};

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

const vars = (s) => (String(s).match(/\{\{\s*\w+\s*\}\}/g) || []).map((v) => v.replace(/\s/g, '')).sort();
// Text a translator must write in the target script: drop markup, {{vars}},
// digits, punctuation and brand words that stay in Latin letters.
const BRANDS = /DigiLocker|Aadhaar|UIDAI|Meon|eKYC|Google|SIH Connect|PIN|OTP|XXXX/g;
const needsScript = (s) =>
  /\p{L}/u.test(String(s).replace(/<\/?\w+>/g, '').replace(/\{\{\s*\w+\s*\}\}/g, '').replace(BRANDS, ''));

export function checkLocales(locales, sourceFiles) {
  const problems = [];
  const en = flatten(locales.en);

  for (const [lang, data] of Object.entries(locales)) {
    const flat = flatten(data);
    for (const key of Object.keys(en)) {
      if (!(key in flat)) problems.push(`${lang}: missing ${key}`);
    }
    for (const [key, value] of Object.entries(flat)) {
      if (!(key in en)) {
        problems.push(`${lang}: extra ${key}`);
        continue;
      }
      if (typeof value !== 'string' || value.trim() === '') {
        problems.push(`${lang}: ${key} is empty`);
        continue;
      }
      for (const v of vars(en[key])) {
        if (!vars(value).includes(v)) problems.push(`${lang}: ${key} lost ${v}`);
      }
      const script = SCRIPTS[lang];
      if (script && needsScript(value) && !script[1].test(value)) {
        problems.push(`${lang}: ${key} is not in ${script[0]} script`);
      }
    }
  }

  const used = /\bt\(\s*['"]([\w.-]+)['"]/g;
  for (const { path, text } of sourceFiles) {
    for (const [, key] of text.matchAll(used)) {
      const isBranch = Object.keys(en).some((k) => k.startsWith(`${key}.`));
      if (!(key in en) && !isBranch) problems.push(`${path} uses missing key ${key}`);
    }
  }
  return problems;
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.jsx?$/.test(name) ? [p] : [];
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const localeDir = join(root, 'src/i18n/locales');
  const locales = Object.fromEntries(
    readdirSync(localeDir).map((f) => [f.replace('.json', ''), JSON.parse(readFileSync(join(localeDir, f), 'utf8'))])
  );
  const sources = walk(join(root, 'src')).map((path) => ({ path, text: readFileSync(path, 'utf8') }));
  const problems = checkLocales(locales, sources);
  if (problems.length) {
    console.error(problems.join('\n'));
    console.error(`\n${problems.length} problem(s).`);
    process.exit(1);
  }
  console.log(`i18n OK: ${Object.keys(locales).join(', ')} · ${Object.keys(flatten(locales.en)).length} keys`);
}
