import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  const actionLoadingRef = useRef(false);

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.alert) {
        window.alert(`${title}\n\n${message}`);
      }
    } else {
      Alert.alert(title, message);
    }
  };

  const confirmAction = (
    title: string,
    message: string,
    confirmText: string,
    onConfirm: () => void
  ) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm) {
        const confirmed = window.confirm(`${title}\n\n${message}`);
        if (confirmed) {
          onConfirm();
        }
      } else {
        onConfirm();
      }
    } else {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: confirmText,
          style: 'destructive',
          onPress: onConfirm,
        },
      ]);
    }
  };

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
    confirmAction(
      '⚠️ Confirm Emergency SOS',
      'Are you sure you want to trigger personal emergency assistance? Your GPS coordinates will be captured.',
      'Confirm SOS',
      executeSOS
    );
  };

  const executeSOS = async () => {
    if (actionLoadingRef.current || actionLoading) return;
    actionLoadingRef.current = true;
    setActionLoading(true);

    try {
      let currentLat = location?.latitude;
      let currentLng = location?.longitude;

      if (currentLat === undefined || currentLng === undefined) {
        // Synchronously acquire location if not yet ready
        const locResult = await requestAndSyncLocation();
        if (locResult.success && locResult.location) {
          currentLat = locResult.location.latitude;
          currentLng = locResult.location.longitude;
        } else if (locResult.permissionDenied) {
          showAlert(
            'Location Permission Required',
            'Location permission is required to broadcast your SOS coordinates. Please enable location permissions in settings.'
          );
          return;
        } else if (locResult.servicesDisabled) {
          showAlert(
            'Location Services Disabled',
            'Please turn on GPS / Location Services on your device to trigger SOS.'
          );
          return;
        } else {
          showAlert(
            'Location Error',
            locResult.error || 'Could not acquire GPS coordinates. Please ensure GPS is enabled.'
          );
          return;
        }
      }

      if (currentLat === undefined || currentLng === undefined) {
        showAlert(
          'Location Required',
          'Could not acquire device GPS location. Please ensure location services are enabled.'
        );
        return;
      }

      const res = await createSOS(currentLat, currentLng);
      if (res.success && res.data?.sos) {
        setActiveSOS(res.data.sos);
        showAlert(
          'Emergency SOS Active',
          'Your personal SOS event has been logged. Use the actions below to call emergency services or notify your contact.'
        );
      } else {
        showAlert('SOS Error', res.message || 'Failed to trigger SOS');
      }
    } catch (err: any) {
      showAlert('Error', err.message || 'Failed to trigger SOS');
    } finally {
      setActionLoading(false);
      actionLoadingRef.current = false;
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
      ? `${Number(activeSOS.latitude).toFixed(5)}, ${Number(activeSOS.longitude).toFixed(5)}`
      : location
      ? `${Number(location.latitude).toFixed(5)}, ${Number(location.longitude).toFixed(5)}`
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

  const executeResolve = async () => {
    if (!activeSOS) return;
    if (actionLoadingRef.current || actionLoading) return;
    actionLoadingRef.current = true;
    setActionLoading(true);

    try {
      const res = await resolveSOS(activeSOS.id);
      if (res.success && res.data?.sos) {
        setActiveSOS(null);
        showAlert('Resolved', 'Your emergency SOS has been marked as resolved.');
      } else {
        showAlert('Resolution Error', res.message || 'Could not resolve emergency SOS.');
      }
    } catch (err: any) {
      showAlert('Error', err.message || 'An unexpected error occurred while resolving SOS.');
    } finally {
      setActionLoading(false);
      actionLoadingRef.current = false;
    }
  };

  const handleResolveSOS = () => {
    if (!activeSOS) return;

    confirmAction(
      'Resolve Emergency',
      'Are you safe now? This will mark your active SOS event as RESOLVED.',
      'I Am Safe Now',
      executeResolve
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
                {Number(activeSOS.latitude).toFixed(4)}, Lng: {Number(activeSOS.longitude).toFixed(4)}
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
                disabled={actionLoading}
                style={{ marginTop: 8 }}
              />
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.sosButton, actionLoading && styles.sosButtonDisabled]}
              activeOpacity={0.8}
              onPress={handleTriggerSOS}
              disabled={actionLoading}
            >
              <View style={styles.sosInnerCircle}>
                {actionLoading ? (
                  <ActivityIndicator size="large" color="#ffffff" />
                ) : (
                  <>
                    <Text style={styles.sosText}>SOS</Text>
                    <Text style={styles.sosSubtext}>TAP TO ACTIVATE</Text>
                  </>
                )}
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
  sosButtonDisabled: {
    opacity: 0.6,
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
