import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../config/firebaseConfig';
import { useLanguage } from '../context/LanguageContext';
import { ThemeColor, ThemeRadius } from '../theme/appTheme';

function formatMinutes(seconds, t) {
  if (!seconds || seconds <= 0) return `0 ${t('statMinutesShort')}`;
  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} ${t('statMinutesShort')}`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (mins === 0) return `${hours} ${t('statHoursShort')}`;
  return `${hours} ${t('statHoursShort')} ${mins} ${t('statMinutesShort')}`;
}

function StatRow({ value, label, hint }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

export default function MyStatsSection() {
  const { t } = useLanguage();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState(auth.currentUser?.uid ?? null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
      if (!user) {
        setUserData(null);
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!uid) return undefined;
    setLoading(true);
    const userRef = doc(db, 'users', uid);
    const unsub = onSnapshot(
      userRef,
      (snap) => {
        setUserData(snap.exists ? snap.data() : {});
        setLoading(false);
      },
      () => {
        setUserData({});
        setLoading(false);
      },
    );
    return unsub;
  }, [uid]);

  const totalSessionSeconds =
    userData?.totalSessionSeconds ?? userData?.totalSessionTime ?? 0;
  const currentStreak = userData?.currentStreak ?? 0;
  const longestStreak = userData?.longestStreak ?? 0;
  const totalActiveDays = userData?.totalActiveDays ?? userData?.totalDays ?? 0;
  const sessionsFinished = userData?.sessionsFinished ?? 0;

  const streakHint =
    longestStreak > 0
      ? t('statDayStreakHint', { count: longestStreak })
      : undefined;

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{t('myStatsHeading')}</Text>
      <Text style={styles.subheading}>
        {loading
          ? t('statsLoading')
          : !uid
            ? t('statsSignIn')
            : t('myStatsSubtitle')}
      </Text>

      {uid && !loading ? (
        <View style={styles.list}>
          <StatRow
            value={String(currentStreak)}
            label={t('statDayStreak')}
            hint={streakHint}
          />
          <StatRow
            value={String(totalActiveDays)}
            label={t('statDaysActive')}
            hint={totalActiveDays > 0 ? t('statDaysActiveHint') : undefined}
          />
          <StatRow
            value={formatMinutes(totalSessionSeconds, t)}
            label={t('statTotalMinutes')}
            hint={totalSessionSeconds > 0 ? t('statTotalMinutesHint') : undefined}
          />
          <StatRow
            value={String(sessionsFinished)}
            label={t('statSessionsCompleted')}
            hint={sessionsFinished > 0 ? t('statSessionsCompletedHint') : undefined}
          />
        </View>
      ) : null}
    </View>
  );
}

const cardShadow = Platform.select({
  ios: {
    shadowColor: ThemeColor.SHADOW_SLATE,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  android: { elevation: 3 },
});

const styles = StyleSheet.create({
  section: {
    marginBottom: 20,
  },
  heading: {
    fontSize: 24,
    fontWeight: '800',
    color: ThemeColor.BRAND,
    marginBottom: 6,
  },
  subheading: {
    fontSize: 16,
    lineHeight: 22,
    color: ThemeColor.HOME_CARD_TEXT,
    marginBottom: 16,
  },
  list: {
    gap: 12,
  },
  statRow: {
    width: '100%',
    borderRadius: ThemeRadius.MD,
    backgroundColor: ThemeColor.WHITE,
    borderWidth: 1,
    borderColor: ThemeColor.INPUT_BORDER_SOFT,
    paddingHorizontal: 20,
    paddingVertical: 18,
    minHeight: 100,
    justifyContent: 'center',
    ...cardShadow,
  },
  statValue: {
    fontSize: 36,
    fontWeight: '900',
    color: ThemeColor.BRAND,
    lineHeight: 42,
  },
  statLabel: {
    marginTop: 6,
    fontSize: 17,
    fontWeight: '700',
    color: ThemeColor.TEXT_PRIMARY,
    lineHeight: 23,
  },
  statHint: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '600',
    color: ThemeColor.HOME_CARD_TEXT,
    lineHeight: 21,
  },
});
