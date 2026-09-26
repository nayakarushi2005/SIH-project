// Worker traits clients give feedback on. Ids must match TRAITS in
// backend/services/traits.js; the labels here are only for display.
//   good    — shown under "What went well?"
//   bad     — shown under "What could be better?"
//   improve — how the worker sees it as an area to work on

export const TRAITS = [
  { id: 'punctual', good: 'On time', bad: 'Came late', improve: 'Being on time' },
  { id: 'quality', good: 'Great work', bad: 'Poor quality work', improve: 'Quality of work' },
  { id: 'clean', good: 'Left it clean', bad: 'Left a mess', improve: 'Cleaning up after work' },
  { id: 'fair_price', good: 'Fair price', bad: 'Asked for extra money', improve: 'Fair, upfront pricing' },
  { id: 'polite', good: 'Polite & respectful', bad: 'Rude behaviour', improve: 'Behaviour with clients' },
  { id: 'communication', good: 'Explained clearly', bad: 'Didn’t explain the work', improve: 'Explaining the work' },
  { id: 'safety', good: 'Worked safely', bad: 'Unsafe practices', improve: 'Safe work practices' },
];

export function getTrait(id) {
  return TRAITS.find((t) => t.id === id) ?? null;
}
