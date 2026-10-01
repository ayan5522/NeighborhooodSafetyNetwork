import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Card } from '../components/Card';

interface ProfileScreenProps {
  onNavigateHome: () => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ onNavigateHome }) => {
  const { user, updateUser } = useAuth();
  const [fullName, setFullName] = useState<string>(user?.full_name || '');
  const [loading, setLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const handleSave = async () => {
    setFeedback(null);
    if (!fullName.trim()) {
      setFeedback({ type: 'error', message: 'Full name cannot be empty.' });
      return;
    }

    setLoading(true);
    const result = await updateUser(fullName.trim());
    setLoading(false);

    if (result.success) {
      setFeedback({ type: 'success', message: 'Profile updated successfully.' });
    } else {
      setFeedback({ type: 'error', message: result.message || 'Update failed.' });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Resident Profile</Text>
          <Text style={styles.subTitle}>Manage your account information</Text>
        </View>

        <Card>
          {feedback && (
            <View
              style={[
                styles.banner,
                feedback.type === 'success' ? styles.successBanner : styles.errorBanner,
              ]}
            >
              <Text
                style={[
                  styles.bannerText,
                  feedback.type === 'success' ? styles.successText : styles.errorText,
                ]}
              >
                {feedback.message}
              </Text>
            </View>
          )}

          <Input
            label="Full Name (Editable)"
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
          />

          <View style={styles.readOnlyContainer}>
            <Text style={styles.readOnlyLabel}>Email Address (Read-only)</Text>
            <View style={styles.readOnlyBox}>
              <Text style={styles.readOnlyValue}>{user?.email}</Text>
            </View>
          </View>

          <View style={styles.readOnlyContainer}>
            <Text style={styles.readOnlyLabel}>Role (Restricted to Administrators)</Text>
            <View style={styles.readOnlyBox}>
              <Text style={styles.readOnlyValue}>{user?.role}</Text>
            </View>
          </View>

          <View style={styles.readOnlyContainer}>
            <Text style={styles.readOnlyLabel}>Account Status (Managed by System)</Text>
            <View style={styles.readOnlyBox}>
              <Text style={styles.readOnlyValue}>{user?.account_status}</Text>
            </View>
          </View>

          <Button
            title="Save Changes"
            onPress={handleSave}
            loading={loading}
            variant="primary"
          />
        </Card>

        <Button
          title="Back to Overview"
          onPress={onNavigateHome}
          variant="outline"
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  scrollContainer: {
    padding: 20,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  subTitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  banner: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
  },
  successBanner: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
  },
  errorBanner: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
  },
  bannerText: {
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },
  successText: {
    color: '#166534',
  },
  errorText: {
    color: '#991b1b',
  },
  readOnlyContainer: {
    marginBottom: 16,
  },
  readOnlyLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4b5563',
    marginBottom: 6,
  },
  readOnlyBox: {
    height: 48,
    borderRadius: 8,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  readOnlyValue: {
    fontSize: 15,
    color: '#6b7280',
    fontWeight: '500',
  },
});
