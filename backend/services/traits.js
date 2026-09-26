/**
 * The fixed vocabulary of worker traits clients give feedback on. Each trait
 * can be praised ("good") or criticised ("bad") — the same node in the
 * knowledge graph either way, so "came late" and "on time" count toward one
 * score. A fixed list keeps the graph clean: free text would turn "punctual",
 * "on time" and "came early" into three different nodes.
 *
 * Mirrored for display in client-native/src/utils/traits.js.
 */

const TRAITS = [
  { id: 'punctual', good: 'On time', bad: 'Came late' },
  { id: 'quality', good: 'Great work', bad: 'Poor quality work' },
  { id: 'clean', good: 'Left it clean', bad: 'Left a mess' },
  { id: 'fair_price', good: 'Fair price', bad: 'Asked for extra money' },
  { id: 'polite', good: 'Polite & respectful', bad: 'Rude behaviour' },
  { id: 'communication', good: 'Explained clearly', bad: 'Didn’t explain the work' },
  { id: 'safety', good: 'Worked safely', bad: 'Unsafe practices' },
];

const TRAIT_IDS = TRAITS.map((t) => t.id);

module.exports = {
  TRAITS,
  TRAIT_IDS,
};
