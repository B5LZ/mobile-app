import { useLayoutEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Alert,
} from 'react-native';
import { ThemeColor, ThemeRadius } from '../theme/appTheme';
import { auth, db } from '../config/firebaseConfig';
import { useLanguage } from '../context/LanguageContext';
import { KOREAN_NATIVE_LABEL } from '../i18n/labels';
import { STRINGS } from '../i18n/strings';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

export default function SignUpScreen({ navigation }) {
  const { hydrateLocale, locale } = useLanguage();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

  const handleSignUp = async () => {
    if (!email || !password || !name) {
      Alert.alert(copy.errorTitle, copy.errorFillAll);
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
    <View style={styles.container}>
      <Text style={styles.title}>{copy.createAccountTitle}</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={copy.fullName}
        style={styles.input}
      />
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder={copy.email}
        autoCapitalize="none"
        keyboardType="email-address"
        style={styles.input}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder={copy.password}
        secureTextEntry
        style={styles.input}
      />

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

      <Pressable style={styles.primaryButton} onPress={handleSignUp}>
        <Text style={styles.primaryButtonText}>{copy.createAccountButton}</Text>
      </Pressable>
      <Pressable onPress={() => navigation.goBack()}>
        <Text style={styles.link}>{copy.alreadyHaveAccount}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: ThemeColor.SCREEN_BG,
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: ThemeColor.BRAND,
    marginBottom: 18,
  },
  fieldLabel: {
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
  input: {
    backgroundColor: ThemeColor.WHITE,
    borderColor: ThemeColor.INPUT_BORDER_SOFT,
    borderWidth: 1,
    borderRadius: ThemeRadius.SM,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: ThemeColor.BRAND,
    borderRadius: ThemeRadius.SM,
    paddingVertical: 13,
    marginTop: 6,
    marginBottom: 12,
  },
  primaryButtonText: {
    color: ThemeColor.WHITE,
    fontWeight: '700',
    textAlign: 'center',
  },
  link: {
    color: ThemeColor.BRAND,
    fontWeight: '600',
    textAlign: 'center',
  },
});
