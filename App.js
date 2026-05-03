import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SessionTracker from './src/components/SessionTracker';
import { LanguageProvider } from './src/context/LanguageContext';
import SignInScreen from './src/screens/SignInScreen';
import SignUpScreen from './src/screens/SignUpScreen';
import HomeScreen from './src/screens/HomeScreen';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import ProfileScreen from './src/screens/ProfileScreen';


const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

 /* dynamic usage of bottom navigation tab*/
function TabNavigator() {
  return (
    /* bottom navigator color + text size + icons*/
      /* icon selection at https://ionic.io/ionicons */
    <Tab.Navigator
    screenOptions={{ headerShown: false,
       tabBarLabelStyle: {fontSize: 14, fontWeight: 'bold'}, 
       tabBarActiveTintColor: 'black',
      tabBarInactiveTintColor: 'gray',
      tabBarStyle: {height: 90, paddingBottom: 15, paddingTop: 10,}}} 
      backBehavior="none"
       >

      <Tab.Screen name="Home" component={HomeScreen} 
        options={{ tabBarIcon: ({ color, size }) => 
          ( <Ionicons name="home" size={size} color={color} /> ) }}
      />
      <Tab.Screen name="My Stats" component={HomeScreen} 
        options={{ tabBarIcon: ({ color, size }) => 
          ( <Ionicons name="bar-chart" size={size} color={color} /> ) }}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} 
        options={{ tabBarIcon: ({ color, size }) => 
          ( <Ionicons name="person" size={size} color={color} /> ) }}
      /> 
      </Tab.Navigator>
  );
}


export default function App() {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <NavigationContainer>
          <Stack.Navigator initialRouteName="SignIn">
            <Stack.Screen
              name="SignIn"
              component={SignInScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="SignUp"
              component={SignUpScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Home"
              component={TabNavigator}
              options={{ headerShown: false }}
            />
          </Stack.Navigator>
        </NavigationContainer>
        <SessionTracker />
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
