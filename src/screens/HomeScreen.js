import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import {
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../config/firebaseConfig';
import { useLanguage } from '../context/LanguageContext';
import { KOREAN_NATIVE_LABEL } from '../i18n/labels';
import { ThemeColor, ThemeRadius } from '../theme/appTheme';
import { formatSessionDuration } from '../utils/formatDuration';

export default function HomeScreen({ navigation }) {
  const { locale, setLocale, t } = useLanguage();
  const [totalSessionSeconds, setTotalSessionSeconds] = useState(0);

  useFocusEffect(
    useCallback(() => {
      const user = auth.currentUser;
      if (!user) return undefined;
      const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
        if (snap.exists) {
          const v = snap.data().totalSessionTime;
          setTotalSessionSeconds(typeof v === 'number' ? v : 0);
        }
      });
      return () => unsub();
    }, []),
  );

  const cards = useMemo(
    () => [
      {
        title: t('cardAboutTitle'),
        text: t('cardAboutText'),
      },
      {
        title: t('cardUsageTitle'),
        text: t('cardUsageText'),
      },
      {
        title: t('cardUpdatesTitle'),
        text: t('cardUpdatesText'),
      },
      {
        title: t('cardSettingsTitle'),
        text: t('cardSettingsText'),
      },
    ],
    [t],
  );

  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch {
      // Still leave the app shell; user can sign in again.
    }
    navigation.reset({
      index: 0,
      routes: [{ name: 'SignIn' }],
    });
  }, [navigation]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('homeTitle'),
      headerBackVisible: false,
      headerLeft: () => null,
      gestureEnabled: false,
      headerRight: () => (
        <Pressable
          onPress={handleLogout}
          style={({ pressed }) => [
            styles.headerLogout,
            pressed && styles.headerLogoutPressed,
          ]}
          hitSlop={12}
        >
          <Text style={styles.headerLogoutText}>{t('logOut')}</Text>
        </Pressable>
      ),
    });
  }, [navigation, handleLogout, t]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => sub.remove();
    }, []),
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t('homeTitle')}</Text>
      <Text style={styles.subtitle}>{t('homeSubtitle')}</Text>

      <View style={styles.statsBlock}>
        <Text style={styles.statsLabel}>{t('sessionTimeHeading')}</Text>
        <Text style={styles.statsValue}>
          {t('sessionTimeValue')}:{' '}
          {formatSessionDuration(totalSessionSeconds)}
        </Text>
      </View>

      <Text style={styles.sectionLabel}>{t('languageHeading')}</Text>
      <View style={styles.langRow}>
        <Pressable
          onPress={() => void setLocale('en')}
          style={({ pressed }) => [
            styles.langChip,
            locale === 'en' && styles.langChipSelected,
            pressed && styles.langChipPressed,
          ]}
        >
          <Text
            style={[
              styles.langChipText,
              locale === 'en' && styles.langChipTextSelected,
            ]}
          >
            {t('langEnglish')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => void setLocale('ko')}
          style={({ pressed }) => [
            styles.langChip,
            locale === 'ko' && styles.langChipSelected,
            pressed && styles.langChipPressed,
          ]}
        >
          <Text
            style={[
              styles.langChipText,
              locale === 'ko' && styles.langChipTextSelected,
            ]}
          >
            {KOREAN_NATIVE_LABEL}
          </Text>
        </Pressable>
      </View>

      <View style={styles.chatPlaceholder}>
        <Text style={styles.chatText}>{t('chatPlaceholder')}</Text>
      </View>
      {cards.map((card) => (
        <View key={card.title} style={styles.card}>
          <Text style={styles.cardTitle}>{card.title}</Text>
          <Text style={styles.cardText}>{card.text}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerLogout: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginRight: 8,
    justifyContent: 'center',
  },
  headerLogoutPressed: {
    opacity: 0.55,
  },
  headerLogoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: ThemeColor.BRAND,
  },
  container: {
    padding: 20,
    backgroundColor: ThemeColor.SCREEN_BG,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: ThemeColor.BRAND,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 16,
    color: ThemeColor.HOME_SUBTITLE,
    marginBottom: 14,
  },
  statsBlock: {
    backgroundColor: ThemeColor.WHITE,
    borderRadius: ThemeRadius.SM,
    borderLeftWidth: 4,
    borderLeftColor: ThemeColor.BRAND,
    padding: 14,
    marginBottom: 16,
  },
  statsLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: ThemeColor.BRAND,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  statsValue: {
    fontSize: 16,
    fontWeight: '600',
    color: ThemeColor.HOME_CARD_TEXT,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: ThemeColor.HOME_CARD_TEXT,
    marginBottom: 8,
  },
  langRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  langChip: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: ThemeRadius.SM,
    borderWidth: 1,
    borderColor: ThemeColor.INPUT_BORDER_SOFT,
    backgroundColor: ThemeColor.WHITE,
    alignItems: 'center',
  },
  langChipSelected: {
    borderColor: ThemeColor.BRAND,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
  },
  langChipPressed: {
    opacity: 0.85,
  },
  langChipText: {
    fontSize: 15,
    fontWeight: '600',
    color: ThemeColor.HOME_CARD_TEXT,
  },
  langChipTextSelected: {
    color: ThemeColor.BRAND,
  },
  chatPlaceholder: {
    height: 180,
    borderRadius: ThemeRadius.MD,
    borderWidth: 2,
    borderColor: ThemeColor.BRAND,
    borderStyle: 'dashed',
    backgroundColor: ThemeColor.WHITE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  chatText: {
    color: ThemeColor.HOME_CHAT_MUTED,
    fontStyle: 'italic',
  },
  card: {
    backgroundColor: ThemeColor.WHITE,
    borderTopColor: ThemeColor.BRAND,
    borderTopWidth: 4,
    borderRadius: ThemeRadius.SM,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    color: ThemeColor.BRAND,
    fontWeight: '700',
    fontSize: 18,
    marginBottom: 4,
  },
  cardText: {
    color: ThemeColor.HOME_CARD_TEXT,
    lineHeight: 20,
  },
});
