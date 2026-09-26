import i18n, { SUPPORTED } from '.';
import { updateMe } from '../services/api';
import { getLanguage, getUser, saveLanguage, saveUser } from '../services/session';

const valid = (code) => (SUPPORTED.includes(code) ? code : 'en');

/** BCP-47 tag for dates and numbers, e.g. 'hi-IN'. */
export function localeTag() {
  return `${i18n.language}-IN`;
}

/** Switch the UI and remember the choice on this device. No network. */
export async function applyLanguage(code) {
  const lang = valid(code);
  if (i18n.language !== lang) await i18n.changeLanguage(lang);
  await saveLanguage(lang);
}

/** Called once before the first screen renders. */
export async function initLanguage() {
  try {
    const cached = (await getLanguage()) || (await getUser())?.preferredLanguage;
    if (cached) await i18n.changeLanguage(valid(cached));
  } catch {
    // Unreadable storage — stay in English.
  }
}

/**
 * The picker's action: switch immediately, then save to the profile. If the
 * server refuses, switch back and rethrow so the caller can tell the user.
 */
export async function setAppLanguage(code) {
  const previous = i18n.language;
  await applyLanguage(code);
  try {
    const updated = await updateMe({ preferredLanguage: valid(code) });
    await saveUser(updated);
    return updated;
  } catch (err) {
    await applyLanguage(previous);
    throw err;
  }
}
