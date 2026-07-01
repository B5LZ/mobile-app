import { useCallback } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLanguage } from '../context/LanguageContext';
import { ThemeColor, ThemeRadius } from '../theme/appTheme';

export default function SettingsScreen({ navigation }) {
  const { locale, setLocale, t } = useLanguage();

  const showComingSoon = useCallback(() => {
    Alert.alert(t('settings'), t('settingsComingSoon'));
  }, [t]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← {t('back')}</Text>
        </Pressable>
        <Text style={styles.title}>{t('settings')}</Text>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>{t('languageHeading')}</Text>
          <View style={styles.langRow}>
            <Pressable
              style={[styles.langBtn, locale === 'en' && styles.langBtnActive]}
              onPress={() => void setLocale('en')}
            >
              <Text style={[styles.langBtnText, locale === 'en' && styles.langBtnTextActive]}>
                {t('langEnglish')}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.langBtn, locale === 'ko' && styles.langBtnActive]}
              onPress={() => void setLocale('ko')}
            >
              <Text style={[styles.langBtnText, locale === 'ko' && styles.langBtnTextActive]}>
                {t('langKorean')}
              </Text>
            </Pressable>
          </View>
        </View>

        <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]} onPress={showComingSoon}>
          <Text style={styles.cardText}>{t('cardSettingsText')}</Text>
        </Pressable>
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
  container: { padding: 20, maxWidth: 480, width: '100%', alignSelf: 'center', gap: 12 },
  backBtn: { marginBottom: 4 },
  backText: { fontSize: 16, fontWeight: '700', color: ThemeColor.BRAND },
  title: { fontSize: 26, fontWeight: '700', color: ThemeColor.BRAND, marginBottom: 8 },
  card: {
    backgroundColor: ThemeColor.WHITE,
    borderRadius: ThemeRadius.MD,
    borderWidth: 1,
    borderColor: ThemeColor.INPUT_BORDER_SOFT,
    padding: 16,
    ...cardShadow,
  },
  cardPressed: { opacity: 0.85 },
  cardText: { fontSize: 15, lineHeight: 22, color: ThemeColor.HOME_CARD_TEXT },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: ThemeColor.HOME_SUBTITLE, marginBottom: 10 },
  langRow: { flexDirection: 'row', gap: 10 },
  langBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: ThemeRadius.SM,
    borderWidth: 1.5,
    borderColor: ThemeColor.INPUT_BORDER,
    alignItems: 'center',
  },
  langBtnActive: { backgroundColor: ThemeColor.BRAND, borderColor: ThemeColor.BRAND },
  langBtnText: { fontSize: 15, fontWeight: '700', color: ThemeColor.BRAND },
  langBtnTextActive: { color: ThemeColor.WHITE },
});
