import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as guard from '../src/i18n/languageGuard.js';

beforeEach(() => guard.resetForTests());

test('a server language may apply when nothing changed locally', () => {
  const epoch = guard.languageEpoch();
  assert.equal(guard.serverMayApply(epoch), true);
});

test('a /me that started before a local pick must not override it', () => {
  const epoch = guard.languageEpoch(); // /me starts
  guard.markLocalChangeStart(); // user picks हिन्दी
  guard.markLocalChangeEnd(); // PATCH done
  assert.equal(guard.serverMayApply(epoch), false); // stale /me lands
});

test('nothing from the server applies while a pick is still saving', () => {
  guard.markLocalChangeStart();
  const epoch = guard.languageEpoch(); // /me starts after the pick began
  assert.equal(guard.serverMayApply(epoch), false);
  guard.markLocalChangeEnd();
  assert.equal(guard.serverMayApply(epoch), true);
});
