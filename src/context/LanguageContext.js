import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebaseConfig';
import { STRINGS } from '../i18n/strings';

/** @typedef {import('../i18n/strings').AppLocale} AppLocale */

const LanguageContext = createContext(
  /** @type {{ locale: AppLocale; setLocale: (l: AppLocale) => Promise<void>; hydrateLocale: (l: AppLocale) => void; t: (key: string) => string; }} */ (
    null
  ),
);

export function LanguageProvider({ children }) {
  const [locale, setLocaleState] = useState(/** @type {AppLocale} */ ('en'));

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        // Keep guest UI language (e.g. Korean on sign-in) until the user signs in.
        return;
      }
      let snap = await getDoc(doc(db, 'users', user.uid));
      if (!snap.exists) {
        await new Promise((r) => setTimeout(r, 400));
        snap = await getDoc(doc(db, 'users', user.uid));
      }
      if (snap.exists) {
        const pref = snap.data().languagePreference;
        if (pref === 'ko' || pref === 'en') {
          setLocaleState(pref);
        }
      }
    });
  }, []);

  const hydrateLocale = useCallback((/** @type {AppLocale} */ next) => {
    setLocaleState(next);
  }, []);

  const setLocale = useCallback(async (/** @type {AppLocale} */ next) => {
    setLocaleState(next);
    const user = auth.currentUser;
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        languagePreference: next,
      });
    } catch {
      // Profile may be missing; ignore so UI still switches.
    }
  }, []);

  const t = useCallback(
    (/** @type {string} */ key) => {
      const table = STRINGS[locale] ?? STRINGS.en;
      return table[key] ?? STRINGS.en[key] ?? key;
    },
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, hydrateLocale, t }),
    [locale, setLocale, hydrateLocale, t],
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return ctx;
}
