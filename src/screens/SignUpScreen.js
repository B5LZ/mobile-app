import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, Alert } from 'react-native';
import { ThemeColor, ThemeRadius } from '../theme/appTheme';
// Import Firebase services from your config file
import { auth, db } from '../config/firebaseConfig'; 
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

export default function SignUpScreen({ navigation }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSignUp = async () => {
    // Basic validation
    if (!email || !password || !name) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }

    try {
      // 1. Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Create the user profile document in Firestore
      await setDoc(doc(db, "users", user.uid), {
        fullName: name,
        email: email,
        languagePreference: 'en', // Default setting
        createdAt: new Date(),
        totalSessionTime: 0
      });

      // 3. Navigate to Home
      navigation.replace('Home');
    } catch (error) {
      // Handle common Firebase errors (e.g., email already in use)
      let errorMessage = error.message;
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = "That email address is already in use.";
      }
      Alert.alert("Sign Up Failed", errorMessage);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create account</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Full name"
        style={styles.input}
      />
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        style={styles.input}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
        style={styles.input}
      />
      <Pressable
        style={styles.primaryButton}
        onPress={handleSignUp}
      >
        <Text style={styles.primaryButtonText}>Create Account</Text>
      </Pressable>
      <Pressable onPress={() => navigation.goBack()}>
        <Text style={styles.link}>Already have an account? Sign in</Text>
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