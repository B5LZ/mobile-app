import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebaseConfig';
import { useLanguage } from '../context/LanguageContext';
import { KOREAN_NATIVE_LABEL } from '../i18n/labels';
import { ThemeColor, ThemeRadius } from '../theme/appTheme';

const SESSION_COUNT = 12;
const GRID_COLS = 2;
const GRID_ROWS = Math.ceil(SESSION_COUNT / GRID_COLS);

/** 1–12 distributed across 6 rows of 2. */
const SESSION_ROWS = Array.from({ length: GRID_ROWS }, (_, r) => {
  const start = r * GRID_COLS;
  return Array.from({ length: GRID_COLS }, (_, i) => start + i + 1).filter(
    (n) => n <= SESSION_COUNT,
  );
});

function getTodaysRecommendedSession() {
  const d = new Date();
  const dayKey =
    d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  return (dayKey % SESSION_COUNT) + 1;
}

function sessionLabel(t, n) {
  return `${t('homeSession')} ${n}`;
}

export default function HomeScreen({ navigation }) {
  const { locale, setLocale, t } = useLanguage();
  const [showAccountMenu, setShowAccountMenu] = useState(false);

  const todaysSession = useMemo(() => getTodaysRecommendedSession(), []);

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

  const handleSettings = useCallback(() => {
    setShowAccountMenu(false);
    Alert.alert(t('cardSettingsTitle'), 'Coming soon.');
  }, [t]);

  const toggleLanguage = useCallback(() => {
    void setLocale(locale === 'en' ? 'ko' : 'en');
  }, [locale, setLocale]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => sub.remove();
    }, []),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        {showAccountMenu && (
          <Pressable
            style={styles.topBarDismissLayer}
            onPress={() => setShowAccountMenu(false)}
            accessibilityRole="button"
            accessibilityLabel="Close account menu"
          />
        )}
        <View style={styles.accountWrap}>
          <Pressable
            onPress={() => setShowAccountMenu((v) => !v)}
            style={({ pressed }) => [styles.accountBtn, pressed && styles.topBtnPressed]}
            hitSlop={10}
          >
            <Ionicons name="person-circle-outline" size={34} color={ThemeColor.BRAND} />
          </Pressable>
          {showAccountMenu && (
            <View style={styles.accountMenu}>
              <Pressable
                onPress={handleSettings}
                style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              >
                <Text style={styles.menuItemText}>{t('cardSettingsTitle')}</Text>
              </Pressable>
              <Pressable
                onPress={handleLogout}
                style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              >
                <Text style={styles.menuItemText}>{t('logOut')}</Text>
              </Pressable>
            </View>
          )}
        </View>
        <Pressable
          onPress={toggleLanguage}
          disabled={showAccountMenu}
          style={({ pressed }) => [styles.langCornerBtn, pressed && styles.topBtnPressed]}
          accessibilityRole="button"
        >
          <Text style={styles.langCornerText}>
            {locale === 'en' ? KOREAN_NATIVE_LABEL : 'English'}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
        onTouchStart={() => {
          if (showAccountMenu) setShowAccountMenu(false);
        }}
        onScrollBeginDrag={() => setShowAccountMenu(false)}
      >
        <Text style={styles.title}>{t('homeTitle')}</Text>
        <Text style={styles.subtitle}>{t('homeSubtitle')}</Text>

        <View style={styles.featuredWrap}>
          <Text style={styles.featuredHeading}>{t('homeTodaysSession')}</Text>
          <Pressable
            style={({ pressed }) => [
              styles.featuredCard,
              pressed && styles.cardPressed,
            ]}
          >
            <View style={styles.featuredCardInner}>
              <Text style={styles.featuredLabel}>{sessionLabel(t, todaysSession)}</Text>
            </View>
          </Pressable>
        </View>

        <Text style={styles.gridSectionLabel}>{t('homeAllSessions')}</Text>
        <View style={styles.grid}>
          {SESSION_ROWS.map((row) => (
            <View key={row.join('-')} style={styles.gridRow}>
              {row.map((n) => (
                <Pressable
                  key={n}
                  style={({ pressed }) => [
                    styles.gridCell,
                    pressed && styles.cardPressed,
                  ]}
                >
                  <Text style={styles.gridCellNumber}>{n}</Text>
                  <Text style={styles.gridCellLabel} numberOfLines={1}>
                    {sessionLabel(t, n)}
                  </Text>
                </Pressable>
              ))}
            </View>
          ))}
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
  default: {},
});

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: ThemeColor.SCREEN_BG,
  },
  scroll: {
    flex: 1,
    backgroundColor: ThemeColor.SCREEN_BG,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 2,
    paddingBottom: 8,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
    zIndex: 30,
  },
  accountWrap: {
    position: 'relative',
    zIndex: 60,
  },
  accountBtn: {
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountMenu: {
    position: 'absolute',
    top: 44,
    left: 0,
    minWidth: 150,
    borderRadius: ThemeRadius.SM,
    backgroundColor: ThemeColor.WHITE,
    borderWidth: 1,
    borderColor: ThemeColor.INPUT_BORDER_SOFT,
    overflow: 'hidden',
    zIndex: 70,
    ...cardShadow,
  },
  topBarDismissLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
  },
  menuItem: {
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  menuItemPressed: {
    backgroundColor: 'rgba(31, 60, 136, 0.08)',
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: ThemeColor.HOME_CARD_TEXT,
  },
  langCornerBtn: {
    zIndex: 30,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: ThemeRadius.SM,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.25)',
  },
  langCornerText: {
    fontSize: 15,
    fontWeight: '700',
    color: ThemeColor.BRAND,
  },
  topBtnPressed: {
    opacity: 0.82,
  },
  container: {
    padding: 20,
    paddingBottom: 32,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
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
    marginBottom: 18,
  },
  featuredWrap: {
    width: '100%',
    marginBottom: 20,
  },
  featuredHeading: {
    fontSize: 14,
    fontWeight: '600',
    color: ThemeColor.HOME_CARD_TEXT,
    marginBottom: 10,
  },
  featuredCard: {
    width: '100%',
    minHeight: 152,
    borderRadius: ThemeRadius.MD,
    backgroundColor: ThemeColor.WHITE,
    borderWidth: 1,
    borderColor: ThemeColor.INPUT_BORDER_SOFT,
    overflow: 'hidden',
    ...cardShadow,
  },
  featuredCardInner: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featuredLabel: {
    fontSize: 22,
    fontWeight: '700',
    color: ThemeColor.BRAND,
  },
  gridSectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: ThemeColor.HOME_CARD_TEXT,
    marginBottom: 10,
  },
  grid: {
    width: '100%',
    gap: 10,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 10,
  },
  gridCell: {
    flex: 1,
    minHeight: 162,
    borderRadius: ThemeRadius.SM,
    backgroundColor: ThemeColor.WHITE,
    borderWidth: 1,
    borderColor: ThemeColor.INPUT_BORDER_SOFT,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    ...cardShadow,
  },
  gridCellNumber: {
    fontSize: 26,
    fontWeight: '700',
    color: ThemeColor.BRAND,
    marginBottom: 4,
  },
  gridCellLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: ThemeColor.HOME_CARD_TEXT,
    textAlign: 'center',
  },
  cardPressed: {
    opacity: 0.9,
  },
});
