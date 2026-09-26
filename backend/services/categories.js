/**
 * Read side of the job-category taxonomy: localised, grouped, and filtered
 * for the caller's city.
 */
const Category = require('../models/Category');
const CategoryGroup = require('../models/CategoryGroup');
const { LANGUAGES } = require('./profile');

function resolveLang(lang) {
  return LANGUAGES.includes(lang) ? lang : 'en';
}

async function listCategories({ lang, city, withSynonyms = false } = {}) {
  const language = resolveLang(lang);
  const cityKey = typeof city === 'string' ? city.trim().toLowerCase() : '';

  const filter = { isActive: true };
  if (cityKey) filter.disabledCities = { $ne: cityKey };

  const [groups, categories] = await Promise.all([
    CategoryGroup.find().sort({ sortOrder: 1 }).lean(),
    Category.find(filter).sort({ sortOrder: 1 }).lean(),
  ]);

  const byGroup = new Map(groups.map((g) => [g.slug, []]));
  for (const c of categories) {
    const item = {
      slug: c.slug,
      name: c.names[language] || c.names.en,
      icon: c.icon,
      ncoCode: c.ncoCode,
    };
    if (withSynonyms) item.synonyms = c.synonyms?.[language] ?? [];
    byGroup.get(c.group)?.push(item);
  }

  return {
    lang: language,
    groups: groups
      .filter((g) => byGroup.get(g.slug).length > 0)
      .map((g) => ({
        slug: g.slug,
        name: g.names[language] || g.names.en,
        icon: g.icon,
        categories: byGroup.get(g.slug),
      })),
  };
}

module.exports = { listCategories, resolveLang };
