import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { verifyOtp } from '../api/client';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Card } from '../components/Card';

interface OTPVerificationScreenProps {
  email: string;
  devOtp?: string;
  onNavigateResetPassword: (resetToken: string) => void;
  onBack: () => void;
}

export const OTPVerificationScreen: React.FC<OTPVerificationScreenProps> = ({
  email,
  devOtp,
  onNavigateResetPassword,
  onBack,
}) => {
  const [otp, setOtp] = useState<string>(devOtp || '');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleVerify = async () => {
    setErrorMessage(null);

    if (!otp.trim() || otp.trim().length < 6) {
      setErrorMessage('Please enter the 6-digit OTP code.');
      return;
    }

    setLoading(true);
    const res = await verifyOtp(email, otp.trim());
    setLoading(false);

    if (res.success && res.data?.reset_token) {
      onNavigateResetPassword(res.data.reset_token);
    } else {
      setErrorMessage(res.message || 'Invalid or expired OTP code.');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.keyboardContainer}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Enter OTP Code</Text>
          <Text style={styles.subTitle}>
            We sent a 6-digit verification code to:
          </Text>
          <Text style={styles.emailHighlight}>{email}</Text>
        </View>

        <Card>
          {errorMessage && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{errorMessage}</Text>
            </View>
          )}

          {devOtp && (
            <View style={styles.devBanner}>
              <Text style={styles.devBannerText}>
                [Dev Mode] Verification OTP: <Text style={styles.bold}>{devOtp}</Text>
              </Text>
            </View>
          )}

          <Input
            label="6-Digit Verification Code"
            placeholder="123456"
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            maxLength={6}
          />

          <Button
            title="Verify Code"
            onPress={handleVerify}
            loading={loading}
            variant="primary"
          />
        </Card>

        <View style={styles.footer}>
          <TouchableOpacity onPress={onBack}>
            <Text style={styles.backLink}>← Back to Email Entry</Text>
          </TouchableOpacity>
        </View>
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
  emailHighlight: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    marginTop: 2,
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
  devBanner: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
  },
  devBannerText: {
    color: '#92400e',
    fontSize: 13,
    textAlign: 'center',
  },
  bold: {
    fontWeight: 'bold',
  },
  footer: {
    alignItems: 'center',
    marginTop: 16,
  },
  backLink: {
    color: '#2563eb',
    fontSize: 15,
    fontWeight: '600',
  },
});
