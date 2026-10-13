import React, { useState, useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { NotificationProvider } from './src/context/NotificationContext';
import { LoginScreen } from './src/screens/LoginScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { NeighborhoodMapScreen } from './src/screens/NeighborhoodMapScreen';
import { ForgotPasswordScreen } from './src/screens/ForgotPasswordScreen';
import { OTPVerificationScreen } from './src/screens/OTPVerificationScreen';
import { ResetPasswordScreen } from './src/screens/ResetPasswordScreen';
import { EmailVerificationScreen } from './src/screens/EmailVerificationScreen';
import { ReportIncidentScreen } from './src/screens/ReportIncidentScreen';
import { MyReportsScreen } from './src/screens/MyReportsScreen';
import { IncidentDetailsScreen } from './src/screens/IncidentDetailsScreen';
import { AlertsScreen } from './src/screens/AlertsScreen';
import { AlertDetailsScreen } from './src/screens/AlertDetailsScreen';
import { EmergencyScreen } from './src/screens/EmergencyScreen';
import { EmergencyContactsScreen } from './src/screens/EmergencyContactsScreen';
import { NotificationsScreen } from './src/screens/NotificationsScreen';
import { AdminDashboardScreen } from './src/screens/AdminDashboardScreen';
import { UserManagementScreen } from './src/screens/UserManagementScreen';
import { ModerationQueueScreen } from './src/screens/ModerationQueueScreen';
import { ModerationDetailScreen } from './src/screens/ModerationDetailScreen';
import { AuditLogsScreen } from './src/screens/AuditLogsScreen';

type AuthNavScreen = 'login' | 'register' | 'verify_email' | 'forgot' | 'otp' | 'reset';
type MainNavScreen =
  | 'home'
  | 'profile'
  | 'map'
  | 'report_incident'
  | 'my_reports'
  | 'incident_details'
  | 'alerts'
  | 'alert_details'
  | 'emergency'
  | 'emergency_contacts'
  | 'notifications'
  | 'admin_dashboard'
  | 'user_management'
  | 'moderation_queue'
  | 'moderation_detail'
  | 'audit_logs';

const NavigationContainer: React.FC = () => {
  const { authenticated, loading } = useAuth();
  const [authScreen, setAuthScreen] = useState<AuthNavScreen>('login');
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string>('');
  const [mainScreen, setMainScreen] = useState<MainNavScreen>('home');
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [incidentBackScreen, setIncidentBackScreen] = useState<MainNavScreen>('home');
  const [resetFlowState, setResetFlowState] = useState<{
    email: string;
    resetToken?: string;
  }>({ email: '' });

  // Reset unauthenticated navigation stack to root LoginScreen whenever user logs out
  const prevAuthenticated = useRef(authenticated);
  useEffect(() => {
    if (prevAuthenticated.current && !authenticated) {
      setAuthScreen('login');
      setPendingVerificationEmail('');
      setMainScreen('home');
      setSelectedIncidentId(null);
      setSelectedAlertId(null);
      setSelectedReportId(null);
      setIncidentBackScreen('home');
      setResetFlowState({ email: '' });
    }
    prevAuthenticated.current = authenticated;
  }, [authenticated]);

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
      return (
        <NeighborhoodMapScreen
          onBack={() => setMainScreen('home')}
          onNavigateReport={() => setMainScreen('report_incident')}
          onSelectIncident={(id) => {
            setSelectedIncidentId(id);
            setIncidentBackScreen('map');
            setMainScreen('incident_details');
          }}
        />
      );
    }
    if (mainScreen === 'report_incident') {
      return (
        <ReportIncidentScreen
          onBack={() => setMainScreen('home')}
          onSuccess={(id) => {
            setSelectedIncidentId(id);
            setIncidentBackScreen('home');
            setMainScreen('incident_details');
          }}
        />
      );
    }
    if (mainScreen === 'my_reports') {
      return (
        <MyReportsScreen
          onBack={() => setMainScreen('home')}
          onNavigateReport={() => setMainScreen('report_incident')}
          onSelectIncident={(id) => {
            setSelectedIncidentId(id);
            setIncidentBackScreen('my_reports');
            setMainScreen('incident_details');
          }}
        />
      );
    }
    if (mainScreen === 'incident_details' && selectedIncidentId) {
      return (
        <IncidentDetailsScreen
          incidentId={selectedIncidentId}
          onBack={() => setMainScreen(incidentBackScreen)}
          onIncidentCancelled={() => setMainScreen(incidentBackScreen)}
        />
      );
    }
    if (mainScreen === 'alerts') {
      return (
        <AlertsScreen
          onBack={() => setMainScreen('home')}
          onSelectAlert={(id) => {
            setSelectedAlertId(id);
            setMainScreen('alert_details');
          }}
          onSelectIncident={(id) => {
            setSelectedIncidentId(id);
            setIncidentBackScreen('alerts');
            setMainScreen('incident_details');
          }}
        />
      );
    }
    if (mainScreen === 'alert_details' && selectedAlertId) {
      return (
        <AlertDetailsScreen
          alertId={selectedAlertId}
          onBack={() => setMainScreen('alerts')}
          onNavigateMap={() => setMainScreen('map')}
          onNavigateIncident={(id) => {
            setSelectedIncidentId(id);
            setIncidentBackScreen('alert_details');
            setMainScreen('incident_details');
          }}
        />
      );
    }
    if (mainScreen === 'emergency') {
      return (
        <EmergencyScreen
          onBack={() => setMainScreen('home')}
          onManageContacts={() => setMainScreen('emergency_contacts')}
        />
      );
    }
    if (mainScreen === 'emergency_contacts') {
      return (
        <EmergencyContactsScreen
          onBack={() => setMainScreen('emergency')}
        />
      );
    }
    if (mainScreen === 'notifications') {
      return (
        <NotificationsScreen
          onBack={() => setMainScreen('home')}
          onSelectAlert={(id) => {
            setSelectedAlertId(id);
            setMainScreen('alert_details');
          }}
          onSelectIncident={(id) => {
            setSelectedIncidentId(id);
            setIncidentBackScreen('notifications');
            setMainScreen('incident_details');
          }}
        />
      );
    }
    if (mainScreen === 'admin_dashboard') {
      return (
        <AdminDashboardScreen
          onBack={() => setMainScreen('home')}
          onNavigateUserManagement={() => setMainScreen('user_management')}
          onNavigateModerationQueue={() => setMainScreen('moderation_queue')}
          onNavigateAuditLogs={() => setMainScreen('audit_logs')}
        />
      );
    }
    if (mainScreen === 'user_management') {
      return (
        <UserManagementScreen
          onBack={() => setMainScreen('admin_dashboard')}
        />
      );
    }
    if (mainScreen === 'audit_logs') {
      return (
        <AuditLogsScreen
          onBack={() => setMainScreen('admin_dashboard')}
        />
      );
    }
    if (mainScreen === 'moderation_queue') {
      return (
        <ModerationQueueScreen
          onBack={() => setMainScreen('home')}
          onSelectReport={(id) => {
            setSelectedReportId(id);
            setMainScreen('moderation_detail');
          }}
        />
      );
    }
    if (mainScreen === 'moderation_detail' && selectedReportId) {
      return (
        <ModerationDetailScreen
          reportId={selectedReportId}
          onBack={() => setMainScreen('moderation_queue')}
          onActionComplete={() => setMainScreen('moderation_queue')}
        />
      );
    }
    return (
      <HomeScreen
        onNavigateProfile={() => setMainScreen('profile')}
        onNavigateMap={() => setMainScreen('map')}
        onNavigateReport={() => setMainScreen('report_incident')}
        onNavigateMyReports={() => setMainScreen('my_reports')}
        onNavigateAlerts={() => setMainScreen('alerts')}
        onNavigateEmergency={() => setMainScreen('emergency')}
        onNavigateNotifications={() => setMainScreen('notifications')}
        onNavigateAdminDashboard={() => setMainScreen('admin_dashboard')}
        onNavigateUserManagement={() => setMainScreen('user_management')}
        onNavigateModerationQueue={() => setMainScreen('moderation_queue')}
        onNavigateAuditLogs={() => setMainScreen('audit_logs')}
      />
    );
  }

  // Unauthenticated Navigation
  switch (authScreen) {
    case 'register':
      return (
        <RegisterScreen
          onNavigateLogin={() => setAuthScreen('login')}
          onNavigateVerifyEmail={(email) => {
            setPendingVerificationEmail(email);
            setAuthScreen('verify_email');
          }}
        />
      );

    case 'verify_email':
      return (
        <EmailVerificationScreen
          email={pendingVerificationEmail}
          onSuccess={() => {
            setAuthScreen('login');
            setPendingVerificationEmail('');
          }}
          onBack={() => {
            setAuthScreen('login');
            setPendingVerificationEmail('');
          }}
          onEditEmail={() => setAuthScreen('register')}
        />
      );

    case 'forgot':
      return (
        <ForgotPasswordScreen
          onNavigateLogin={() => setAuthScreen('login')}
          onNavigateOtp={(email) => {
            setResetFlowState({ email });
            setAuthScreen('otp');
          }}
        />
      );

    case 'otp':
      return (
        <OTPVerificationScreen
          email={resetFlowState.email}
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
          onNavigateVerifyEmail={(email) => {
            setPendingVerificationEmail(email);
            setAuthScreen('verify_email');
          }}
        />
      );
  }
};

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <StatusBar style="auto" />
        <NavigationContainer />
      </NotificationProvider>
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
