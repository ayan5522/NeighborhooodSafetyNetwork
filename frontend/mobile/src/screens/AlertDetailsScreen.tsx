import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { fetchAlertById, markAlertAsRead } from '../api/client';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import {
  Alert,
  PRIORITY_COLORS,
  ALERT_STATUS_COLORS,
} from '../types/alert';
import { CATEGORY_LABELS } from '../types/incident';

interface AlertDetailsScreenProps {
  alertId: string;
  onBack: () => void;
  onNavigateMap?: (lat: number, lng: number) => void;
}

export const AlertDetailsScreen: React.FC<AlertDetailsScreenProps> = ({
  alertId,
  onBack,
  onNavigateMap,
}) => {
  const [alert, setAlert] = useState<Alert | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAlertDetails = useCallback(async () => {
    try {
      setError(null);
      const res = await fetchAlertById(alertId);
      if (res.success && res.data) {
        setAlert(res.data.alert);

        // Requirement 24 & 55: If user opens unread alert, mark it as read
        if (!res.data.alert.read_at) {
          markAlertAsRead(alertId).then((readRes) => {
            if (readRes.success && readRes.data) {
              setAlert(readRes.data.alert);
            }
          });
        }
      } else {
        setError(res.message || 'Alert not found');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, [alertId]);

  useEffect(() => {
    loadAlertDetails();
  }, [loadAlertDetails]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading alert details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !alert) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Alert Details</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error || 'Alert not found'}</Text>
          <Button title="Go Back" onPress={onBack} variant="outline" style={{ marginTop: 12 }} />
        </View>
      </SafeAreaView>
    );
  }

  const priorityColor = PRIORITY_COLORS[alert.priority] || '#3b82f6';
  const statusColor = ALERT_STATUS_COLORS[alert.status] || '#6b7280';
  const inc = alert.incident;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Emergency Alert</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Priority & Status Banner */}
        <View style={styles.topBanner}>
          <View style={styles.badgeRow}>
            <View
              style={[
                styles.badge,
                { backgroundColor: `${priorityColor}15`, borderColor: priorityColor, borderWidth: 1 },
              ]}
            >
              <Text style={[styles.badgeText, { color: priorityColor }]}>
                {alert.priority === 'URGENT' ? '🚨 URGENT PRIORITY' : `${alert.priority} PRIORITY`}
              </Text>
            </View>

            {inc?.category && (
              <View style={[styles.badge, { backgroundColor: '#f1f5f9' }]}>
                <Text style={[styles.badgeText, { color: '#334155' }]}>
                  {CATEGORY_LABELS[inc.category as keyof typeof CATEGORY_LABELS] || inc.category}
                </Text>
              </View>
            )}
          </View>

          <View style={[styles.statusBadge, { backgroundColor: `${statusColor}15` }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{alert.status}</Text>
          </View>
        </View>

        {alert.status === 'EXPIRED' && (
          <View style={styles.expiredBanner}>
            <Text style={styles.expiredBannerText}>
              ⌛ This emergency alert has reached its expiration window and is no longer active.
            </Text>
          </View>
        )}

        {/* Incident Details Card */}
        <Card>
          <Text style={styles.incidentTitle}>{inc?.title || 'Safety Alert'}</Text>
          <Text style={styles.incidentDescription}>{inc?.description || 'No description provided.'}</Text>
        </Card>

        {/* Location & Coordinates */}
        {inc && (
          <Card>
            <Text style={styles.sectionTitle}>Incident Location</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Coordinates:</Text>
              <Text style={styles.infoValue}>
                {inc.latitude.toFixed(5)}, {inc.longitude.toFixed(5)}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Incident Status:</Text>
              <Text style={styles.infoValue}>{inc.status}</Text>
            </View>
            {onNavigateMap && (
              <Button
                title="🗺️ View on Neighborhood Map"
                onPress={() => onNavigateMap(inc.latitude, inc.longitude)}
                variant="outline"
                style={{ marginTop: 12 }}
              />
            )}
          </Card>
        )}

        {/* Alert Metadata Card */}
        <Card>
          <Text style={styles.sectionTitle}>Alert Information</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Received:</Text>
            <Text style={styles.infoValue}>
              {new Date(alert.created_at).toLocaleString()}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Expires At:</Text>
            <Text style={styles.infoValue}>
              {new Date(alert.expires_at).toLocaleString()}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Read Status:</Text>
            <Text style={styles.infoValue}>
              {alert.read_at ? `Read at ${new Date(alert.read_at).toLocaleTimeString()}` : 'Unread'}
            </Text>
          </View>
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
    paddingBottom: 40,
    gap: 12,
  },
  topBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  expiredBanner: {
    backgroundColor: '#f1f5f9',
    borderLeftWidth: 4,
    borderLeftColor: '#64748b',
    padding: 12,
    borderRadius: 6,
  },
  expiredBannerText: {
    color: '#475569',
    fontSize: 13,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 8,
  },
  incidentTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  incidentDescription: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  infoLabel: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '600',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    textAlign: 'center',
  },
});
