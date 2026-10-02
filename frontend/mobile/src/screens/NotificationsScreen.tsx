import React from 'react';
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
import { useNotifications } from '../context/NotificationContext';
import { NotificationRecord, NotificationType } from '../types/notification';

interface NotificationsScreenProps {
  onBack: () => void;
  onSelectAlert?: (alertId: string) => void;
  onSelectIncident?: (incidentId: string) => void;
}

const TYPE_ICONS: Record<NotificationType, string> = {
  ALERT_CREATED: '🚨',
  ALERT_UPDATED: '⚠️',
  ALERT_RESOLVED: '✅',
  INCIDENT_NEARBY: '📍',
  SOS_NOTIFICATION: '🆘',
  COMMUNITY_VERIFICATION: '🤝',
  SYSTEM: 'ℹ️',
};

const TYPE_LABELS: Record<NotificationType, string> = {
  ALERT_CREATED: 'EMERGENCY ALERT',
  ALERT_UPDATED: 'ALERT UPDATE',
  ALERT_RESOLVED: 'ALERT RESOLVED',
  INCIDENT_NEARBY: 'NEARBY INCIDENT',
  SOS_NOTIFICATION: 'EMERGENCY SOS',
  COMMUNITY_VERIFICATION: 'VERIFICATION',
  SYSTEM: 'SYSTEM NOTICE',
};

const TYPE_COLORS: Record<NotificationType, string> = {
  ALERT_CREATED: '#dc2626',
  ALERT_UPDATED: '#ea580c',
  ALERT_RESOLVED: '#16a34a',
  INCIDENT_NEARBY: '#2563eb',
  SOS_NOTIFICATION: '#b91c1c',
  COMMUNITY_VERIFICATION: '#7c3aed',
  SYSTEM: '#4b5563',
};

export const NotificationsScreen: React.FC<NotificationsScreenProps> = ({
  onBack,
  onSelectAlert,
  onSelectIncident,
}) => {
  const {
    notifications,
    unreadCount,
    loading,
    isSocketConnected,
    refreshNotifications,
    markAsRead,
    markAllAsRead,
  } = useNotifications();

  const handlePressItem = async (item: NotificationRecord) => {
    if (!item.is_read) {
      await markAsRead(item.id);
    }

    if (item.alert_id && onSelectAlert) {
      onSelectAlert(item.alert_id);
    } else if (item.incident_id && onSelectIncident) {
      onSelectIncident(item.incident_id);
    }
  };

  const renderNotificationItem = ({ item }: { item: NotificationRecord }) => {
    const icon = TYPE_ICONS[item.type] || '🔔';
    const label = TYPE_LABELS[item.type] || item.type;
    const accentColor = TYPE_COLORS[item.type] || '#2563eb';
    const isUnread = !item.is_read;

    return (
      <TouchableOpacity
        style={[styles.card, isUnread && styles.unreadCard]}
        activeOpacity={0.7}
        onPress={() => handlePressItem(item)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.typeBadgeContainer}>
            <View
              style={[
                styles.typeBadge,
                { backgroundColor: `${accentColor}15`, borderColor: accentColor },
              ]}
            >
              <Text style={[styles.typeBadgeText, { color: accentColor }]}>
                {icon} {label}
              </Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            {isUnread && <View style={styles.unreadDot} />}
            <Text style={styles.timeText}>
              {new Date(item.created_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </View>
        </View>

        <Text style={[styles.titleText, isUnread && styles.unreadTitleText]}>
          {item.title}
        </Text>

        <Text style={styles.bodyText} numberOfLines={3}>
          {item.body}
        </Text>

        <View style={styles.cardFooter}>
          <Text style={styles.dateText}>
            {new Date(item.created_at).toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </Text>
          {(item.alert_id || item.incident_id) && (
            <Text style={[styles.actionTag, { color: accentColor }]}>
              View details →
            </Text>
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
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.titleContainer}>
          <Text style={styles.headerTitle}>Notifications</Text>
          <View style={styles.socketStatusRow}>
            <View
              style={[
                styles.socketIndicator,
                { backgroundColor: isSocketConnected ? '#22c55e' : '#9ca3af' },
              ]}
            />
            <Text style={styles.socketStatusText}>
              {isSocketConnected ? 'Real-time active' : 'Offline sync'}
            </Text>
          </View>
        </View>

        {unreadCount > 0 ? (
          <TouchableOpacity
            style={styles.markAllButton}
            onPress={markAllAsRead}
          >
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      {/* List */}
      {loading && notifications.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Fetching notifications...</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderNotificationItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={refreshNotifications}
              colors={['#2563eb']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🔔</Text>
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptySubtitle}>
                You will receive real-time notifications when nearby incidents, emergency alerts, or verification updates occur.
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
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
  },
  backButtonText: {
    color: '#334155',
    fontWeight: '600',
    fontSize: 14,
  },
  titleContainer: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  socketStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  socketIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  socketStatusText: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '500',
  },
  markAllButton: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  markAllText: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '600',
  },
  listContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  unreadCard: {
    borderColor: '#bfdbfe',
    backgroundColor: '#f0f7ff',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  typeBadgeContainer: {
    flexDirection: 'row',
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2563eb',
    marginRight: 6,
  },
  timeText: {
    fontSize: 12,
    color: '#64748b',
  },
  titleText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  unreadTitleText: {
    fontWeight: '700',
    color: '#0f172a',
  },
  bodyText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
    marginBottom: 10,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  dateText: {
    fontSize: 11,
    color: '#94a3b8',
  },
  actionTag: {
    fontSize: 12,
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
    color: '#64748b',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
  },
});
