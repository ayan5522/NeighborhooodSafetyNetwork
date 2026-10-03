import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { fetchUnreadAlertCount } from '../api/client';
import { Button } from '../components/Button';
import { Card } from '../components/Card';

interface HomeScreenProps {
  onNavigateProfile: () => void;
  onNavigateMap: () => void;
  onNavigateReport: () => void;
  onNavigateMyReports: () => void;
  onNavigateAlerts: () => void;
  onNavigateEmergency: () => void;
  onNavigateNotifications: () => void;
  onNavigateAdminDashboard?: () => void;
  onNavigateUserManagement?: () => void;
  onNavigateModerationQueue?: () => void;
  onNavigateAuditLogs?: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onNavigateProfile,
  onNavigateMap,
  onNavigateReport,
  onNavigateMyReports,
  onNavigateAlerts,
  onNavigateEmergency,
  onNavigateNotifications,
  onNavigateAdminDashboard,
  onNavigateUserManagement,
  onNavigateModerationQueue,
  onNavigateAuditLogs,
}) => {
  const { user, logout } = useAuth();
  const { unreadCount: unreadNotifCount, isSocketConnected } = useNotifications();
  const [unreadAlertCount, setUnreadAlertCount] = useState<number>(0);

  useEffect(() => {
    fetchUnreadAlertCount().then((res) => {
      if (res.success && res.data) {
        setUnreadAlertCount(res.data.count);
      }
    });
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <View>
            <Text style={styles.welcomeText}>Welcome back,</Text>
            <Text style={styles.userName}>{user?.full_name || 'Resident'}</Text>
          </View>
          <View style={styles.liveBadge}>
            <View
              style={[
                styles.liveDot,
                { backgroundColor: isSocketConnected ? '#22c55e' : '#9ca3af' },
              ]}
            />
            <Text style={styles.liveText}>
              {isSocketConnected ? 'Real-Time Connected' : 'Offline Mode'}
            </Text>
          </View>
        </View>

        {/* Emergency SOS Quick Banner */}
        <Card>
          <View style={styles.emergencyCardHeader}>
            <Text style={styles.emergencyCardTitle}>Personal Safety & SOS</Text>
            <Text style={styles.emergencyCardBadge}>EMERGENCY</Text>
          </View>
          <Text style={styles.emergencyCardDesc}>
            Need immediate help? Trigger personal emergency SOS or access 112 calling.
          </Text>
          <Button
            title="🚨 Emergency / SOS Assistance"
            onPress={onNavigateEmergency}
            variant="danger"
            style={{ marginTop: 8 }}
          />
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Account Overview</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email:</Text>
            <Text style={styles.infoValue}>{user?.email}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Role:</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{user?.role}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Account Status:</Text>
            <View style={[styles.badge, styles.activeBadge]}>
              <Text style={styles.activeBadgeText}>{user?.account_status}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Member Since:</Text>
            <Text style={styles.infoValue}>
              {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
            </Text>
          </View>
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Neighborhood Safety Actions</Text>
          <View style={styles.incidentActionGrid}>
            <Button
              title={
                unreadNotifCount > 0
                  ? `📨 Notifications (${unreadNotifCount} NEW)`
                  : '📨 Notifications'
              }
              onPress={onNavigateNotifications}
              variant={unreadNotifCount > 0 ? 'primary' : 'outline'}
            />
            <Button
              title={
                unreadAlertCount > 0
                  ? `🔔 Emergency Alerts (${unreadAlertCount} NEW)`
                  : '🔔 Emergency Alerts'
              }
              onPress={onNavigateAlerts}
              variant="outline"
            />
            <Button
              title="⚠️ Report Safety Incident"
              onPress={onNavigateReport}
              variant="outline"
            />
            <Button
              title="📋 My Reported Incidents"
              onPress={onNavigateMyReports}
              variant="outline"
            />
            <Button
              title="🗺️ Open Neighborhood Map"
              onPress={onNavigateMap}
              variant="outline"
            />
          </View>
        </Card>

        {/* Module 07: Administrative & Moderation Controls (Role-Protected) */}
        {user?.role === 'ADMIN' && (
          <Card>
            <View style={styles.emergencyCardHeader}>
              <Text style={[styles.emergencyCardTitle, { color: '#1e3a8a' }]}>
                🛡️ Administrator Panel
              </Text>
              <Text style={[styles.emergencyCardBadge, { backgroundColor: '#dbeafe', color: '#1d4ed8' }]}>
                ADMIN
              </Text>
            </View>
            <Text style={styles.emergencyCardDesc}>
              Administrative privileges active: user account governance, role assignment, and moderation oversight.
            </Text>
            <View style={{ gap: 8, marginTop: 8 }}>
              {onNavigateAdminDashboard && (
                <Button
                  title="📊 Admin Statistics Dashboard"
                  onPress={onNavigateAdminDashboard}
                  variant="primary"
                />
              )}
              {onNavigateUserManagement && (
                <Button
                  title="👥 User Management & Roles"
                  onPress={onNavigateUserManagement}
                  variant="outline"
                />
              )}
              {onNavigateModerationQueue && (
                <Button
                  title="⚖️ Moderation Queue"
                  onPress={onNavigateModerationQueue}
                  variant="outline"
                />
              )}
              {onNavigateAuditLogs && (
                <Button
                  title="🛡️ Audit & Security Logs"
                  onPress={onNavigateAuditLogs}
                  variant="outline"
                />
              )}
            </View>
          </Card>
        )}

        {user?.role === 'MODERATOR' && (
          <Card>
            <View style={styles.emergencyCardHeader}>
              <Text style={[styles.emergencyCardTitle, { color: '#4338ca' }]}>
                ⚖️ Moderation Panel
              </Text>
              <Text style={[styles.emergencyCardBadge, { backgroundColor: '#e0e7ff', color: '#4338ca' }]}>
                MODERATOR
              </Text>
            </View>
            <Text style={styles.emergencyCardDesc}>
              Moderator privileges active: review community flags, verify incident authenticity, and resolve queue items.
            </Text>
            <View style={{ gap: 8, marginTop: 8 }}>
              {onNavigateModerationQueue && (
                <Button
                  title="⚖️ Open Moderation Queue"
                  onPress={onNavigateModerationQueue}
                  variant="primary"
                />
              )}
              {onNavigateAdminDashboard && (
                <Button
                  title="📊 Moderation Metrics"
                  onPress={onNavigateAdminDashboard}
                  variant="outline"
                />
              )}
            </View>
          </Card>
        )}

        <Card>
          <Text style={styles.cardTitle}>Neighborhood Safety Network</Text>
          <Text style={styles.networkStatus}>
            🟢 Modules 1 to 8 Fully Operational
          </Text>
          <Text style={styles.networkSubtext}>
            Auth, Location, Incidents, Alerts, Verification, Notifications, Admin & Moderation, Audit Logs & Security Hardening.
          </Text>
        </Card>

        <View style={styles.actionButtons}>
          <Button
            title="Edit Profile"
            onPress={onNavigateProfile}
            variant="outline"
          />
          <Button
            title="Sign Out"
            onPress={logout}
            variant="danger"
          />
        </View>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  welcomeText: {
    fontSize: 16,
    color: '#6b7280',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 2,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  liveText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4b5563',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  infoLabel: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
  },
  badge: {
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    color: '#3730a3',
    fontSize: 12,
    fontWeight: '700',
  },
  activeBadge: {
    backgroundColor: '#dcfce7',
  },
  activeBadgeText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '700',
  },
  networkStatus: {
    fontSize: 14,
    color: '#15803d',
    fontWeight: '600',
    marginBottom: 6,
  },
  networkSubtext: {
    fontSize: 13,
    color: '#6b7280',
  },
  emergencyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  emergencyCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#991b1b',
  },
  emergencyCardBadge: {
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  emergencyCardDesc: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
    marginBottom: 4,
  },
  incidentActionGrid: {
    gap: 10,
    marginTop: 4,
  },
  actionButtons: {
    marginTop: 10,
    gap: 8,
  },
});
