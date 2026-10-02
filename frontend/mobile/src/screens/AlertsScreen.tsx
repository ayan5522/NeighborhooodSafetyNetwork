import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { fetchUserAlerts } from '../api/client';
import { Button } from '../components/Button';
import {
  Alert,
  PRIORITY_COLORS,
  ALERT_STATUS_COLORS,
} from '../types/alert';
import { CATEGORY_LABELS } from '../types/incident';

interface AlertsScreenProps {
  onBack: () => void;
  onSelectAlert: (alertId: string) => void;
}

export const AlertsScreen: React.FC<AlertsScreenProps> = ({
  onBack,
  onSelectAlert,
}) => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAlerts = useCallback(async () => {
    try {
      setError(null);
      const res = await fetchUserAlerts();
      if (res.success && res.data) {
        setAlerts(res.data.alerts);
      } else {
        setError(res.message || 'Failed to load safety alerts');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const onRefresh = () => {
    setRefreshing(true);
    loadAlerts();
  };

  const renderAlertItem = ({ item }: { item: Alert }) => {
    const priorityColor = PRIORITY_COLORS[item.priority] || '#3b82f6';
    const statusColor = ALERT_STATUS_COLORS[item.status] || '#6b7280';
    const isUnread = !item.read_at;
    const isExpired = item.status === 'EXPIRED';

    return (
      <TouchableOpacity
        style={[styles.card, isUnread && styles.unreadCard]}
        activeOpacity={0.7}
        onPress={() => onSelectAlert(item.id)}
      >
        <View style={styles.cardTop}>
          <View style={styles.badgeRow}>
            {/* Priority Badge */}
            <View
              style={[
                styles.badge,
                { backgroundColor: `${priorityColor}15`, borderColor: priorityColor, borderWidth: 1 },
              ]}
            >
              <Text style={[styles.badgeText, { color: priorityColor }]}>
                {item.priority === 'URGENT' ? '🚨 URGENT' : item.priority}
              </Text>
            </View>

            {/* Category Badge */}
            {item.incident?.category && (
              <View style={[styles.badge, { backgroundColor: '#f3f4f6' }]}>
                <Text style={[styles.badgeText, { color: '#374151' }]}>
                  {CATEGORY_LABELS[item.incident.category as keyof typeof CATEGORY_LABELS] ||
                    item.incident.category}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.statusRow}>
            {isUnread && !isExpired && (
              <View style={styles.unreadDot} />
            )}
            <View style={[styles.statusBadge, { backgroundColor: `${statusColor}15` }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>{item.status}</Text>
            </View>
          </View>
        </View>

        <Text style={[styles.alertTitle, isUnread && styles.unreadText]} numberOfLines={2}>
          {item.incident?.title || 'Safety Alert'}
        </Text>

        {item.incident?.description && (
          <Text style={styles.alertDesc} numberOfLines={2}>
            {item.incident.description}
          </Text>
        )}

        <View style={styles.cardFooter}>
          <Text style={styles.timeText}>
            ⏱️ {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} •{' '}
            {new Date(item.created_at).toLocaleDateString()}
          </Text>
          {isUnread && !isExpired ? (
            <Text style={styles.newAlertTag}>NEW</Text>
          ) : (
            <Text style={styles.readTag}>Tap for details →</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>← Home</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Emergency Alerts</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Main Alert List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Fetching neighborhood alerts...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Button title="Try Again" onPress={loadAlerts} variant="outline" style={{ marginTop: 12 }} />
        </View>
      ) : (
        <FlatList
          data={alerts}
          keyExtractor={(item) => item.id}
          renderItem={renderAlertItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563eb']} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🛡️</Text>
              <Text style={styles.emptyTitle}>All Clear</Text>
              <Text style={styles.emptySubtitle}>
                There are no active emergency alerts in your immediate neighborhood radius.
              </Text>
            </View>
          }
        />
      )}
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
  listContainer: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  unreadCard: {
    borderColor: '#93c5fd',
    backgroundColor: '#f8fafc',
    borderLeftWidth: 4,
    borderLeftColor: '#2563eb',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2563eb',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  unreadText: {
    fontWeight: 'bold',
    color: '#111827',
  },
  alertDesc: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 18,
    marginBottom: 8,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  timeText: {
    fontSize: 11,
    color: '#6b7280',
  },
  newAlertTag: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
  },
  readTag: {
    fontSize: 11,
    color: '#9ca3af',
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
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    fontSize: 54,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
});
