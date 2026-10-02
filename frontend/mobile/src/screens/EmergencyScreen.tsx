import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { useLocation } from '../hooks/useLocation';
import {
  fetchMySOS,
  createSOS,
  resolveSOS,
  fetchEmergencyContacts,
} from '../api/client';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { SOSEvent, EmergencyContact } from '../types/alert';

interface EmergencyScreenProps {
  onBack: () => void;
  onManageContacts: () => void;
}

export const EmergencyScreen: React.FC<EmergencyScreenProps> = ({
  onBack,
  onManageContacts,
}) => {
  const { location, loading: locationLoading, requestAndSyncLocation } = useLocation();
  const [activeSOS, setActiveSOS] = useState<SOSEvent | null>(null);
  const [primaryContact, setPrimaryContact] = useState<EmergencyContact | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      // 1. Fetch current active SOS
      const sosRes = await fetchMySOS();
      if (sosRes.success && sosRes.data?.sos_events) {
        const active = sosRes.data.sos_events.find((e) => e.status === 'ACTIVE');
        setActiveSOS(active || null);
      }

      // 2. Fetch primary emergency contact
      const contactRes = await fetchEmergencyContacts();
      if (contactRes.success && contactRes.data?.contacts) {
        const primary = contactRes.data.contacts.find((c) => c.is_primary);
        setPrimaryContact(primary || contactRes.data.contacts[0] || null);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    requestAndSyncLocation();
  }, [loadData, requestAndSyncLocation]);

  /**
   * Confirmation before triggering SOS (Requirement 36)
   */
  const handleTriggerSOS = () => {
    Alert.alert(
      '⚠️ Confirm Emergency SOS',
      'Are you sure you want to trigger personal emergency assistance? Your GPS coordinates will be captured.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm SOS',
          style: 'destructive',
          onPress: executeSOS,
        },
      ]
    );
  };

  const executeSOS = async () => {
    setActionLoading(true);
    try {
      let currentLat = location?.latitude;
      let currentLng = location?.longitude;

      if (!currentLat || !currentLng) {
        // Try one immediate sync
        await requestAndSyncLocation();
        currentLat = location?.latitude;
        currentLng = location?.longitude;
      }

      if (!currentLat || !currentLng) {
        Alert.alert(
          'Location Required',
          'Could not acquire device GPS location. Please ensure location services are enabled.'
        );
        setActionLoading(false);
        return;
      }

      const res = await createSOS(currentLat, currentLng);
      if (res.success && res.data) {
        setActiveSOS(res.data.sos);
        Alert.alert(
          'Emergency SOS Active',
          'Your personal SOS event has been logged. Use the actions below to call emergency services or notify your contact.'
        );
      } else {
        Alert.alert('SOS Error', res.message || 'Failed to trigger SOS');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to trigger SOS');
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * Native call action: Open device dialer for 112 (Requirement 37 & 38)
   */
  const handleCall112 = () => {
    if (Platform.OS === 'web') {
      Alert.alert(
        'Emergency Services (112)',
        'Direct phone dialing is not supported on desktop web. Please dial 112 directly on your mobile device.'
      );
      return;
    }

    const telUrl = 'tel:112';
    Linking.canOpenURL(telUrl)
      .then((supported) => {
        if (supported) {
          Linking.openURL(telUrl);
        } else {
          Alert.alert('Unsupported', 'Phone call dialer is not supported on this device.');
        }
      })
      .catch(() => {
        Alert.alert('Error', 'Unable to launch phone dialer.');
      });
  };

  /**
   * Notify primary emergency contact via dialer or SMS with coordinates (Requirement 39)
   */
  const handleNotifyContact = () => {
    if (!primaryContact) {
      Alert.alert('No Contact', 'Please add a primary emergency contact first.', [
        { text: 'Add Contact', onPress: onManageContacts },
      ]);
      return;
    }

    if (Platform.OS === 'web') {
      Alert.alert(
        'Emergency Contact',
        `Primary Contact: ${primaryContact.contact_name}\nPhone: ${primaryContact.phone_number}`
      );
      return;
    }

    const coordsStr = activeSOS
      ? `${activeSOS.latitude.toFixed(5)}, ${activeSOS.longitude.toFixed(5)}`
      : location
      ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`
      : 'Location captured';

    const message = encodeURIComponent(
      `EMERGENCY: I need immediate assistance. My coordinates: ${coordsStr}`
    );
    const smsUrl = `sms:${primaryContact.phone_number}?body=${message}`;

    Linking.canOpenURL(smsUrl)
      .then((supported) => {
        if (supported) {
          Linking.openURL(smsUrl);
        } else {
          // Fallback to phone call
          Linking.openURL(`tel:${primaryContact.phone_number}`);
        }
      })
      .catch(() => {
        Linking.openURL(`tel:${primaryContact.phone_number}`);
      });
  };

  const handleResolveSOS = () => {
    if (!activeSOS) return;

    Alert.alert(
      'Resolve Emergency',
      'Are you safe now? This will mark your active SOS event as RESOLVED.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'I Am Safe Now',
          onPress: async () => {
            setActionLoading(true);
            try {
              const res = await resolveSOS(activeSOS.id);
              if (res.success) {
                setActiveSOS(null);
                Alert.alert('Resolved', 'Your emergency SOS has been resolved.');
              }
            } catch {}
            setActionLoading(false);
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>← Home</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Emergency & SOS</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Active SOS Alert Banner */}
        {activeSOS && (
          <View style={styles.activeBanner}>
            <Text style={styles.activeBannerIcon}>🚨</Text>
            <View style={styles.activeBannerTextCol}>
              <Text style={styles.activeBannerTitle}>ACTIVE PERSONAL SOS</Text>
              <Text style={styles.activeBannerSubtitle}>
                Triggered at {new Date(activeSOS.created_at).toLocaleTimeString()} • Lat:{' '}
                {activeSOS.latitude.toFixed(4)}, Lng: {activeSOS.longitude.toFixed(4)}
              </Text>
            </View>
          </View>
        )}

        {/* SOS Action Card */}
        <Card>
          <Text style={styles.cardTitle}>Personal Emergency SOS</Text>
          <Text style={styles.cardDesc}>
            Press the button below if you are in immediate danger or need urgent help.
          </Text>

          {activeSOS ? (
            <View style={styles.activeControlsBox}>
              <Text style={styles.activeNotice}>
                ⚠️ Your emergency status is currently ACTIVE.
              </Text>
              <Button
                title={actionLoading ? 'Resolving...' : '✅ I Am Safe Now (Resolve SOS)'}
                onPress={handleResolveSOS}
                variant="primary"
                loading={actionLoading}
                style={{ marginTop: 8 }}
              />
            </View>
          ) : (
            <TouchableOpacity
              style={styles.sosButton}
              activeOpacity={0.8}
              onPress={handleTriggerSOS}
              disabled={actionLoading || locationLoading}
            >
              <View style={styles.sosInnerCircle}>
                <Text style={styles.sosText}>SOS</Text>
                <Text style={styles.sosSubtext}>TAP TO ACTIVATE</Text>
              </View>
            </TouchableOpacity>
          )}
        </Card>

        {/* Direct Emergency Calling Actions (Requirement 37 & 38) */}
        <Card>
          <Text style={styles.cardTitle}>Immediate Assistance Actions</Text>
          <Text style={styles.cardDesc}>
            Direct dialing through your device dialer (No simulated dispatch):
          </Text>

          <View style={styles.actionGrid}>
            <TouchableOpacity style={styles.emergencyActionBtn} onPress={handleCall112}>
              <Text style={styles.actionIcon}>📞</Text>
              <View>
                <Text style={styles.actionBtnTitle}>Call 112</Text>
                <Text style={styles.actionBtnSub}>National Emergency Helpline</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.emergencyActionBtn} onPress={handleNotifyContact}>
              <Text style={styles.actionIcon}>📲</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionBtnTitle}>Notify Emergency Contact</Text>
                <Text style={styles.actionBtnSub}>
                  {primaryContact
                    ? `${primaryContact.contact_name} (${primaryContact.phone_number})`
                    : 'No contact configured'}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </Card>

        {/* Primary Contact Overview Card */}
        <Card>
          <View style={styles.contactHeaderRow}>
            <Text style={styles.cardTitle}>Primary Contact</Text>
            <TouchableOpacity onPress={onManageContacts}>
              <Text style={styles.manageText}>Manage Contacts →</Text>
            </TouchableOpacity>
          </View>

          {primaryContact ? (
            <View style={styles.contactDetails}>
              <Text style={styles.contactName}>{primaryContact.contact_name}</Text>
              <Text style={styles.contactPhone}>{primaryContact.phone_number}</Text>
            </View>
          ) : (
            <View style={styles.noContactBox}>
              <Text style={styles.noContactText}>No primary emergency contact set.</Text>
              <Button
                title="Configure Emergency Contact"
                onPress={onManageContacts}
                variant="outline"
                style={{ marginTop: 8 }}
              />
            </View>
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 15,
    color: '#2563eb',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  scrollContainer: {
    padding: 16,
    gap: 12,
  },
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ef4444',
    padding: 14,
    borderRadius: 10,
    gap: 12,
  },
  activeBannerIcon: {
    fontSize: 26,
  },
  activeBannerTextCol: {
    flex: 1,
  },
  activeBannerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  activeBannerSubtitle: {
    fontSize: 12,
    color: '#fee2e2',
    marginTop: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
    marginBottom: 12,
  },
  sosButton: {
    alignSelf: 'center',
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: '#fee2e2',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 12,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  sosInnerCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sosText: {
    fontSize: 34,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 2,
  },
  sosSubtext: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fecaca',
    marginTop: 2,
  },
  activeControlsBox: {
    padding: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  activeNotice: {
    fontSize: 13,
    fontWeight: '600',
    color: '#b91c1c',
    textAlign: 'center',
  },
  actionGrid: {
    gap: 8,
  },
  emergencyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    gap: 12,
  },
  actionIcon: {
    fontSize: 22,
  },
  actionBtnTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  actionBtnSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  contactHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  manageText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563eb',
  },
  contactDetails: {
    marginTop: 6,
    padding: 10,
    backgroundColor: '#eff6ff',
    borderRadius: 6,
  },
  contactName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e40af',
  },
  contactPhone: {
    fontSize: 13,
    color: '#3b82f6',
    marginTop: 2,
  },
  noContactBox: {
    marginTop: 4,
    alignItems: 'center',
  },
  noContactText: {
    fontSize: 13,
    color: '#6b7280',
  },
});
