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
import { fetchModerationReports } from '../api/client';
import { ModerationQueueItem, ReportStatus, ReportReason } from '../types/admin';
import { CATEGORY_LABELS, SEVERITY_COLORS, IncidentSeverity } from '../types/incident';

interface ModerationQueueScreenProps {
  onBack: () => void;
  onSelectReport: (reportId: string) => void;
}

const REASON_ICONS: Record<ReportReason, string> = {
  FALSE_INFORMATION: '❌',
  SPAM: '🚫',
  DUPLICATE: '📑',
  INAPPROPRIATE_CONTENT: '⚠️',
  MISLEADING: '❓',
  OTHER: 'ℹ️',
};

const STATUS_COLORS: Record<ReportStatus, string> = {
  PENDING: '#dc2626',
  REVIEWED: '#2563eb',
  ACTION_TAKEN: '#16a34a',
  DISMISSED: '#64748b',
};

export const ModerationQueueScreen: React.FC<ModerationQueueScreenProps> = ({
  onBack,
  onSelectReport,
}) => {
  const [reports, setReports] = useState<ModerationQueueItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedStatus, setSelectedStatus] = useState<string>('PENDING');
  const [selectedReason, setSelectedReason] = useState<string>('');

  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchModerationReports(
        selectedStatus || undefined,
        selectedReason || undefined,
        page,
        20
      );

      if (res.success && res.data) {
        setReports(res.data.reports);
        setTotal(res.data.total);
      }
    } catch (err) {
      console.error('[ModerationQueue] Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedStatus, selectedReason, page]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const renderReportItem = ({ item }: { item: ModerationQueueItem }) => {
    const statusColor = STATUS_COLORS[item.status] || '#64748b';
    const severityColor = SEVERITY_COLORS[item.incident_severity as IncidentSeverity] || '#64748b';
    const reasonIcon = REASON_ICONS[item.reason] || '⚠️';

    return (
      <TouchableOpacity
        style={[styles.reportCard, item.status === 'PENDING' && styles.pendingReportCard]}
        activeOpacity={0.7}
        onPress={() => onSelectReport(item.id)}
      >
        <View style={styles.cardTopRow}>
          <View style={styles.badgeRow}>
            {/* Reason Badge */}
            <View style={styles.reasonBadge}>
              <Text style={styles.reasonBadgeText}>
                {reasonIcon} {item.reason.replace('_', ' ')}
              </Text>
            </View>

            {/* Severity Badge */}
            <View
              style={[
                styles.severityBadge,
                { backgroundColor: `${severityColor}15`, borderColor: severityColor },
              ]}
            >
              <Text style={[styles.severityBadgeText, { color: severityColor }]}>
                {item.incident_severity}
              </Text>
            </View>
          </View>

          {/* Status Badge */}
          <View style={[styles.statusBadge, { backgroundColor: `${statusColor}15` }]}>
            <Text style={[styles.statusBadgeText, { color: statusColor }]}>
              {item.status.replace('_', ' ')}
            </Text>
          </View>
        </View>

        <Text style={styles.incidentTitle} numberOfLines={2}>
          {item.incident_title}
        </Text>

        {item.description ? (
          <Text style={styles.reportDesc} numberOfLines={2}>
            "{item.description}"
          </Text>
        ) : null}

        <View style={styles.cardFooter}>
          <View style={styles.footerInfo}>
            <Text style={styles.metaTime}>
              ⏱️ {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} •{' '}
              {new Date(item.created_at).toLocaleDateString()}
            </Text>
            {item.incident_report_count > 1 && (
              <Text style={styles.multiReportTag}>
                🚩 {item.incident_report_count} community flags
              </Text>
            )}
          </View>
          <Text style={styles.reviewPrompt}>Review Details →</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>← Dashboard</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Moderation Queue</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Status Filter Tabs */}
      <View style={styles.filterTabsRow}>
        {(['PENDING', 'REVIEWED', 'ACTION_TAKEN', 'DISMISSED', ''] as const).map((st) => (
          <TouchableOpacity
            key={st || 'ALL_STATUS'}
            style={[styles.tabButton, selectedStatus === st && styles.tabButtonActive]}
            onPress={() => {
              setSelectedStatus(st);
              setPage(1);
            }}
          >
            <Text
              style={[
                styles.tabButtonText,
                selectedStatus === st && styles.tabButtonTextActive,
              ]}
            >
              {st ? st.replace('_', ' ') : 'All'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Meta Count */}
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>
          {total} {total === 1 ? 'report' : 'reports'} in queue
        </Text>
        {selectedStatus === 'PENDING' && total > 0 && (
          <Text style={styles.priorityNote}>⚡ Immediate attention needed</Text>
        )}
      </View>

      {/* Queue List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4338ca" />
          <Text style={styles.loadingText}>Fetching moderation queue...</Text>
        </View>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(item) => item.id}
          renderItem={renderReportItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={loadReports} colors={['#4338ca']} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🛡️</Text>
              <Text style={styles.emptyTitle}>Queue is Clean</Text>
              <Text style={styles.emptySubtitle}>
                No reports matching the selected criteria in the moderation queue.
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  filterTabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 6,
  },
  tabButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
  },
  tabButtonActive: {
    backgroundColor: '#4338ca',
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  tabButtonTextActive: {
    color: '#ffffff',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  metaText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  priorityNote: {
    fontSize: 11,
    fontWeight: '700',
    color: '#dc2626',
  },
  listContainer: {
    padding: 14,
    paddingBottom: 40,
  },
  reportCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  pendingReportCard: {
    borderColor: '#fca5a5',
    backgroundColor: '#fffdfd',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reasonBadge: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  reasonBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#991b1b',
  },
  severityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  severityBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  incidentTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  reportDesc: {
    fontSize: 13,
    color: '#475569',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  footerInfo: {
    flex: 1,
  },
  metaTime: {
    fontSize: 11,
    color: '#94a3b8',
  },
  multiReportTag: {
    fontSize: 11,
    fontWeight: '700',
    color: '#dc2626',
    marginTop: 2,
  },
  reviewPrompt: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4338ca',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 10,
    color: '#64748b',
    fontSize: 14,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
});
