import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebaseConfig';
import { useLanguage } from '../context/LanguageContext';
import { ThemeColor, ThemeRadius } from '../theme/appTheme';

function InfoRow({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value || '—'}</Text>
    </View>
  );
}

export default function PersonalInfoScreen({ navigation }) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({
    fullName: '',
    email: '',
    dateOfBirth: '',
    languagePreference: '',
  });

  useEffect(() => {
    let unsubUser = null;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (unsubUser) {
        unsubUser();
        unsubUser = null;
      }
      if (!user) {
        setLoading(false);
        return;
      }
      void (async () => {
        try {
          const snap = await getDoc(doc(db, 'users', user.uid));
          const data = snap.exists ? snap.data() : {};
          setProfile({
            fullName: data.fullName || user.displayName || '',
            email: user.email || data.email || '',
            dateOfBirth: data.dateOfBirth || '',
            languagePreference: data.languagePreference || '',
          });
        } catch {
          setProfile({
            fullName: user.displayName || '',
            email: user.email || '',
            dateOfBirth: '',
            languagePreference: '',
          });
        } finally {
          setLoading(false);
        }
      })();
    });
    return () => {
      unsubAuth();
      if (unsubUser) unsubUser();
    };
  }, []);

  const languageLabel =
    profile.languagePreference === 'ko'
      ? t('langKorean')
      : profile.languagePreference === 'en'
        ? t('langEnglish')
        : '—';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← {t('back')}</Text>
        </Pressable>
        <Text style={styles.title}>{t('personalInformation')}</Text>

        {loading ? (
          <ActivityIndicator size="large" color={ThemeColor.BRAND} style={styles.loader} />
        ) : (
          <View style={styles.card}>
            <InfoRow label={t('fullName')} value={profile.fullName} />
            <InfoRow label={t('email')} value={profile.email} />
            <InfoRow label={t('dateOfBirth')} value={profile.dateOfBirth} />
            <InfoRow label={t('languageLabel')} value={languageLabel} />
          </View>
        )}
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
  safe: { flex: 1, backgroundColor: ThemeColor.SCREEN_BG },
  container: { padding: 20, maxWidth: 480, width: '100%', alignSelf: 'center' },
  backBtn: { marginBottom: 12 },
  backText: { fontSize: 16, fontWeight: '700', color: ThemeColor.BRAND },
  title: { fontSize: 26, fontWeight: '700', color: ThemeColor.BRAND, marginBottom: 20 },
  loader: { marginTop: 24 },
  card: {
    backgroundColor: ThemeColor.WHITE,
    borderRadius: ThemeRadius.MD,
    borderWidth: 1,
    borderColor: ThemeColor.INPUT_BORDER_SOFT,
    padding: 16,
    gap: 14,
    ...cardShadow,
  },
  row: { gap: 4 },
  rowLabel: { fontSize: 13, fontWeight: '700', color: ThemeColor.HOME_SUBTITLE },
  rowValue: { fontSize: 17, fontWeight: '600', color: ThemeColor.TEXT_PRIMARY },
});
