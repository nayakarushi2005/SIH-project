// Wording a reviewer flagged as wrong or demeaning — keep it from coming back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = (lang) => JSON.parse(readFileSync(new URL(`../src/i18n/locales/${lang}.json`, import.meta.url), 'utf8'));

test('the login note talks about login details, not all information', () => {
  // "Your credentials are never stored" — the app does store profile data.
  const generic = { hi: /आपकी जानकारी/, mr: /तुमची माहिती/, bn: /আপনার তথ্য/, ta: /உங்கள் தகவல்கள்/, te: /మీ వివరాలు/ };
  for (const [lang, banned] of Object.entries(generic)) {
    assert.doesNotMatch(load(lang).auth.loginNote, banned, lang);
  }
});

test('Telugu never calls workers "పనివారు" (reads as servants)', () => {
  assert.doesNotMatch(JSON.stringify(load('te')), /పనివార/);
});
