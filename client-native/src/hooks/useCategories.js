import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';

import { FALLBACK_GROUPS } from '../constants/services';
import { getCategories, getErrorMessage } from '../services/api';

// One fetch per language per app session; screens share the result.
const cache = new Map();

/**
 * The job-category catalogue in `lang`. Starts from the bundled fallback so
 * nothing renders empty offline, then swaps in the server list.
 */
export default function useCategories(lang = 'en') {
  const [errors, setErrors] = useState({});
  // Re-render once a fetch lands in the module cache.
  const [, bump] = useReducer((n) => n + 1, 0);

  const load = useCallback(async () => {
    try {
      const data = await getCategories(lang);
      // An empty catalogue (e.g. an unseeded database) is not an answer:
      // keep the fallback and ask again on the next screen instead of
      // caching nothing for the rest of the session.
      if (!data?.groups?.length) throw new Error('The job category list is empty.');
      cache.set(lang, data.groups);
      setErrors((e) => ({ ...e, [lang]: null }));
      bump();
    } catch (err) {
      setErrors((e) => ({ ...e, [lang]: getErrorMessage(err) }));
    }
  }, [lang]);

  useEffect(() => {
    if (!cache.has(lang)) load();
  }, [lang, load]);

  const reload = useCallback(() => {
    setErrors((e) => ({ ...e, [lang]: null }));
    return load();
  }, [lang, load]);

  const groups = cache.get(lang) ?? FALLBACK_GROUPS;
  const error = errors[lang] ?? null;
  const loading = !cache.has(lang) && !error;

  const index = useMemo(() => {
    const map = new Map();
    for (const g of groups) for (const c of g.categories) map.set(c.slug, c);
    return map;
  }, [groups]);

  const bySlug = useCallback((slug) => index.get(slug) ?? null, [index]);

  return { groups, bySlug, loading, error, reload };
}
