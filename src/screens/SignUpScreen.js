import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ThemeColor, ThemeGradient, ThemeRadius } from '../theme/appTheme';
import { auth, db } from '../config/firebaseConfig';
import { useLanguage } from '../context/LanguageContext';
import { KOREAN_NATIVE_LABEL } from '../i18n/labels';
import { STRINGS } from '../i18n/strings';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function SignUpScreen({ navigation }) {
  const { hydrateLocale, locale } = useLanguage();
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [dobDate, setDobDate] = useState(new Date(2000, 0, 1));
  const [showPicker, setShowPicker] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [languagePreference, setLanguagePreference] = useState(
    /** @type {'en' | 'ko'} */ (locale),
  );

  const copy = STRINGS[languagePreference];

  const setLanguage = (/** @type {'en' | 'ko'} */ code) => {
    setLanguagePreference(code);
    hydrateLocale(code);
  };

  const onDateChange = (event, selectedDate) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (event.type === 'dismissed') return;
    if (selectedDate) {
      setDobDate(selectedDate);
      setDob(formatDate(selectedDate));
    }
  };

  const handleSignUp = async () => {
    if (!name || !dob || !email || !password || !confirmPassword) {
      Alert.alert(copy.errorTitle, copy.errorFillAll);
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert(copy.errorTitle, 'Passwords do not match. Please try again.');
      return;
    }

    if (password.length < 8) {
      Alert.alert(copy.errorTitle, 'Password should be at least 8 characters long.');
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );
      const user = userCredential.user;

      await setDoc(doc(db, 'users', user.uid), {
        fullName: name,
        email,
        dateOfBirth: dob,
        languagePreference,
        createdAt: new Date(),
        totalSessionTime: 0,
      });

      hydrateLocale(languagePreference);
      navigation.replace('Home');
    } catch (error) {
      let errorMessage = error.message;
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = copy.emailInUse;
      }
      Alert.alert(copy.signUpFailed, errorMessage);
    }
  };

  return (
    <LinearGradient
      colors={[...ThemeGradient.SIGN_IN_BACKDROP]}
      locations={[0, 0.55, 1]}
      style={styles.screenGradient}
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={28} color={ThemeColor.BRAND} />
          </Pressable>
          <Pressable
            onPress={() => setLanguage(languagePreference === 'en' ? 'ko' : 'en')}
            style={({ pressed }) => [
              styles.langCornerBtn,
              pressed && styles.langCornerBtnPressed,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.langCornerText}>
              {languagePreference === 'en' ? KOREAN_NATIVE_LABEL : 'English'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.layout}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.content}>
            <Text style={styles.title}>{copy.createAccountTitle}</Text>
            <Text style={styles.subtitle}>{copy.signInSubtitle ?? 'Join your mindfulness journey'}</Text>

            <View style={styles.fieldGroup}>

              {/* Full Name */}
              <View style={styles.inputShell}>
                <Ionicons name="person-outline" size={20} color={ThemeColor.TEXT_MUTED} style={styles.inputIcon} />
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder={copy.fullName}
                  placeholderTextColor={ThemeColor.PLACEHOLDER}
                  autoCapitalize="words"
                  style={styles.inputInner}
                />
              </View>

              {/* Date of Birth — tappable field */}
              <Pressable
                onPress={() => setShowPicker(true)}
                style={styles.inputShell}
              >
                <Ionicons name="calendar-outline" size={20} color={ThemeColor.TEXT_MUTED} style={styles.inputIcon} />
                <Text style={[styles.inputInner, !dob && { color: ThemeColor.PLACEHOLDER }]}>
                  {dob || 'Date of birth'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={ThemeColor.TEXT_MUTED} />
              </Pressable>

              {/* iOS: inline spinner picker */}
              {showPicker && Platform.OS === 'ios' && (
                <View style={styles.iosPickerWrapper}>
                  <DateTimePicker
                    value={dobDate}
                    mode="date"
                    display="spinner"
                    maximumDate={new Date()}
                    onChange={onDateChange}
                    style={styles.iosPicker}
                  />
                  <Pressable
                    onPress={() => setShowPicker(false)}
                    style={styles.iosPickerDone}
                  >
                    <Text style={styles.iosPickerDoneText}>Done</Text>
                  </Pressable>
                </View>
              )}

              {/* Android: system date picker dialog */}
              {showPicker && Platform.OS === 'android' && (
                <DateTimePicker
                  value={dobDate}
                  mode="date"
                  display="default"
                  maximumDate={new Date()}
                  onChange={onDateChange}
                />
              )}

              {/* Email */}
              <View style={styles.inputShell}>
                <Ionicons name="mail-outline" size={20} color={ThemeColor.TEXT_MUTED} style={styles.inputIcon} />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder={copy.email}
                  placeholderTextColor={ThemeColor.PLACEHOLDER}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                  style={styles.inputInner}
                />
              </View>

              {/* Password */}
              <View style={styles.inputShell}>
                <Ionicons name="lock-closed-outline" size={20} color={ThemeColor.TEXT_MUTED} style={styles.inputIcon} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder={copy.password}
                  placeholderTextColor={ThemeColor.PLACEHOLDER}
                  secureTextEntry
                  style={styles.inputInner}
                />
              </View>

              {/* Confirm Password */}
              <View style={styles.inputShell}>
                <Ionicons name="lock-closed-outline" size={20} color={ThemeColor.TEXT_MUTED} style={styles.inputIcon} />
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm password"
                  placeholderTextColor={ThemeColor.PLACEHOLDER}
                  secureTextEntry
                  style={styles.inputInner}
                />
              </View>
            </View>

            {/* Language selector */}
            <Text style={styles.fieldLabel}>{copy.languageLabel}</Text>
            <View style={styles.langRow}>
              <Pressable
                onPress={() => setLanguage('en')}
                style={({ pressed }) => [
                  styles.langChip,
                  languagePreference === 'en' && styles.langChipSelected,
                  pressed && styles.langChipPressed,
                ]}
              >
                <Text style={[styles.langChipText, languagePreference === 'en' && styles.langChipTextSelected]}>
                  {copy.langEnglish}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setLanguage('ko')}
                style={({ pressed }) => [
                  styles.langChip,
                  languagePreference === 'ko' && styles.langChipSelected,
                  pressed && styles.langChipPressed,
                ]}
              >
                <Text style={[styles.langChipText, languagePreference === 'ko' && styles.langChipTextSelected]}>
                  {KOREAN_NATIVE_LABEL}
                </Text>
              </Pressable>
            </View>

            {/* Create Account Button */}
            <View style={styles.buttonShadow}>
              <Pressable
                onPress={handleSignUp}
                style={({ pressed }) => [
                  styles.buttonPressable,
                  pressed && styles.buttonPressed,
                ]}
              >
                <LinearGradient
                  colors={[...ThemeGradient.PRIMARY_CTA]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.buttonGradient}
                >
                  <View style={styles.buttonInner}>
                    <Text style={styles.primaryButtonText}>{copy.createAccountButton}</Text>
                    <View style={styles.buttonChevron}>
                      <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.95)" />
                    </View>
                  </View>
                </LinearGradient>
              </Pressable>
            </View>

            {/* Sign in link */}
            <Pressable
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [styles.signInRow, pressed && styles.signInPressed]}
            >
              <Ionicons name="log-in-outline" size={18} color={ThemeColor.BRAND} style={styles.signInIcon} />
              <Text style={styles.link}>{copy.alreadyHaveAccount}</Text>
            </Pressable>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screenGradient: { flex: 1 },
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 2,
    paddingBottom: 8,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  backBtn: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  backBtnPressed: { opacity: 0.7 },
  langCornerBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: ThemeRadius.SM,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.25)',
  },
  langCornerBtnPressed: { opacity: 0.82 },
  langCornerText: { fontSize: 15, fontWeight: '700', color: ThemeColor.BRAND },
  layout: { flex: 1, maxWidth: 440, width: '100%', alignSelf: 'center' },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 24 },
  content: {
    paddingHorizontal: 28,
    paddingTop: 8,
    paddingBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: ThemeColor.BRAND,
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: ThemeColor.TEXT_MUTED,
    textAlign: 'center',
    marginBottom: 24,
  },
  fieldGroup: { marginBottom: 8 },
  inputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ThemeColor.INPUT_BG,
    borderWidth: 1,
    borderColor: ThemeColor.INPUT_BORDER,
    borderRadius: ThemeRadius.SM,
    paddingHorizontal: 14,
    minHeight: 52,
    marginBottom: 14,
  },
  inputIcon: { marginRight: 12 },
  inputInner: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    fontSize: 16,
    color: ThemeColor.TEXT_PRIMARY,
    fontWeight: '400',
  },
  iosPickerWrapper: {
    backgroundColor: ThemeColor.INPUT_BG,
    borderWidth: 1,
    borderColor: ThemeColor.INPUT_BORDER,
    borderRadius: ThemeRadius.SM,
    marginBottom: 14,
    overflow: 'hidden',
  },
  iosPicker: {
    width: '100%',
  },
  iosPickerDone: {
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: ThemeColor.INPUT_BORDER,
  },
  iosPickerDoneText: {
    fontSize: 15,
    fontWeight: '600',
    color: ThemeColor.BRAND,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: ThemeColor.HOME_CARD_TEXT,
    marginBottom: 8,
    marginTop: 4,
  },
  langRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  langChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: ThemeRadius.SM,
    borderWidth: 1,
    borderColor: ThemeColor.INPUT_BORDER,
    backgroundColor: ThemeColor.INPUT_BG,
    alignItems: 'center',
  },
  langChipSelected: {
    borderColor: ThemeColor.BRAND,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
  },
  langChipPressed: { opacity: 0.85 },
  langChipText: { fontSize: 15, fontWeight: '600', color: ThemeColor.TEXT_MUTED },
  langChipTextSelected: { color: ThemeColor.BRAND },
  buttonShadow: {
    marginBottom: 20,
    borderRadius: ThemeRadius.SM,
    ...Platform.select({
      ios: {
        shadowColor: ThemeColor.SHADOW_SLATE,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 14,
      },
      android: { elevation: 6 },
    }),
  },
  buttonPressable: { borderRadius: ThemeRadius.SM, overflow: 'hidden' },
  buttonPressed: { opacity: 0.92 },
  buttonGradient: { borderRadius: ThemeRadius.SM },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    position: 'relative',
  },
  primaryButtonText: { color: ThemeColor.WHITE, fontWeight: '600', fontSize: 16, letterSpacing: 0.2 },
  buttonChevron: { position: 'absolute', right: 16 },
  signInRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  signInIcon: { marginRight: 8 },
  signInPressed: { opacity: 0.65 },
  link: { color: ThemeColor.BRAND, fontWeight: '600', fontSize: 15 },
});
