import { GoogleSignin } from '@react-native-google-signin/google-signin';

import { goOffline } from './api';
import { clearSession } from './session';

/** Signs out of Google on this device and forgets the app session. */
export async function signOut() {
  // Stop receiving job requests on this account. Not a worker, or no
  // network — fine, the server drops silent workers within minutes anyway.
  await goOffline().catch(() => {});
  try {
    await GoogleSignin.signOut();
  } catch {
    // Not signed in with Google on this device — nothing to undo.
  }
  await clearSession();
}
