import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkLocales } from './check-i18n.mjs';

const en = { home: { title: 'Home', greet: 'Hi {{name}}' } };

test('passes when all locales match English', () => {
  const hi = { home: { title: 'होम', greet: 'नमस्ते {{name}}' } };
  assert.deepEqual(checkLocales({ en, hi }, []), []);
});

test('reports a key missing from a locale', () => {
  const hi = { home: { title: 'होम' } };
  assert.match(checkLocales({ en, hi }, []).join('\n'), /hi: missing home\.greet/);
});

test('reports an extra key not in English', () => {
  const hi = { home: { title: 'होम', greet: 'नमस्ते {{name}}', extra: 'x' } };
  assert.match(checkLocales({ en, hi }, []).join('\n'), /hi: extra home\.extra/);
});

test('reports text in the wrong script', () => {
  const ta = { home: { title: 'Home', greet: 'வணக்கம் {{name}}' } };
  assert.match(checkLocales({ en, ta }, []).join('\n'), /ta: home\.title is not in Tamil script/);
});

test('reports a dropped interpolation placeholder', () => {
  const hi = { home: { title: 'होम', greet: 'नमस्ते' } };
  assert.match(checkLocales({ en, hi }, []).join('\n'), /hi: home\.greet lost \{\{name\}\}/);
});

test('reports a key used in source but missing from English', () => {
  const src = [{ path: 'a.js', text: "t('home.title'); t(\"home.nope\")" }];
  assert.match(checkLocales({ en }, src).join('\n'), /a\.js uses missing key home\.nope/);
});

test('treats <tag> markup as script-neutral', () => {
  const enT = { a: { terms: 'Agree to <terms>Terms</terms>' } };
  const hi = { a: { terms: '<terms>शर्तें</terms> मानें' } };
  assert.deepEqual(checkLocales({ en: enT, hi }, []), []);
});
