import React, { useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { LoginScreen } from './src/screens/LoginScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { NeighborhoodMapScreen } from './src/screens/NeighborhoodMapScreen';
import { ForgotPasswordScreen } from './src/screens/ForgotPasswordScreen';
import { OTPVerificationScreen } from './src/screens/OTPVerificationScreen';
import { ResetPasswordScreen } from './src/screens/ResetPasswordScreen';

type AuthNavScreen = 'login' | 'register' | 'forgot' | 'otp' | 'reset';
type MainNavScreen = 'home' | 'profile' | 'map';

const NavigationContainer: React.FC = () => {
  const { authenticated, loading } = useAuth();
  const [authScreen, setAuthScreen] = useState<AuthNavScreen>('login');
  const [mainScreen, setMainScreen] = useState<MainNavScreen>('home');
  const [resetFlowState, setResetFlowState] = useState<{
    email: string;
    devOtp?: string;
    resetToken?: string;
  }>({ email: '' });

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (authenticated) {
    if (mainScreen === 'profile') {
      return <ProfileScreen onNavigateHome={() => setMainScreen('home')} />;
    }
    if (mainScreen === 'map') {
      return <NeighborhoodMapScreen onBack={() => setMainScreen('home')} />;
    }
    return (
      <HomeScreen
        onNavigateProfile={() => setMainScreen('profile')}
        onNavigateMap={() => setMainScreen('map')}
      />
    );
  }

  // Unauthenticated Navigation
  switch (authScreen) {
    case 'register':
      return <RegisterScreen onNavigateLogin={() => setAuthScreen('login')} />;

    case 'forgot':
      return (
        <ForgotPasswordScreen
          onNavigateLogin={() => setAuthScreen('login')}
          onNavigateOtp={(email, devOtp) => {
            setResetFlowState({ email, devOtp });
            setAuthScreen('otp');
          }}
        />
      );

    case 'otp':
      return (
        <OTPVerificationScreen
          email={resetFlowState.email}
          devOtp={resetFlowState.devOtp}
          onBack={() => setAuthScreen('forgot')}
          onNavigateResetPassword={(resetToken) => {
            setResetFlowState((prev) => ({ ...prev, resetToken }));
            setAuthScreen('reset');
          }}
        />
      );

    case 'reset':
      return (
        <ResetPasswordScreen
          resetToken={resetFlowState.resetToken || ''}
          onSuccess={() => {
            setResetFlowState({ email: '' });
            setAuthScreen('login');
          }}
        />
      );

    case 'login':
    default:
      return (
        <LoginScreen
          onNavigateRegister={() => setAuthScreen('register')}
          onNavigateForgotPassword={() => setAuthScreen('forgot')}
        />
      );
  }
};

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <NavigationContainer />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
});
