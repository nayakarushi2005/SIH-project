// Worker traits clients give feedback on. Ids must match TRAITS in
// backend/services/traits.js; the labels are i18n keys for display.
//   good    — shown under "What went well?"
//   bad     — shown under "What could be better?"
//   improve — how the worker sees it as an area to work on

export const TRAITS = [
  { id: 'punctual', good: 'traits.punctual.good', bad: 'traits.punctual.bad', improve: 'traits.punctual.improve' },
  { id: 'quality', good: 'traits.quality.good', bad: 'traits.quality.bad', improve: 'traits.quality.improve' },
  { id: 'clean', good: 'traits.clean.good', bad: 'traits.clean.bad', improve: 'traits.clean.improve' },
  { id: 'fair_price', good: 'traits.fair_price.good', bad: 'traits.fair_price.bad', improve: 'traits.fair_price.improve' },
  { id: 'polite', good: 'traits.polite.good', bad: 'traits.polite.bad', improve: 'traits.polite.improve' },
  {
    id: 'communication',
    good: 'traits.communication.good',
    bad: 'traits.communication.bad',
    improve: 'traits.communication.improve',
  },
  { id: 'safety', good: 'traits.safety.good', bad: 'traits.safety.bad', improve: 'traits.safety.improve' },
];

export function getTrait(id) {
  return TRAITS.find((t) => t.id === id) ?? null;
}

/** Translated label for a trait: traitLabel(t, 'punctual', 'good') → "On time". */
export function traitLabel(t, id, kind) {
  const trait = getTrait(id);
  return trait ? t(trait[kind]) : id;
}
