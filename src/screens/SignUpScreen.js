import { useLayoutEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Alert,
  Platform,
  Modal,
  TouchableWithoutFeedback,
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
  // Tracks a pending date on Android before the user confirms
  const [pendingDate, setPendingDate] = useState(new Date(2000, 0, 1));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [languagePreference, setLanguagePreference] = useState(
    /** @type {'en' | 'ko'} */ (locale),
  );

  const copy = STRINGS[languagePreference];

  useLayoutEffect(() => {
    const c = STRINGS[languagePreference];
    navigation.setOptions({
      title: c.signUpHeader,
      headerBackTitle: c.signInButton,
    });
  }, [navigation, languagePreference]);

  const setLanguage = (/** @type {'en' | 'ko'} */ code) => {
    setLanguagePreference(code);
    hydrateLocale(code);
  };

  // ─── Date change handlers ──────────────────────────────────────────────────

  /**
   * iOS: every scroll fires this. We commit immediately because the
   * inline spinner always shows a "Done" button to close.
   */
  const onDateChangeIOS = (event, selectedDate) => {
    if (event.type === 'dismissed') {
      setShowPicker(false);
      return;
    }
    if (selectedDate) {
      setDobDate(selectedDate);
      setDob(formatDate(selectedDate));
    }
  };

  /**
   * Android: the system dialog fires one event when the user taps OK or
   * Cancel. We commit the date only on 'set'; on 'dismissed' we discard.
   */
  const onDateChangeAndroid = (event, selectedDate) => {
    setShowPicker(false); // always close the dialog
    if (event.type === 'dismissed') return;
    if (selectedDate) {
      setDobDate(selectedDate);
      setDob(formatDate(selectedDate));
    }
  };

  // ─── Sign-up logic ─────────────────────────────────────────────────────────

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

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <LinearGradient
      colors={[...ThemeGradient.SIGN_IN_BACKDROP]}
      locations={[0, 0.55, 1]}
      style={styles.screenGradient}
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Language toggle (top-right corner) */}
        <View style={styles.langCorner}>
          <Pressable
            onPress={() =>
              setLanguage(languagePreference === 'en' ? 'ko' : 'en')
            }
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
          <View style={styles.content}>
            <Text style={styles.title}>{copy.createAccountTitle}</Text>
            <Text style={styles.subtitle}>
              {copy.signInSubtitle ?? 'Join your mindfulness journey'}
            </Text>

            <View style={styles.fieldGroup}>
              {/* Full Name */}
              <View style={styles.inputShell}>
                <Ionicons
                  name="person-outline"
                  size={20}
                  color={ThemeColor.TEXT_MUTED}
                  style={styles.inputIcon}
                />
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder={copy.fullName}
                  placeholderTextColor={ThemeColor.PLACEHOLDER}
                  autoCapitalize="words"
                  style={styles.inputInner}
                />
              </View>

              {/* Date of Birth — tappable field, works on all platforms */}
              <Pressable
                onPress={() => setShowPicker(true)}
                style={styles.inputShell}
                accessibilityRole="button"
                accessibilityLabel={dob || 'Select date of birth'}
              >
                <Ionicons
                  name="calendar-outline"
                  size={20}
                  color={ThemeColor.TEXT_MUTED}
                  style={styles.inputIcon}
                />
                <Text
                  style={[
                    styles.inputInner,
                    !dob && { color: ThemeColor.PLACEHOLDER },
                  ]}
                >
                  {dob || (copy.dateOfBirth ?? 'Date of birth')}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={16}
                  color={ThemeColor.TEXT_MUTED}
                />
              </Pressable>

              {/*
               * iOS — rendered inside a Modal so it floats above the keyboard
               * and any ScrollView. The spinner fires onChange on every scroll
               * so the date is always up-to-date when the user taps Done.
               */}
              {Platform.OS === 'ios' && (
                <Modal
                  visible={showPicker}
                  transparent
                  animationType="slide"
                  onRequestClose={() => setShowPicker(false)}
                >
                  <TouchableWithoutFeedback onPress={() => setShowPicker(false)}>
                    <View style={styles.modalBackdrop} />
                  </TouchableWithoutFeedback>
                  <View style={styles.iosPickerSheet}>
                    <View style={styles.iosPickerHandle} />
                    <View style={styles.iosPickerToolbar}>
                      <Text style={styles.iosPickerTitle}>
                        {copy.dateOfBirth ?? 'Date of birth'}
                      </Text>
                      <Pressable
                        onPress={() => setShowPicker(false)}
                        hitSlop={12}
                      >
                        <Text style={styles.iosPickerDoneText}>
                          {copy.done ?? 'Done'}
                        </Text>
                      </Pressable>
                    </View>
                    <DateTimePicker
                      value={dobDate}
                      mode="date"
                      display="spinner"
                      maximumDate={new Date()}
                      onChange={onDateChangeIOS}
                      themeVariant="light"
                    />
                  </View>
                </Modal>
              )}

              {/*
               * Android — @react-native-community/datetimepicker renders the
               * native system dialog when mounted; we unmount it after the
               * user confirms or cancels (handled in onDateChangeAndroid).
               */}
              {Platform.OS === 'android' && showPicker && (
                <DateTimePicker
                  value={dobDate}
                  mode="date"
                  display="default"      // native calendar dialog
                  maximumDate={new Date()}
                  onChange={onDateChangeAndroid}
                />
              )}

              {/* Email */}
              <View style={styles.inputShell}>
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color={ThemeColor.TEXT_MUTED}
                  style={styles.inputIcon}
                />
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
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={ThemeColor.TEXT_MUTED}
                  style={styles.inputIcon}
                />
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
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={ThemeColor.TEXT_MUTED}
                  style={styles.inputIcon}
                />
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder={copy.confirmPassword ?? 'Confirm password'}
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
                <Text
                  style={[
                    styles.langChipText,
                    languagePreference === 'en' && styles.langChipTextSelected,
                  ]}
                >
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
                <Text
                  style={[
                    styles.langChipText,
                    languagePreference === 'ko' && styles.langChipTextSelected,
                  ]}
                >
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
                    <Text style={styles.primaryButtonText}>
                      {copy.createAccountButton}
                    </Text>
                    <View style={styles.buttonChevron}>
                      <Ionicons
                        name="chevron-forward"
                        size={22}
                        color="rgba(255,255,255,0.95)"
                      />
                    </View>
                  </View>
                </LinearGradient>
              </Pressable>
            </View>

            {/* Sign-in link */}
            <Pressable
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [
                styles.signInRow,
                pressed && styles.signInPressed,
              ]}
            >
              <Ionicons
                name="log-in-outline"
                size={18}
                color={ThemeColor.BRAND}
                style={styles.signInIcon}
              />
              <Text style={styles.link}>{copy.alreadyHaveAccount}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screenGradient: { flex: 1 },
  safe: { flex: 1 },

  langCorner: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 2,
    paddingBottom: 4,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
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
  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 8,
    paddingBottom: 16,
    justifyContent: 'flex-start',
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

  // ── iOS bottom-sheet picker ──────────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  iosPickerSheet: {
    backgroundColor: ThemeColor.INPUT_BG ?? '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 28,
    // subtle shadow on top edge
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  iosPickerHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  iosPickerToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: ThemeColor.INPUT_BORDER ?? '#E5E7EB',
  },
  iosPickerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: ThemeColor.TEXT_PRIMARY ?? '#111',
  },
  iosPickerDoneText: {
    fontSize: 16,
    fontWeight: '700',
    color: ThemeColor.BRAND,
  },
  iosPicker: {
    width: '100%',
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
  primaryButtonText: {
    color: ThemeColor.WHITE,
    fontWeight: '600',
    fontSize: 16,
    letterSpacing: 0.2,
  },
  buttonChevron: { position: 'absolute', right: 16 },

  signInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  signInIcon: { marginRight: 8 },
  signInPressed: { opacity: 0.65 },
  link: { color: ThemeColor.BRAND, fontWeight: '600', fontSize: 15 },
});