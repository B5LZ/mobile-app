import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Alert,
  Image,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../config/firebaseConfig';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { ThemeColor, ThemeGradient, ThemeRadius } from '../theme/appTheme';

/** Kept for any link styles; avoids ReferenceError if Metro serves a stale bundle. */
const SIGN_IN_LINK_BLUE = '#2563eb';

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

export default function SignInScreen({ navigation }) {
  const { width: windowWidth } = useWindowDimensions();
  const logoSize = Math.round(clamp(windowWidth * 0.572, 154, 242));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password.');
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigation.navigate('Home');
    } catch (error) {
      Alert.alert(
        'Sign In Failed',
        'Invalid email or password. Please try again.',
      );
    }
  };

  return (
    <LinearGradient
      colors={[...ThemeGradient.SIGN_IN_BACKDROP]}
      locations={[0, 0.55, 1]}
      style={styles.screenGradient}
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.layout}>
          <View style={styles.content}>
            <View style={styles.logoSlot}>
              <Image
                source={require('../../assets/multi-lang-wellness.png')}
                style={{ width: logoSize, height: logoSize }}
                resizeMode="contain"
              />
            </View>

            <Text style={styles.title}>Welcome</Text>
            <Text style={styles.subtitle}>Sign in to continue</Text>

            <View style={styles.fieldGroup}>
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
                  placeholder="Email"
                  placeholderTextColor={ThemeColor.PLACEHOLDER}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                  style={styles.inputInner}
                />
              </View>

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
                  placeholder="Password"
                  placeholderTextColor={ThemeColor.PLACEHOLDER}
                  secureTextEntry
                  style={styles.inputInner}
                />
              </View>
            </View>

            <View style={styles.buttonShadow}>
              <Pressable
                onPress={handleSignIn}
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
                    <Text style={styles.primaryButtonText}>Sign In</Text>
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

            <Pressable
              onPress={() => navigation.navigate('SignUp')}
              style={({ pressed }) => [
                styles.signUpRow,
                pressed && styles.signUpPressed,
              ]}
            >
              <Ionicons
                name="person-add-outline"
                size={18}
                color={ThemeColor.BRAND}
                style={styles.signUpIcon}
              />
              <Text style={styles.link}>Need an account? Sign up</Text>
            </Pressable>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Internal preview — University of Massachusetts Boston. Not for public
              distribution.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screenGradient: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  layout: {
    flex: 1,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 4,
    paddingBottom: 16,
    justifyContent: 'flex-start',
    width: '100%',
  },
  logoSlot: {
    alignSelf: 'center',
    marginBottom: 20,
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 6,
    paddingTop: 8,
  },
  footerText: {
    fontSize: 10,
    lineHeight: 14,
    color: ThemeColor.FOOTER_MUTED,
    textAlign: 'center',
    fontWeight: '400',
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: ThemeColor.BRAND,
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '400',
    color: ThemeColor.TEXT_MUTED,
    textAlign: 'center',
    marginBottom: 32,
  },
  fieldGroup: {
    marginBottom: 8,
  },
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
  inputIcon: {
    marginRight: 12,
  },
  inputInner: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    fontSize: 16,
    color: ThemeColor.TEXT_PRIMARY,
    fontWeight: '400',
  },
  buttonShadow: {
    marginTop: 10,
    marginBottom: 28,
    borderRadius: ThemeRadius.SM,
    ...Platform.select({
      ios: {
        shadowColor: ThemeColor.SHADOW_SLATE,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 14,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  buttonPressable: {
    borderRadius: ThemeRadius.SM,
    overflow: 'hidden',
  },
  buttonPressed: {
    opacity: 0.92,
  },
  buttonGradient: {
    borderRadius: ThemeRadius.SM,
  },
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
  buttonChevron: {
    position: 'absolute',
    right: 16,
  },
  signUpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  signUpIcon: {
    marginRight: 8,
  },
  signUpPressed: {
    opacity: 0.65,
  },
  link: {
    color: ThemeColor.BRAND,
    fontWeight: '600',
    fontSize: 15,
  },
});
