// Colour for a block's safety score (1–10, 10 = no SOS reported there).
const SCALE = [
  [9, '#16A34A'], // green
  [7, '#65A30D'], // lime
  [5, '#CA8A04'], // yellow
  [3, '#EA580C'], // orange
];
const DANGER = '#DC2626';

export function scoreColor(score) {
  if (score == null) return SCALE[0][1];
  const step = SCALE.find(([min]) => score >= min);
  return step ? step[1] : DANGER;
}

/** A score as shown on screen: "7.8". */
export function formatScore(score) {
  return (score ?? 10).toFixed(1);
}
