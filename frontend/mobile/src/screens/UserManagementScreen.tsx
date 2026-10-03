import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import {
  fetchAdminUsers,
  suspendUser,
  restoreUser,
  changeUserRole,
} from '../api/client';
import { UserSummary, UserRole, AccountStatus } from '../types/admin';
import { Button } from '../components/Button';

interface UserManagementScreenProps {
  onBack: () => void;
}

export const UserManagementScreen: React.FC<UserManagementScreenProps> = ({ onBack }) => {
  const { user: currentAdmin } = useAuth();

  const [users, setUsers] = useState<UserSummary[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(10);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');

  // Confirmation Modal states
  const [actionModalVisible, setActionModalVisible] = useState<boolean>(false);
  const [targetUser, setTargetUser] = useState<UserSummary | null>(null);
  const [modalActionType, setModalActionType] = useState<'SUSPEND' | 'RESTORE' | 'ROLE'>('SUSPEND');
  const [newRoleSelection, setNewRoleSelection] = useState<UserRole>('RESIDENT');
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchAdminUsers(
        search.trim() || undefined,
        selectedRole || undefined,
        selectedStatus || undefined,
        page,
        limit
      );

      if (res.success && res.data) {
        setUsers(res.data.users);
        setTotal(res.data.total);
      }
    } catch (err) {
      console.error('[UserManagement] Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  }, [search, selectedRole, selectedStatus, page, limit]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleOpenSuspendModal = (u: UserSummary) => {
    if (u.id === currentAdmin?.id) {
      Alert.alert('Action Prohibited', 'You cannot suspend your own administrative account.');
      return;
    }
    setTargetUser(u);
    setModalActionType('SUSPEND');
    setActionModalVisible(true);
  };

  const handleOpenRestoreModal = (u: UserSummary) => {
    setTargetUser(u);
    setModalActionType('RESTORE');
    setActionModalVisible(true);
  };

  const handleOpenRoleModal = (u: UserSummary) => {
    setTargetUser(u);
    setNewRoleSelection(u.role);
    setModalActionType('ROLE');
    setActionModalVisible(true);
  };

  const handleExecuteModalAction = async () => {
    if (!targetUser) return;
    setActionLoading(true);

    try {
      if (modalActionType === 'SUSPEND') {
        const res = await suspendUser(targetUser.id);
        if (res.success) {
          Alert.alert('Success', `Account for ${targetUser.full_name} has been suspended.`);
        } else {
          Alert.alert('Error', res.message || 'Failed to suspend user');
        }
      } else if (modalActionType === 'RESTORE') {
        const res = await restoreUser(targetUser.id);
        if (res.success) {
          Alert.alert('Success', `Account for ${targetUser.full_name} has been restored to active status.`);
        } else {
          Alert.alert('Error', res.message || 'Failed to restore user');
        }
      } else if (modalActionType === 'ROLE') {
        const res = await changeUserRole(targetUser.id, newRoleSelection);
        if (res.success) {
          Alert.alert('Success', `Role for ${targetUser.full_name} changed to ${newRoleSelection}.`);
        } else {
          Alert.alert('Error', res.message || 'Failed to change role');
        }
      }

      setActionModalVisible(false);
      setTargetUser(null);
      loadUsers();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;

  const renderUserItem = ({ item }: { item: UserSummary }) => {
    const isSelf = item.id === currentAdmin?.id;
    const isSuspended = item.account_status === 'SUSPENDED';

    return (
      <View style={[styles.userCard, isSuspended && styles.suspendedUserCard]}>
        <View style={styles.cardHeader}>
          <View style={styles.nameBlock}>
            <Text style={styles.userNameText}>
              {item.full_name} {isSelf && <Text style={styles.selfTag}>(You)</Text>}
            </Text>
            <Text style={styles.userEmailText}>{item.email}</Text>
          </View>

          <View style={styles.badgeColumn}>
            <View
              style={[
                styles.roleBadge,
                item.role === 'ADMIN'
                  ? styles.roleAdmin
                  : item.role === 'MODERATOR'
                  ? styles.roleMod
                  : styles.roleResident,
              ]}
            >
              <Text
                style={[
                  styles.roleBadgeText,
                  item.role === 'ADMIN'
                    ? styles.roleAdminText
                    : item.role === 'MODERATOR'
                    ? styles.roleModText
                    : styles.roleResidentText,
                ]}
              >
                {item.role}
              </Text>
            </View>

            <View
              style={[
                styles.statusBadge,
                isSuspended ? styles.statusSuspended : styles.statusActive,
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  isSuspended ? styles.statusSuspendedText : styles.statusActiveText,
                ]}
              >
                {item.account_status}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.userFooter}>
          <Text style={styles.joinedText}>
            Joined: {new Date(item.created_at).toLocaleDateString()}
          </Text>

          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={styles.smallRoleBtn}
              onPress={() => handleOpenRoleModal(item)}
            >
              <Text style={styles.smallRoleBtnText}>Role</Text>
            </TouchableOpacity>

            {!isSelf && (
              isSuspended ? (
                <TouchableOpacity
                  style={styles.smallRestoreBtn}
                  onPress={() => handleOpenRestoreModal(item)}
                >
                  <Text style={styles.smallRestoreBtnText}>Restore</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.smallSuspendBtn}
                  onPress={() => handleOpenSuspendModal(item)}
                >
                  <Text style={styles.smallSuspendBtnText}>Suspend</Text>
                </TouchableOpacity>
              )
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>← Dashboard</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>User Directory</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Search Input */}
      <View style={styles.searchSection}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or email..."
          value={search}
          onChangeText={(txt) => {
            setSearch(txt);
            setPage(1);
          }}
          placeholderTextColor="#94a3b8"
        />
      </View>

      {/* Role Filter Tabs */}
      <View style={styles.filterRow}>
        {(['', 'RESIDENT', 'MODERATOR', 'ADMIN'] as const).map((r) => (
          <TouchableOpacity
            key={r || 'ALL_ROLE'}
            style={[styles.filterChip, selectedRole === r && styles.activeFilterChip]}
            onPress={() => {
              setSelectedRole(r);
              setPage(1);
            }}
          >
            <Text
              style={[
                styles.filterChipText,
                selectedRole === r && styles.activeFilterChipText,
              ]}
            >
              {r ? r : 'All Roles'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Status Filter Tabs */}
      <View style={styles.filterRow}>
        {(['', 'ACTIVE', 'SUSPENDED'] as const).map((s) => (
          <TouchableOpacity
            key={s || 'ALL_STATUS'}
            style={[styles.filterChip, selectedStatus === s && styles.activeFilterChip]}
            onPress={() => {
              setSelectedStatus(s);
              setPage(1);
            }}
          >
            <Text
              style={[
                styles.filterChipText,
                selectedStatus === s && styles.activeFilterChipText,
              ]}
            >
              {s ? s : 'All Status'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Users Count Summary */}
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>
          Total: {total} {total === 1 ? 'user' : 'users'}
        </Text>
        <Text style={styles.metaText}>
          Page {page} of {totalPages}
        </Text>
      </View>

      {/* Users List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading directory...</Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={renderUserItem}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No users found matching query</Text>
            </View>
          }
        />
      )}

      {/* Pagination Footer */}
      <View style={styles.paginationFooter}>
        <TouchableOpacity
          style={[styles.pageBtn, page <= 1 && styles.pageBtnDisabled]}
          disabled={page <= 1}
          onPress={() => setPage((p) => Math.max(1, p - 1))}
        >
          <Text style={styles.pageBtnText}>← Previous</Text>
        </TouchableOpacity>

        <Text style={styles.pageIndicatorText}>
          {page} / {totalPages}
        </Text>

        <TouchableOpacity
          style={[styles.pageBtn, page >= totalPages && styles.pageBtnDisabled]}
          disabled={page >= totalPages}
          onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
        >
          <Text style={styles.pageBtnText}>Next →</Text>
        </TouchableOpacity>
      </View>

      {/* Confirmation Modal */}
      <Modal visible={actionModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>
              {modalActionType === 'SUSPEND'
                ? 'Suspend User Account'
                : modalActionType === 'RESTORE'
                ? 'Restore User Account'
                : 'Change User Role'}
            </Text>

            {modalActionType === 'SUSPEND' && (
              <Text style={styles.modalMessage}>
                Are you sure you want to suspend {targetUser?.full_name}? They will be blocked from accessing protected network features.
              </Text>
            )}

            {modalActionType === 'RESTORE' && (
              <Text style={styles.modalMessage}>
                Restore active status for {targetUser?.full_name}? They will regain full access to their resident privileges.
              </Text>
            )}

            {modalActionType === 'ROLE' && (
              <View style={styles.rolePickerBox}>
                <Text style={styles.modalMessage}>
                  Select role for {targetUser?.full_name}:
                </Text>
                {(['RESIDENT', 'MODERATOR', 'ADMIN'] as const).map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[
                      styles.roleOptionBtn,
                      newRoleSelection === r && styles.roleOptionBtnActive,
                    ]}
                    onPress={() => setNewRoleSelection(r)}
                  >
                    <Text
                      style={[
                        styles.roleOptionText,
                        newRoleSelection === r && styles.roleOptionTextActive,
                      ]}
                    >
                      {r === 'ADMIN' ? '🛡️ ADMIN' : r === 'MODERATOR' ? '⚖️ MODERATOR' : '👤 RESIDENT'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                disabled={actionLoading}
                onPress={() => {
                  setActionModalVisible(false);
                  setTargetUser(null);
                }}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalConfirmBtn,
                  modalActionType === 'SUSPEND' && styles.modalDangerBtn,
                ]}
                disabled={actionLoading}
                onPress={handleExecuteModalAction}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmBtnText}>
                    {modalActionType === 'SUSPEND'
                      ? 'Suspend'
                      : modalActionType === 'RESTORE'
                      ? 'Restore'
                      : 'Apply Role'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
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
  searchSection: {
    padding: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  searchInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0f172a',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
  },
  activeFilterChip: {
    backgroundColor: '#2563eb',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  activeFilterChipText: {
    color: '#ffffff',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  metaText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  listContainer: {
    padding: 12,
    paddingBottom: 24,
  },
  userCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  suspendedUserCard: {
    borderColor: '#fca5a5',
    backgroundColor: '#fff7f7',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  nameBlock: {
    flex: 1,
  },
  userNameText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 2,
  },
  selfTag: {
    color: '#2563eb',
    fontSize: 12,
    fontWeight: '600',
  },
  userEmailText: {
    fontSize: 13,
    color: '#64748b',
  },
  badgeColumn: {
    alignItems: 'flex-end',
    gap: 4,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  roleAdmin: { backgroundColor: '#fee2e2' },
  roleAdminText: { color: '#991b1b', fontSize: 10, fontWeight: '800' },
  roleMod: { backgroundColor: '#e0e7ff' },
  roleModText: { color: '#4338ca', fontSize: 10, fontWeight: '800' },
  roleResident: { backgroundColor: '#f1f5f9' },
  roleResidentText: { color: '#475569', fontSize: 10, fontWeight: '800' },
  roleBadgeText: { fontSize: 10, fontWeight: '700' },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusActive: { backgroundColor: '#dcfce7' },
  statusActiveText: { color: '#166534', fontSize: 10, fontWeight: '700' },
  statusSuspended: { backgroundColor: '#fecaca' },
  statusSuspendedText: { color: '#dc2626', fontSize: 10, fontWeight: '700' },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },
  userFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  joinedText: {
    fontSize: 11,
    color: '#94a3b8',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  smallRoleBtn: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  smallRoleBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  smallSuspendBtn: {
    backgroundColor: '#fff1f2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  smallSuspendBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#dc2626',
  },
  smallRestoreBtn: {
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  smallRestoreBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16a34a',
  },
  paginationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  pageBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#2563eb',
    borderRadius: 6,
  },
  pageBtnDisabled: {
    backgroundColor: '#cbd5e1',
  },
  pageBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
  },
  pageIndicatorText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
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
  emptyText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBox: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 20,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 16,
  },
  rolePickerBox: {
    marginBottom: 12,
  },
  roleOptionBtn: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
  },
  roleOptionBtnActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  roleOptionText: {
    fontSize: 14,
    color: '#334155',
    fontWeight: '600',
  },
  roleOptionTextActive: {
    color: '#2563eb',
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10,
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
  },
  modalCancelBtnText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 13,
  },
  modalConfirmBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#2563eb',
  },
  modalDangerBtn: {
    backgroundColor: '#dc2626',
  },
  modalConfirmBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
  },
});
