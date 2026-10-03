import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { fetchAdminDashboard } from '../api/client';
import { DashboardStats } from '../types/admin';
import { Button } from '../components/Button';
import { Card } from '../components/Card';

interface AdminDashboardScreenProps {
  onBack: () => void;
  onNavigateUserManagement?: () => void;
  onNavigateModerationQueue: () => void;
  onNavigateAuditLogs?: () => void;
}

export const AdminDashboardScreen: React.FC<AdminDashboardScreenProps> = ({
  onBack,
  onNavigateUserManagement,
  onNavigateModerationQueue,
  onNavigateAuditLogs,
}) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      setError(null);
      const res = await fetchAdminDashboard();
      if (res.success && res.data) {
        setStats(res.data);
      } else {
        setError(res.message || 'Failed to load dashboard statistics');
      }
    } catch (err: any) {
      setError(err.message || 'Network error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Fetching database metrics...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>← Home</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Dashboard</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
          <Button title="Retry" onPress={loadDashboard} variant="primary" style={{ marginTop: 12 }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>← Home</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isAdmin ? 'Admin Dashboard' : 'Moderator Dashboard'}
        </Text>
        <TouchableOpacity style={styles.refreshButton} onPress={loadDashboard}>
          <Text style={styles.refreshText}>🔄</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadDashboard} colors={['#2563eb']} />
        }
      >
        {/* Navigation Quick Actions */}
        <View style={styles.quickActionsRow}>
          {isAdmin && onNavigateUserManagement && (
            <TouchableOpacity
              style={[styles.actionCard, { backgroundColor: '#1e3a8a' }]}
              onPress={onNavigateUserManagement}
            >
              <Text style={styles.actionIcon}>👥</Text>
              <Text style={styles.actionTitle}>User Management</Text>
              <Text style={styles.actionSubtitle}>Roles & Account Access</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: '#4338ca' }]}
            onPress={onNavigateModerationQueue}
          >
            <Text style={styles.actionIcon}>⚖️</Text>
            <Text style={styles.actionTitle}>Moderation Queue</Text>
            <Text style={styles.actionSubtitle}>
              {stats?.reports?.pending ? `${stats.reports.pending} Pending Flags` : 'Review Reports'}
            </Text>
          </TouchableOpacity>

          {isAdmin && onNavigateAuditLogs && (
            <TouchableOpacity
              style={[styles.actionCard, { backgroundColor: '#0f766e' }]}
              onPress={onNavigateAuditLogs}
            >
              <Text style={styles.actionIcon}>🛡️</Text>
              <Text style={styles.actionTitle}>Audit Logs</Text>
              <Text style={styles.actionSubtitle}>Security & Activity Trail</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* User Account Overview (ADMIN only) */}
        {isAdmin && stats?.users && (
          <Card>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.sectionTitle}>User Directory</Text>
              <View style={styles.roleTag}>
                <Text style={styles.roleTagText}>ADMIN ONLY</Text>
              </View>
            </View>

            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{stats.users.total}</Text>
                <Text style={styles.statLabel}>Total Users</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statNumber, { color: '#16a34a' }]}>{stats.users.active}</Text>
                <Text style={styles.statLabel}>Active</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statNumber, { color: '#dc2626' }]}>{stats.users.suspended}</Text>
                <Text style={styles.statLabel}>Suspended</Text>
              </View>
            </View>
          </Card>
        )}

        {/* Moderation Reports Overview */}
        <Card>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.sectionTitle}>Community Flags & Moderation</Text>
            <Text style={styles.liveTag}>LIVE DB</Text>
          </View>

          <View style={styles.statsGrid}>
            <View style={[styles.statBox, styles.pendingBox]}>
              <Text style={[styles.statNumber, { color: '#dc2626' }]}>
                {stats?.reports?.pending || 0}
              </Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statNumber, { color: '#2563eb' }]}>
                {stats?.reports?.reviewed || 0}
              </Text>
              <Text style={styles.statLabel}>Reviewed</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statNumber, { color: '#16a34a' }]}>
                {stats?.reports?.action_taken || 0}
              </Text>
              <Text style={styles.statLabel}>Action Taken</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statNumber, { color: '#6b7280' }]}>
                {stats?.reports?.dismissed || 0}
              </Text>
              <Text style={styles.statLabel}>Dismissed</Text>
            </View>
          </View>
        </Card>

        {/* Incident Summary */}
        <Card>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.sectionTitle}>Incident Reporting Metrics</Text>
            <Text style={styles.countTag}>{stats?.incidents?.total || 0} Total</Text>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={[styles.statNumber, { color: '#ea580c' }]}>
                {stats?.incidents?.active || 0}
              </Text>
              <Text style={styles.statLabel}>Active</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statNumber, { color: '#eab308' }]}>
                {stats?.incidents?.pending || 0}
              </Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statNumber, { color: '#16a34a' }]}>
                {stats?.incidents?.resolved || 0}
              </Text>
              <Text style={styles.statLabel}>Resolved</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statNumber, { color: '#6b7280' }]}>
                {stats?.incidents?.cancelled || 0}
              </Text>
              <Text style={styles.statLabel}>Cancelled</Text>
            </View>
          </View>
        </Card>

        {/* Alerts & Verification */}
        <Card>
          <Text style={styles.sectionTitle}>Safety Network Health</Text>
          <View style={styles.healthRow}>
            <Text style={styles.healthLabel}>🚨 Active Emergency Alerts:</Text>
            <Text style={styles.healthValue}>{stats?.alerts?.active || 0}</Text>
          </View>
          <View style={styles.healthRow}>
            <Text style={styles.healthLabel}>🤝 Community Confirmations:</Text>
            <Text style={[styles.healthValue, { color: '#16a34a' }]}>
              {stats?.verification?.confirmations || 0}
            </Text>
          </View>
          <View style={styles.healthRow}>
            <Text style={styles.healthLabel}>⚖️ Community Disputes:</Text>
            <Text style={[styles.healthValue, { color: '#ea580c' }]}>
              {stats?.verification?.disputes || 0}
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  refreshButton: {
    padding: 6,
  },
  refreshText: {
    fontSize: 18,
  },
  scrollContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  actionCard: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionIcon: {
    fontSize: 26,
    marginBottom: 6,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 2,
  },
  actionSubtitle: {
    fontSize: 12,
    color: '#cbd5e1',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  roleTag: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  roleTagText: {
    color: '#991b1b',
    fontSize: 10,
    fontWeight: '800',
  },
  liveTag: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16a34a',
  },
  countTag: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  statBox: {
    flex: 1,
    minWidth: '22%',
    backgroundColor: '#f8fafc',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  pendingBox: {
    borderColor: '#fca5a5',
    backgroundColor: '#fff1f2',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  healthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  healthLabel: {
    fontSize: 14,
    color: '#475569',
  },
  healthValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
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
  errorText: {
    fontSize: 14,
    color: '#dc2626',
    textAlign: 'center',
  },
});
