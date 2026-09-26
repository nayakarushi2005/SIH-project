import { GoogleSignin } from '@react-native-google-signin/google-signin';

import { clearSession } from './session';

export async function signOut() {
  try {
    await GoogleSignin.signOut();
  } catch {
  }
  await clearSession();
}
