import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, increment, setDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebaseConfig';

const FLUSH_MS = 30000;
const TICK_MS = 1000;

/**
 * Counts active time while the app is foregrounded and the user is signed in,
 * and merges seconds into users/{uid}.totalSessionTime.
 */
export default function SessionTracker() {
  const pendingRef = useRef(0);
  const appStateRef = useRef(AppState.currentState);
  const uidRef = useRef(/** @type {string | null} */ (null));

  useEffect(() => {
    const flushForUid = async (/** @type {string | null} */ uid) => {
      if (!uid) return;
      const pending = pendingRef.current;
      if (pending <= 0) return;
      pendingRef.current = 0;
      try {
        await setDoc(
          doc(db, 'users', uid),
          { totalSessionTime: increment(pending) },
          { merge: true },
        );
      } catch {
        pendingRef.current += pending;
      }
    };

    const flush = () => flushForUid(uidRef.current);

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        const prev = uidRef.current;
        uidRef.current = null;
        void flushForUid(prev);
        return;
      }
      uidRef.current = user.uid;
    });

    const sub = AppState.addEventListener('change', (next) => {
      if (
        appStateRef.current === 'active' &&
        (next === 'inactive' || next === 'background')
      ) {
        flush();
      }
      appStateRef.current = next;
    });

    const flushId = setInterval(flush, FLUSH_MS);
    const tickId = setInterval(() => {
      if (appStateRef.current !== 'active' || !uidRef.current) return;
      pendingRef.current += 1;
    }, TICK_MS);

    return () => {
      unsubAuth();
      sub.remove();
      clearInterval(flushId);
      clearInterval(tickId);
      flush();
    };
  }, []);

  return null;
}
