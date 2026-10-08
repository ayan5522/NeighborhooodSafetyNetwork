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
import { useAuth } from '../context/AuthContext';
import { verifyEmailOtp, resendVerificationOtp } from '../api/client';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Card } from '../components/Card';

interface EmailVerificationScreenProps {
  email: string;
  onSuccess?: () => void;
  onBack: () => void;
  onEditEmail?: () => void;
}

export const EmailVerificationScreen: React.FC<EmailVerificationScreenProps> = ({
  email,
  onSuccess,
  onBack,
  onEditEmail,
}) => {
  const { setAuthSession } = useAuth();
  const [otp, setOtp] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [resending, setResending] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState<number>(60);

  // Resend cooldown countdown timer
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
      setErrorMessage('Please enter a valid 6-digit verification code.');
      return;
    }

    setLoading(true);
    const res = await verifyEmailOtp({ email, otp: cleanOtp });
    setLoading(false);

    if (res.success && res.data?.token && res.data?.user) {
      setSuccessMessage('Email verified successfully! Logging you in...');
      onSuccess?.();
      // Automatic login: store token and user session directly without asking for password again
      await setAuthSession(res.data.token, res.data.user);
    } else {
      setErrorMessage(res.message || 'Invalid or expired verification code.');
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setResending(true);

    const res = await resendVerificationOtp(email);
    setResending(false);

    if (res.success) {
      setSuccessMessage('A new verification code has been sent to your email.');
      setCooldown(60);
      setOtp('');
    } else {
      setErrorMessage(res.message || 'Failed to resend code. Please try again later.');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.keyboardContainer}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.badge}>Email Verification</Text>
          <Text style={styles.title}>Confirm Your Email</Text>
          <Text style={styles.subTitle}>
            A 6-digit verification code has been sent to your email address:
          </Text>
          <View style={styles.emailContainer}>
            <Text style={styles.emailHighlight}>{email}</Text>
            {onEditEmail && (
              <TouchableOpacity onPress={onEditEmail} style={styles.editEmailButton}>
                <Text style={styles.editEmailText}>Change</Text>
              </TouchableOpacity>
            )}
          </View>
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
            title="Verify & Continue"
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
            <Text style={styles.backLink}>← Back to Sign In</Text>
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
    backgroundColor: '#dbeafe',
    color: '#1e40af',
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
    paddingHorizontal: 12,
  },
  emailContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: '#e5e7eb',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  emailHighlight: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
  },
  editEmailButton: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#ffffff',
    borderRadius: 8,
  },
  editEmailText: {
    fontSize: 12,
    color: '#2563eb',
    fontWeight: '600',
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
