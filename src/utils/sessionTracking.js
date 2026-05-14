import {
  arrayUnion,
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '../config/firebaseConfig';

const DAY_MS = 24 * 60 * 60 * 1000;

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayDifference(previousDateKey, currentDateKey) {
  if (!previousDateKey) return null;
  const previous = new Date(`${previousDateKey}T00:00:00`);
  const current = new Date(`${currentDateKey}T00:00:00`);
  if (Number.isNaN(previous.getTime()) || Number.isNaN(current.getTime())) {
    return null;
  }
  return Math.round((current.getTime() - previous.getTime()) / DAY_MS);
}

function roundMinutes(seconds) {
  return Math.round((seconds / 60) * 100) / 100;
}

export async function recordCompletedSession({
  sessionId,
  sessionTitle,
  durationSeconds,
  completed = true,
  metadata = {},
}) {
  const user = auth.currentUser;
  const elapsedSeconds = Math.max(0, Math.floor(durationSeconds || 0));
  if (!user || elapsedSeconds <= 0) return;

  const todayKey = localDateKey();
  const sessionMinutes = roundMinutes(elapsedSeconds);
  const userRef = doc(db, 'users', user.uid);
  const sessionRef = doc(collection(db, 'users', user.uid, 'sessions'));

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(userRef);
    const data = snapshot.exists() ? snapshot.data() : {};
    const lastActiveDate = data.lastActiveDate || null;
    const diff = dayDifference(lastActiveDate, todayKey);
    const isNewActiveDay = lastActiveDate !== todayKey;
    const currentStreak = !isNewActiveDay
      ? data.currentStreak || 1
      : diff === 1
        ? (data.currentStreak || 0) + 1
        : 1;
    const longestStreak = Math.max(data.longestStreak || 0, currentStreak);
    const totalActiveDays = (data.totalActiveDays ?? data.totalDays ?? 0) + (isNewActiveDay ? 1 : 0);
    const totalSessionSeconds = (data.totalSessionSeconds || 0) + elapsedSeconds;
    const totalSessionMinutes = roundMinutes(totalSessionSeconds);
    const sessionsFinished = (data.sessionsFinished || 0) + 1;

    transaction.set(sessionRef, {
      sessionId,
      sessionTitle,
      durationSeconds: elapsedSeconds,
      durationMinutes: sessionMinutes,
      completed,
      localDate: todayKey,
      userId: user.uid,
      userEmail: user.email || '',
      metadata,
      createdAt: serverTimestamp(),
    });

    const userPatch = {
      email: user.email || data.email || '',
      sessionsFinished,
      totalSessionSeconds,
      totalSessionMinutes,
      totalSessionTime: totalSessionSeconds,
      currentStreak,
      longestStreak,
      totalActiveDays,
      totalDays: totalActiveDays,
      lastActiveDate: todayKey,
      lastSessionAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (completed && sessionId) {
      userPatch.completedSessionIds = arrayUnion(sessionId);
    }
    transaction.set(userRef, userPatch, { merge: true });
  });
}
