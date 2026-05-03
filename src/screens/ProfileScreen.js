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
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebaseConfig';
import { ThemeColor, ThemeRadius } from '../theme/appTheme';
import { useLanguage } from '../context/LanguageContext';




export default function ProfileScreen({ navigation }) {
    function ProfileButton({ label, onPress, isDanger }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.cardInner}>
        <Text style={[styles.cardText, isDanger && styles.dangerText]}>
          {label}
        </Text>
        <Text style={styles.arrow}>›</Text>
      </View>
    </Pressable>
  );
}


  const { t } = useLanguage();

/* handles user logout*/
  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch {}
    navigation.reset({
      index: 0,
      routes: [{ name: 'SignIn' }],
    });
  }, [navigation]);


  const goTo = (screen) => {
    navigation.navigate(screen);
  };


  /*UI*/
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{t('profileTitle') || 'Profile'}</Text>

        <View style={styles.section}>
          <ProfileButton
            label={t('personalInformation')}
            onPress={() => goTo('PersonalInfo')}
          />
          <ProfileButton
            label={t('settings')}
            onPress={() => goTo('Settings')}
          />
          <ProfileButton
            label={t('support')}
            onPress={() => goTo('Support')}
          />
          <ProfileButton
            label={t('logOut')}
            onPress={handleLogout}
            isDanger
          />
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
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: ThemeColor.BRAND,
    marginBottom: 20,
  },
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
    color: 'red',
  },
  arrow: {
    fontSize: 22,
    color: ThemeColor.HOME_CARD_TEXT,
  },
  cardPressed: {
    opacity: 0.85,
  },
});




/*Previous profile button code:
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


*/