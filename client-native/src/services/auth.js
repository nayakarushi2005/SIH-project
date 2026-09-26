import { GoogleSignin } from '@react-native-google-signin/google-signin';

import { clearSession } from './session';

/** Signs out of Google on this device and forgets the app session. */
export async function signOut() {
  try {
    await GoogleSignin.signOut();
  } catch {
    // Not signed in with Google on this device — nothing to undo.
  }
  await clearSession();
}
