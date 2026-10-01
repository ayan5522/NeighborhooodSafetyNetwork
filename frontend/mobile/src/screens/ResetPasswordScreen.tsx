import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { resetPassword } from '../api/client';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Card } from '../components/Card';

interface ResetPasswordScreenProps {
  resetToken: string;
  onSuccess: () => void;
}

export const ResetPasswordScreen: React.FC<ResetPasswordScreenProps> = ({
  resetToken,
  onSuccess,
}) => {
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmNewPassword, setConfirmNewPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleResetPassword = async () => {
    setErrorMessage(null);

    if (newPassword.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setLoading(true);
    const res = await resetPassword(resetToken, newPassword, confirmNewPassword);
    setLoading(false);

    if (res.success) {
      setSuccessMessage('Password reset successfully! You can now log in.');
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } else {
      setErrorMessage(res.message || 'Failed to reset password.');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.keyboardContainer}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Set New Password</Text>
          <Text style={styles.subTitle}>
            Choose a strong password with at least 8 characters
          </Text>
        </View>

        <Card>
          {errorMessage && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{errorMessage}</Text>
            </View>
          )}

          {successMessage && (
            <View style={styles.successBanner}>
              <Text style={styles.successBannerText}>{successMessage}</Text>
            </View>
          )}

          <Input
            label="New Password"
            placeholder="At least 8 characters"
            value={newPassword}
            onChangeText={setNewPassword}
            isPassword={true}
          />

          <Input
            label="Confirm New Password"
            placeholder="Re-enter new password"
            value={confirmNewPassword}
            onChangeText={setConfirmNewPassword}
            isPassword={true}
          />

          <Button
            title="Update Password"
            onPress={handleResetPassword}
            loading={loading}
            variant="primary"
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e3a8a',
  },
  subTitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 6,
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#f87171',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    color: '#b91c1c',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },
  successBanner: {
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  successBannerText: {
    color: '#166534',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '600',
  },
});
