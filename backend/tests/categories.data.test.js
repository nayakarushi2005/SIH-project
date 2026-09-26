const data = require('../data/categories.json');
const { LANGUAGES } = require('../services/profile');

const SCRIPTS = {
  hi: /\p{Script=Devanagari}/u,
  mr: /\p{Script=Devanagari}/u,
  bn: /\p{Script=Bengali}/u,
  ta: /\p{Script=Tamil}/u,
  te: /\p{Script=Telugu}/u,
  en: /^[\x20-\x7E]+$/,
};
const SLUG = /^[a-z][a-z0-9_]*$/;

function expectNames(names, where) {
  for (const lang of LANGUAGES) {
    const value = names?.[lang];
    expect({ where, lang, ok: typeof value === 'string' && value.trim().length > 0 }).toEqual({ where, lang, ok: true });
    expect({ where, lang, script: SCRIPTS[lang].test(value) }).toEqual({ where, lang, script: true });
  }
}

test('groups are unique and fully translated', () => {
  const slugs = data.groups.map((g) => g.slug);
  expect(new Set(slugs).size).toBe(slugs.length);
  for (const g of data.groups) {
    expect(g.slug).toMatch(SLUG);
    expectNames(g.names, g.slug);
  }
});

test('categories are unique, grouped, translated and have synonyms', () => {
  const groupSlugs = new Set(data.groups.map((g) => g.slug));
  const slugs = data.categories.map((c) => c.slug);
  expect(new Set(slugs).size).toBe(slugs.length);
  expect(slugs.length).toBeGreaterThanOrEqual(60);
  for (const c of data.categories) {
    expect(c.slug).toMatch(SLUG);
    expect(groupSlugs.has(c.group)).toBe(true);
    expectNames(c.names, c.slug);
    for (const lang of LANGUAGES) expect(Array.isArray(c.synonyms?.[lang])).toBe(true);
    expect(c.synonyms.hi.length).toBeGreaterThan(0);
    expect(typeof c.icon).toBe('string');
  }
});

test('legacy app slugs still exist', () => {
  const slugs = new Set(data.categories.map((c) => c.slug));
  for (const s of ['electrician', 'cleaning', 'plumber', 'carpenter', 'painter', 'caregiver', 'driver', 'gardener', 'technician']) {
    expect(slugs.has(s)).toBe(true);
  }
});

// Wording a native speaker flagged as misleading or demeaning.
test.each([
  ['ro_service bn name is not the word "more"', () => data.categories.find((c) => c.slug === 'ro_service'), (c) => [c.names.bn, ...c.synonyms.bn], /(^|\s)আরও(\s|$)/],
  ['security group is not "security & convenience"', () => data.groups.find((g) => g.slug === 'security_facility'), (g) => [g.names.en, g.names.hi, g.names.mr, g.names.bn, g.names.ta, g.names.te], /facility|सुविधा|সুবিধা|வசதி|సౌకర్య/i],
  ['domestic help in Tamil is not "servant"', () => data.categories.find((c) => c.slug === 'maid'), (c) => [c.names.ta], /வேலையாள்/],
  ['cobbler in Marathi is not a caste name', () => data.categories.find((c) => c.slug === 'cobbler'), (c) => [c.names.mr], /चांभार/],
])('%s', (_, find, texts, banned) => {
  for (const text of texts(find())) expect(text).not.toMatch(banned);
});
