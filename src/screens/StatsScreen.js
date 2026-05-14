import { useEffect, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../config/firebaseConfig';
import { ThemeColor, ThemeRadius } from '../theme/appTheme';

function formatMinutes(seconds) {
  if (!seconds || seconds <= 0) return '0 min';
  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins === 0 ? `${hours} hr` : `${hours} hr ${mins} min`;
}

function StatCard({ label, value, hint }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardValue}>{value}</Text>
      <Text style={styles.cardLabel}>{label}</Text>
      {hint ? <Text style={styles.cardHint}>{hint}</Text> : null}
    </View>
  );
}

export default function StatsScreen() {
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
        setUserData(snap.exists() ? snap.data() : {});
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
  const totalActiveDays =
    userData?.totalActiveDays ?? userData?.totalDays ?? 0;
  const sessionsFinished = userData?.sessionsFinished ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Active Stats</Text>
        <Text style={styles.subtitle}>
          {loading
            ? 'Loading your activity…'
            : !uid
              ? 'Sign in to see your activity.'
              : 'Your mindfulness activity across all sessions.'}
        </Text>

        <View style={styles.grid}>
          <StatCard
            label="Day streak"
            value={String(currentStreak)}
            hint={
              longestStreak > 0
                ? `Longest: ${longestStreak} day${longestStreak === 1 ? '' : 's'}`
                : undefined
            }
          />
          <StatCard
            label="Days active"
            value={String(totalActiveDays)}
            hint={totalActiveDays > 0 ? 'Total unique days' : undefined}
          />
          <StatCard
            label="Time in sessions"
            value={formatMinutes(totalSessionSeconds)}
          />
          <StatCard
            label="Sessions completed"
            value={String(sessionsFinished)}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
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
  safe: {
    flex: 1,
    backgroundColor: ThemeColor.SCREEN_BG,
  },
  container: {
    padding: 20,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: ThemeColor.BRAND,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: ThemeColor.HOME_CARD_TEXT,
    marginBottom: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: 110,
    borderRadius: ThemeRadius.MD,
    backgroundColor: ThemeColor.WHITE,
    borderWidth: 1,
    borderColor: ThemeColor.INPUT_BORDER_SOFT,
    padding: 16,
    justifyContent: 'center',
    ...cardShadow,
  },
  cardValue: {
    fontSize: 32,
    fontWeight: '800',
    color: ThemeColor.BRAND,
  },
  cardLabel: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '600',
    color: ThemeColor.HOME_CARD_TEXT,
  },
  cardHint: {
    marginTop: 2,
    fontSize: 12,
    color: ThemeColor.TEXT_MUTED,
  },
});
