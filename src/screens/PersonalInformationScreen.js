import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { updateEmail, updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebaseConfig';
import { useLanguage } from '../context/LanguageContext';
import { KOREAN_NATIVE_LABEL } from '../i18n/labels';
import { ThemeColor, ThemeRadius } from '../theme/appTheme';

function snapshotExists(snap) {
  return typeof snap.exists === 'function' ? snap.exists() : Boolean(snap.exists);
}

function resolveNameFields(data, user) {
  let first = typeof data?.firstName === 'string' ? data.firstName.trim() : '';
  let last = typeof data?.lastName === 'string' ? data.lastName.trim() : '';
  if (!first && !last) {
    const full = (
      (typeof data?.fullName === 'string' ? data.fullName : '') ||
      user?.displayName ||
      ''
    ).trim();
    if (full) {
      const parts = full.split(/\s+/);
      first = parts[0] || '';
      last = parts.slice(1).join(' ') || '';
    }
  }
  return { first, last };
}

export default function PersonalInformationScreen({ navigation }) {
  const { t, setLocale } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [languagePreference, setLanguagePreference] = useState(
    /** @type {'en' | 'ko'} */ ('en'),
  );

  const loadProfile = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      const data = snapshotExists(snap) ? snap.data() : {};
      const { first, last } = resolveNameFields(data, user);
      setFirstName(first);
      setLastName(last);
      setEmail(
        (typeof data.email === 'string' && data.email.trim()) ||
          user.email ||
          '',
      );
      const pref = data.languagePreference;
      setLanguagePreference(pref === 'ko' ? 'ko' : 'en');
    } catch {
      const { first, last } = resolveNameFields({}, user);
      setFirstName(first);
      setLastName(last);
      setEmail(user.email || '');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile]),
  );

  const handleSave = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedFirst || !trimmedLast || !trimmedEmail) {
      Alert.alert(t('errorTitle'), t('errorFillAll'));
      return;
    }

    setSaving(true);
    const fullName = `${trimmedFirst} ${trimmedLast}`.trim();

    try {
      await setDoc(
        doc(db, 'users', user.uid),
        {
          firstName: trimmedFirst,
          lastName: trimmedLast,
          fullName,
          email: trimmedEmail,
          languagePreference,
        },
        { merge: true },
      );

      await updateProfile(user, { displayName: fullName });

      if (trimmedEmail !== (user.email || '')) {
        try {
          await updateEmail(user, trimmedEmail);
        } catch {
          Alert.alert(t('personalInfoEmailNotUpdatedTitle'), t('personalInfoEmailNotUpdatedBody'));
        }
      }

      await setLocale(languagePreference);
      Alert.alert(t('personalInfoSavedTitle'), t('personalInfoSavedBody'));
      navigation.goBack();
    } catch (error) {
      const isPermission =
        error?.code === 'permission-denied' ||
        /missing or insufficient permissions/i.test(String(error?.message || ''));
      Alert.alert(
        t('personalInfoSaveFailedTitle'),
        isPermission
          ? t('signUpFirestorePermissionDenied')
          : error?.message || t('personalInfoSaveFailedBody'),
      );
    } finally {
      setSaving(false);
    }
  }, [
    firstName,
    lastName,
    email,
    languagePreference,
    navigation,
    setLocale,
    t,
  ]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel={t('personalInfoBack')}
        >
          <Ionicons name="chevron-back" size={22} color={ThemeColor.BRAND} />
          <Text style={styles.backBtnText}>{t('personalInfoBack')}</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={ThemeColor.BRAND} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>{t('personalInformation')}</Text>

          <Text style={styles.label}>{t('firstName')}</Text>
          <View style={styles.inputShell}>
            <TextInput
              value={firstName}
              onChangeText={setFirstName}
              placeholderTextColor={ThemeColor.PLACEHOLDER}
              autoCapitalize="words"
              autoCorrect={false}
              style={styles.inputInner}
            />
          </View>

          <Text style={styles.label}>{t('lastName')}</Text>
          <View style={styles.inputShell}>
            <TextInput
              value={lastName}
              onChangeText={setLastName}
              placeholderTextColor={ThemeColor.PLACEHOLDER}
              autoCapitalize="words"
              autoCorrect={false}
              style={styles.inputInner}
            />
          </View>

          <Text style={styles.label}>{t('email')}</Text>
          <View style={styles.inputShell}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder={t('email')}
              placeholderTextColor={ThemeColor.PLACEHOLDER}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              style={styles.inputInner}
            />
          </View>

          <Text style={styles.label}>{t('languageLabel')}</Text>
          <View style={styles.langRow}>
            <Pressable
              onPress={() => setLanguagePreference('en')}
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
                {t('langEnglish')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setLanguagePreference('ko')}
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

          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveBtn,
              (pressed || saving) && styles.saveBtnPressed,
              saving && styles.saveBtnDisabled,
            ]}
          >
            <Text style={styles.saveBtnText}>
              {saving ? t('personalInfoSaving') : t('personalInfoSave')}
            </Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: ThemeColor.SCREEN_BG,
  },
  topBar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: ThemeColor.BRAND,
    backgroundColor: ThemeColor.WHITE,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  backBtnPressed: {
    opacity: 0.7,
  },
  backBtnText: {
    color: ThemeColor.BRAND,
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 2,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    padding: 20,
    paddingBottom: 40,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: ThemeColor.BRAND,
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: ThemeColor.TEXT_MUTED,
    marginBottom: 6,
    marginTop: 4,
  },
  inputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ThemeColor.WHITE,
    borderWidth: 1,
    borderColor: ThemeColor.INPUT_BORDER,
    borderRadius: ThemeRadius.SM,
    paddingHorizontal: 14,
    minHeight: 52,
    marginBottom: 12,
  },
  inputInner: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    fontSize: 16,
    color: ThemeColor.TEXT_PRIMARY,
  },
  langRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  langChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: ThemeRadius.SM,
    borderWidth: 1.5,
    borderColor: ThemeColor.INPUT_BORDER,
    backgroundColor: ThemeColor.WHITE,
    alignItems: 'center',
  },
  langChipSelected: {
    borderColor: ThemeColor.BRAND,
    backgroundColor: '#e8edf7',
  },
  langChipPressed: {
    opacity: 0.85,
  },
  langChipText: {
    fontSize: 15,
    fontWeight: '600',
    color: ThemeColor.TEXT_MUTED,
  },
  langChipTextSelected: {
    color: ThemeColor.BRAND,
    fontWeight: '700',
  },
  saveBtn: {
    backgroundColor: ThemeColor.BRAND,
    borderRadius: ThemeRadius.SM,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnPressed: {
    opacity: 0.9,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: ThemeColor.WHITE,
    fontSize: 16,
    fontWeight: '700',
  },
});
