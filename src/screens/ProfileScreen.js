import { useCallback, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebaseConfig';
import { ThemeColor, ThemeRadius } from '../theme/appTheme';
import { useLanguage } from '../context/LanguageContext';

function ProfileButton({ label, onPress, isDanger, showArrow = true }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="button"
    >
      <View style={styles.cardInner}>
        <Text style={[styles.cardText, isDanger && styles.dangerText]}>{label}</Text>
        {showArrow ? <Text style={styles.arrow}>›</Text> : null}
      </View>
    </Pressable>
  );
}

export default function ProfileScreen({ navigation }) {
  const { locale, setLocale, t } = useLanguage();
  const [logoutVisible, setLogoutVisible] = useState(false);

  const handleLogout = useCallback(async () => {
    setLogoutVisible(false);
    try {
      await signOut(auth);
    } catch {
      // Auth listener in App.js switches to SignIn/SignUp.
    }
  }, []);

  const goTo = (screen) => {
    navigation.navigate(screen);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{t('profileTitle') || 'Profile'}</Text>

        <View style={styles.languageCard}>
          <Text style={styles.sectionLabel}>{t('languageHeading')}</Text>
          <View style={styles.langRow}>
            <Pressable
              style={[styles.langBtn, locale === 'en' && styles.langBtnActive]}
              onPress={() => void setLocale('en')}
              accessibilityRole="button"
              accessibilityState={{ selected: locale === 'en' }}
            >
              <Text style={[styles.langBtnText, locale === 'en' && styles.langBtnTextActive]}>
                {t('langEnglish')}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.langBtn, locale === 'ko' && styles.langBtnActive]}
              onPress={() => void setLocale('ko')}
              accessibilityRole="button"
              accessibilityState={{ selected: locale === 'ko' }}
            >
              <Text style={[styles.langBtnText, locale === 'ko' && styles.langBtnTextActive]}>
                {t('langKorean')}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <ProfileButton
            label={t('myStatsMenuLabel')}
            onPress={() => goTo('MyStats')}
          />
          <ProfileButton
            label={t('personalInformation')}
            onPress={() => goTo('PersonalInfo')}
          />
          <ProfileButton label={t('settings')} onPress={() => goTo('Settings')} />
          <ProfileButton label={t('support')} onPress={() => goTo('Support')} />
          <ProfileButton
            label={t('logOut')}
            onPress={() => setLogoutVisible(true)}
            isDanger
            showArrow={false}
          />
        </View>
      </ScrollView>

      <Modal
        visible={logoutVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLogoutVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('logoutConfirmTitle')}</Text>
            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [styles.modalBtnNo, pressed && styles.cardPressed]}
                onPress={() => setLogoutVisible(false)}
                accessibilityRole="button"
              >
                <Text style={styles.modalBtnNoText}>{t('logoutConfirmNo')}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.modalBtnYes, pressed && styles.cardPressed]}
                onPress={() => void handleLogout()}
                accessibilityRole="button"
              >
                <Text style={styles.modalBtnYesText}>{t('logoutConfirmYes')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingBottom: 32,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: ThemeColor.BRAND,
    marginBottom: 16,
  },
  languageCard: {
    backgroundColor: ThemeColor.WHITE,
    borderRadius: ThemeRadius.MD,
    borderWidth: 1,
    borderColor: ThemeColor.INPUT_BORDER_SOFT,
    padding: 16,
    marginBottom: 16,
    ...cardShadow,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: ThemeColor.HOME_CARD_TEXT,
    marginBottom: 10,
  },
  langRow: { flexDirection: 'row', gap: 10 },
  langBtn: {
    flex: 1,
    paddingVertical: 14,
    minHeight: 52,
    borderRadius: ThemeRadius.SM,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    backgroundColor: '#e8edf2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  langBtnActive: {
    backgroundColor: ThemeColor.BRAND,
    borderColor: ThemeColor.BRAND,
  },
  langBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: ThemeColor.TEXT_PRIMARY,
  },
  langBtnTextActive: { color: ThemeColor.WHITE },
  section: {
    gap: 12,
  },
  card: {
    width: '100%',
    minHeight: 80,
    borderRadius: ThemeRadius.MD,
    backgroundColor: ThemeColor.WHITE,
    borderWidth: 1,
    borderColor: ThemeColor.INPUT_BORDER_SOFT,
    justifyContent: 'center',
    paddingHorizontal: 16,
    ...cardShadow,
  },
  cardInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardText: {
    fontSize: 18,
    fontWeight: '600',
    color: ThemeColor.HOME_CARD_TEXT,
  },
  dangerText: {
    color: '#b91c1c',
  },
  arrow: {
    fontSize: 22,
    color: ThemeColor.HOME_CARD_TEXT,
  },
  cardPressed: {
    opacity: 0.85,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: ThemeColor.WHITE,
    borderRadius: 20,
    padding: 24,
    gap: 24,
    ...cardShadow,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: ThemeColor.TEXT_PRIMARY,
    textAlign: 'center',
    lineHeight: 30,
  },
  modalActions: {
    gap: 12,
  },
  modalBtnNo: {
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: '#e8edf2',
    borderWidth: 2,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalBtnNoText: {
    fontSize: 18,
    fontWeight: '800',
    color: ThemeColor.TEXT_PRIMARY,
    textAlign: 'center',
  },
  modalBtnYes: {
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: '#b91c1c',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalBtnYesText: {
    fontSize: 18,
    fontWeight: '800',
    color: ThemeColor.WHITE,
    textAlign: 'center',
  },
});
