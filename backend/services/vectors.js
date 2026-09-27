/**
 * Small helpers for embedding vectors. Vectors are plain number arrays (or
 * Float32Arrays) in memory and float32 Buffers in MongoDB — 768 dims is 3 KB
 * that way, about half of a BSON array of doubles.
 */

function dot(a, b) {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += a[i] * b[i];
  return sum;
}

/** Scales `v` to length 1, so a dot product is the cosine similarity. */
function normalize(v) {
  const length = Math.sqrt(dot(v, v));
  return length > 0 ? Array.from(v, (x) => x / length) : Array.from(v);
}

/** Normalised weighted average of `vectors`; null when no weight is left. */
function weightedMean(vectors, weights) {
  let total = 0;
  let sum = null;
  vectors.forEach((v, i) => {
    const w = weights[i];
    if (!(w > 0)) return;
    sum ??= new Array(v.length).fill(0);
    for (let j = 0; j < v.length; j += 1) sum[j] += w * v[j];
    total += w;
  });
  return total > 0 ? normalize(sum) : null;
}

function toBuffer(v) {
  return Buffer.from(Float32Array.from(v).buffer);
}

/** Reads a stored vector back: a Buffer, or the BSON Binary that lean() returns. */
function fromBuffer(stored) {
  if (!stored) return null;
  const bytes = stored._bsontype === 'Binary' ? stored.buffer.subarray(0, stored.position) : stored;
  // Copy first: the bytes may not sit at a 4-byte-aligned offset.
  return new Float32Array(Uint8Array.from(bytes).buffer);
}

module.exports = {
  dot,
  fromBuffer,
  normalize,
  toBuffer,
  weightedMean,
};
