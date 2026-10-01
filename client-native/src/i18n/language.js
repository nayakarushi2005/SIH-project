import i18n, { SUPPORTED } from '.';
import { updateMe } from '../services/api';
import { getLanguage, getUser, markLanguageChosen, saveLanguage, saveUser } from '../services/session';
import { languageEpoch, markLocalChangeEnd, markLocalChangeStart, serverMayApply } from './languageGuard';

export { languageEpoch };

const valid = (code) => (SUPPORTED.includes(code) ? code : 'en');

/**
 * BCP-47 tag for dates and numbers, e.g. 'hi-IN-u-nu-latn'. The `-u-nu-latn`
 * extension forces Latin digits even in locales (like mr-IN) whose default
 * numbering system is Devanagari, so numbers stay consistent with the
 * Latin-digit strings used everywhere else in the app.
 */
export function localeTag() {
  return `${i18n.language}-IN-u-nu-latn`;
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
  markLocalChangeStart();
  try {
    await applyLanguage(code);
    try {
      const updated = await updateMe({ preferredLanguage: valid(code) });
      await saveUser(updated);
      await markLanguageChosen().catch(() => {});
      return updated;
    } catch (err) {
      await applyLanguage(previous);
      throw err;
    }
  } finally {
    markLocalChangeEnd();
  }
}

/**
 * Apply the language from a /me response, unless the user picked one on
 * this device since `epoch` (from languageEpoch() before the request).
 */
export async function applyServerLanguage(code, epoch) {
  if (code && serverMayApply(epoch)) await applyLanguage(code);
}
