// Stops a slow /auth/me response from undoing a language the user just
// picked: a server language may only apply if no local pick started after
// the request went out, and none is still saving.

let changes = 0;
let pending = 0;

export function markLocalChangeStart() {
  changes += 1;
  pending += 1;
}

export function markLocalChangeEnd() {
  pending = Math.max(0, pending - 1);
}

/** Take before sending /me; pass to serverMayApply when it returns. */
export function languageEpoch() {
  return changes;
}

export function serverMayApply(epoch) {
  return pending === 0 && epoch === changes;
}

export function resetForTests() {
  changes = 0;
  pending = 0;
}
