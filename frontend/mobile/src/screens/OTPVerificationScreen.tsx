import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { verifyOtp, forgotPassword } from '../api/client';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Card } from '../components/Card';

interface OTPVerificationScreenProps {
  email: string;
  onNavigateResetPassword: (resetToken: string) => void;
  onBack: () => void;
}

export const OTPVerificationScreen: React.FC<OTPVerificationScreenProps> = ({
  email,
  onNavigateResetPassword,
  onBack,
}) => {
  const [otp, setOtp] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [resending, setResending] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState<number>(60);

  // Resend cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const handleVerify = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanOtp = otp.trim();
    if (!cleanOtp || cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
      setErrorMessage('Please enter the 6-digit OTP code.');
      return;
    }

    setLoading(true);
    const res = await verifyOtp(email, cleanOtp);
    setLoading(false);

    if (res.success && res.data?.reset_token) {
      onNavigateResetPassword(res.data.reset_token);
    } else {
      setErrorMessage(res.message || 'Invalid or expired OTP code.');
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setResending(true);

    const res = await forgotPassword(email);
    setResending(false);

    if (res.success) {
      setSuccessMessage('A new recovery code has been sent to your email.');
      setCooldown(60);
      setOtp('');
    } else {
      setErrorMessage(res.message || 'Failed to resend code.');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.keyboardContainer}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.badge}>Password Recovery</Text>
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

          {successMessage && (
            <View style={styles.successBanner}>
              <Text style={styles.successBannerText}>{successMessage}</Text>
            </View>
          )}

          <Input
            label="6-Digit Verification Code"
            placeholder="123456"
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus={true}
          />

          <Button
            title="Verify Code"
            onPress={handleVerify}
            loading={loading}
            variant="primary"
          />

          <View style={styles.resendSection}>
            <Text style={styles.resendPrompt}>Didn't receive the code?</Text>
            <TouchableOpacity
              onPress={handleResend}
              disabled={cooldown > 0 || resending}
              style={[styles.resendButton, cooldown > 0 && styles.resendButtonDisabled]}
            >
              <Text style={[styles.resendButtonText, cooldown > 0 && styles.resendButtonTextDisabled]}>
                {resending
                  ? 'Sending...'
                  : cooldown > 0
                  ? `Resend Code (${cooldown}s)`
                  : 'Resend OTP'}
              </Text>
            </TouchableOpacity>
          </View>
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
  badge: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
    textTransform: 'uppercase',
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
  successBanner: {
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  successBannerText: {
    color: '#15803d',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },
  resendSection: {
    marginTop: 16,
    alignItems: 'center',
  },
  resendPrompt: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 6,
  },
  resendButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  resendButtonDisabled: {
    opacity: 0.6,
  },
  resendButtonText: {
    color: '#2563eb',
    fontSize: 14,
    fontWeight: '600',
  },
  resendButtonTextDisabled: {
    color: '#9ca3af',
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
