import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
  TextInput,
  RefreshControl,
  SafeAreaView,
  Platform,
} from 'react-native';
import { fetchAuditLogs, fetchAuditLogById } from '../api/client';
import { AuditLogRecord } from '../types/audit';

interface AuditLogsScreenProps {
  onBack?: () => void;
}

const ENTITY_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Auth', value: 'auth' },
  { label: 'User', value: 'user' },
  { label: 'Incident', value: 'incident' },
  { label: 'Moderation', value: 'moderation_report' },
  { label: 'Notification', value: 'notification' },
];

export const AuditLogsScreen: React.FC<AuditLogsScreenProps> = ({ onBack }) => {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination
  const [selectedEntity, setSelectedEntity] = useState<string>('');
  const [searchAction, setSearchAction] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Detail Modal
  const [selectedLog, setSelectedLog] = useState<AuditLogRecord | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadAuditLogs = useCallback(
    async (page: number = 1, showSpinner: boolean = true) => {
      if (showSpinner) setLoading(true);
      setError(null);

      try {
        const filters: any = {};
        if (selectedEntity) {
          filters.entity_type = selectedEntity;
        }
        if (searchAction.trim()) {
          filters.action = searchAction.trim().toUpperCase();
        }

        const res = await fetchAuditLogs(filters, page, 20);

        if (res.success && res.data) {
          setLogs(res.data.logs);
          setCurrentPage(res.data.page);
          setTotalPages(res.data.total_pages);
          setTotalCount(res.data.total);
        } else {
          setError(res.message || 'Failed to load audit logs');
        }
      } catch (err: any) {
        setError(err.message || 'An unexpected error occurred loading logs');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedEntity, searchAction]
  );

  useEffect(() => {
    loadAuditLogs(1);
  }, [loadAuditLogs]);

  const onRefresh = () => {
    setRefreshing(true);
    loadAuditLogs(currentPage, false);
  };

  const handleOpenDetail = async (item: AuditLogRecord) => {
    setSelectedLog(item);
    setModalVisible(true);
    setDetailLoading(true);

    try {
      const res = await fetchAuditLogById(item.id);
      if (res.success && res.data?.log) {
        setSelectedLog(res.data.log);
      }
    } catch {
      // Use existing item if network lookup fails
    } finally {
      setDetailLoading(false);
    }
  };

  const getActionBadgeColor = (action: string) => {
    if (action.startsWith('USER_LOGIN') || action.startsWith('USER_REG') || action.startsWith('PASSWORD')) {
      return { bg: '#e0e7ff', text: '#3730a3' }; // Indigo
    }
    if (action.startsWith('INCIDENT_VER')) {
      return { bg: '#dcfce7', text: '#166534' }; // Green
    }
    if (action.startsWith('INCIDENT')) {
      return { bg: '#fef3c7', text: '#92400e' }; // Amber
    }
    if (action.startsWith('ALERT') || action.startsWith('SOS')) {
      return { bg: '#fee2e2', text: '#991b1b' }; // Red
    }
    if (action.startsWith('MODERATION') || action.startsWith('USER_SUSP') || action.startsWith('USER_ROLE')) {
      return { bg: '#f3e8ff', text: '#6b21a8' }; // Purple
    }
    return { bg: '#f1f5f9', text: '#334155' }; // Slate
  };

  const formatTimestamp = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateString;
    }
  };

  const renderLogItem = ({ item }: { item: AuditLogRecord }) => {
    const badge = getActionBadgeColor(item.action);

    return (
      <TouchableOpacity
        style={styles.logCard}
        onPress={() => handleOpenDetail(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.badgeText, { color: badge.text }]}>{item.action}</Text>
          </View>
          <Text style={styles.timestamp}>{formatTimestamp(item.created_at)}</Text>
        </View>

        <Text style={styles.descriptionText} numberOfLines={2}>
          {item.description}
        </Text>

        <View style={styles.cardFooter}>
          <Text style={styles.actorText}>
            👤 {item.actor_name || item.actor_email || 'System / Automated'}
          </Text>
          <Text style={styles.entityTag}>
            {item.entity_type} {item.entity_id ? `(#${item.entity_id.slice(0, 8)})` : ''}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
        )}
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Audit & Security Logs</Text>
          <Text style={styles.headerSubtitle}>{totalCount} total logged events</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshIconBtn}>
          <Text style={styles.refreshIconText}>🔄</Text>
        </TouchableOpacity>
      </View>

      {/* Entity Filters */}
      <View style={styles.filterContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {ENTITY_FILTERS.map((f) => {
            const isSelected = selectedEntity === f.value;
            return (
              <TouchableOpacity
                key={f.label}
                style={[styles.filterChip, isSelected && styles.filterChipActive]}
                onPress={() => {
                  setSelectedEntity(f.value);
                  setCurrentPage(1);
                }}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    isSelected && styles.filterChipTextActive,
                  ]}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Search Bar */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Filter by action (e.g. LOGIN, SUSPEND, INCIDENT)..."
          placeholderTextColor="#94a3b8"
          value={searchAction}
          onChangeText={setSearchAction}
          onSubmitEditing={() => loadAuditLogs(1)}
          returnKeyType="search"
          autoCapitalize="characters"
        />
        {searchAction.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              setSearchAction('');
              loadAuditLogs(1);
            }}
            style={styles.clearSearchBtn}
          >
            <Text style={styles.clearSearchText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Main List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading audit logs...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Failed to Load Logs</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => loadAuditLogs(currentPage)}
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item) => item.id}
          renderItem={renderLogItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🛡️</Text>
              <Text style={styles.emptyTitle}>No Audit Records Found</Text>
              <Text style={styles.emptyMessage}>
                No events matched the selected entity or search query.
              </Text>
            </View>
          }
        />
      )}

      {/* Pagination Footer */}
      {!loading && totalPages > 1 && (
        <View style={styles.paginationBar}>
          <TouchableOpacity
            style={[styles.pageBtn, currentPage <= 1 && styles.pageBtnDisabled]}
            disabled={currentPage <= 1}
            onPress={() => loadAuditLogs(currentPage - 1)}
          >
            <Text style={styles.pageBtnText}>‹ Previous</Text>
          </TouchableOpacity>

          <Text style={styles.pageInfo}>
            Page {currentPage} of {totalPages}
          </Text>

          <TouchableOpacity
            style={[
              styles.pageBtn,
              currentPage >= totalPages && styles.pageBtnDisabled,
            ]}
            disabled={currentPage >= totalPages}
            onPress={() => loadAuditLogs(currentPage + 1)}
          >
            <Text style={styles.pageBtnText}>Next ›</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Detail Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Audit Event Details</Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {detailLoading ? (
              <View style={styles.modalCenter}>
                <ActivityIndicator size="small" color="#2563eb" />
              </View>
            ) : selectedLog ? (
              <ScrollView style={styles.modalScroll}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Action:</Text>
                  <Text style={styles.detailValueBold}>{selectedLog.action}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Timestamp:</Text>
                  <Text style={styles.detailValue}>
                    {formatTimestamp(selectedLog.created_at)}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Description:</Text>
                  <Text style={styles.detailValue}>{selectedLog.description}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Actor:</Text>
                  <Text style={styles.detailValue}>
                    {selectedLog.actor_name
                      ? `${selectedLog.actor_name} (${selectedLog.actor_email})`
                      : selectedLog.actor_email || 'System / Automated'}
                  </Text>
                </View>

                {selectedLog.actor_user_id && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Actor User ID:</Text>
                    <Text style={styles.detailValueMono}>
                      {selectedLog.actor_user_id}
                    </Text>
                  </View>
                )}

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Entity Type:</Text>
                  <Text style={styles.detailValue}>{selectedLog.entity_type}</Text>
                </View>

                {selectedLog.entity_id && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Entity ID:</Text>
                    <Text style={styles.detailValueMono}>
                      {selectedLog.entity_id}
                    </Text>
                  </View>
                )}

                {selectedLog.ip_address && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Client IP:</Text>
                    <Text style={styles.detailValue}>{selectedLog.ip_address}</Text>
                  </View>
                )}

                {selectedLog.user_agent && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>User Agent:</Text>
                    <Text style={styles.detailValueSmall} numberOfLines={2}>
                      {selectedLog.user_agent}
                    </Text>
                  </View>
                )}

                <View style={styles.metadataSection}>
                  <Text style={styles.metadataLabel}>Sanitized Event Metadata:</Text>
                  <View style={styles.jsonBox}>
                    <Text style={styles.jsonText}>
                      {JSON.stringify(selectedLog.metadata, null, 2)}
                    </Text>
                  </View>
                </View>
              </ScrollView>
            ) : null}

            <TouchableOpacity
              style={styles.modalDoneBtn}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.modalDoneBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backButton: {
    marginRight: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
  },
  backButtonText: {
    fontSize: 14,
    color: '#334155',
    fontWeight: '600',
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  refreshIconBtn: {
    padding: 8,
  },
  refreshIconText: {
    fontSize: 18,
  },
  filterContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  filterScroll: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#2563eb',
  },
  filterChipText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    height: 38,
    fontSize: 13,
    color: '#0f172a',
  },
  clearSearchBtn: {
    padding: 6,
  },
  clearSearchText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  listContent: {
    padding: 16,
    paddingBottom: 24,
  },
  logCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  timestamp: {
    fontSize: 11,
    color: '#94a3b8',
  },
  descriptionText: {
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '500',
    marginBottom: 10,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 8,
  },
  actorText: {
    fontSize: 12,
    color: '#475569',
    flex: 1,
    marginRight: 8,
  },
  entityTag: {
    fontSize: 11,
    color: '#64748b',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
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
  errorIcon: {
    fontSize: 36,
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#b91c1c',
    marginBottom: 6,
  },
  errorMessage: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 6,
  },
  retryBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  emptyContainer: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  emptyMessage: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  paginationBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  pageBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
  },
  pageBtnDisabled: {
    opacity: 0.4,
  },
  pageBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  pageInfo: {
    fontSize: 13,
    color: '#64748b',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalCloseText: {
    fontSize: 18,
    color: '#64748b',
  },
  modalCenter: {
    padding: 32,
    alignItems: 'center',
  },
  modalScroll: {
    marginBottom: 16,
  },
  detailRow: {
    marginBottom: 10,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    color: '#1e293b',
  },
  detailValueBold: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  detailValueMono: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#475569',
  },
  detailValueSmall: {
    fontSize: 12,
    color: '#64748b',
  },
  metadataSection: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 12,
  },
  metadataLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
  },
  jsonBox: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 12,
  },
  jsonText: {
    color: '#38bdf8',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  modalDoneBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalDoneBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
});
