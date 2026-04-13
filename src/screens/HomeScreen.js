import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useLayoutEffect } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebaseConfig';
import { ThemeColor, ThemeRadius } from '../theme/appTheme';

const cards = [
  {
    title: 'About the Assistant',
    text: 'Our AI is trained to guide you through mindfulness exercises.',
  },
  {
    title: 'Usage Instructions',
    text: 'Find a quiet space and follow the breathing prompts.',
  },
  {
    title: 'Recent Updates',
    text: 'Korean language handling was recently improved.',
  },
  {
    title: 'Quick Settings',
    text: 'Customize your interface and accessibility options here.',
  },
];

export default function HomeScreen({ navigation }) {
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
          <Text style={styles.headerLogoutText}>Log out</Text>
        </Pressable>
      ),
    });
  }, [navigation, handleLogout]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => sub.remove();
    }, []),
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Mindfulness Assistant</Text>
      <Text style={styles.subtitle}>Mindfulness Virtual Assistant</Text>
      <View style={styles.chatPlaceholder}>
        <Text style={styles.chatText}>[ AI chatbot UI placeholder ]</Text>
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
