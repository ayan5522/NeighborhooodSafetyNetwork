import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
  Image,
} from 'react-native';
import {
  fetchModerationReportById,
  reviewModerationReport,
  dismissModerationReport,
  takeModerationAction,
  fetchIncidentTrustScore,
} from '../api/client';
import {
  ModerationDetailResponse,
  ModerationAction,
  ReportReason,
} from '../types/admin';
import { AITrustAssessment } from '../types/ai';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { CATEGORY_LABELS, SEVERITY_COLORS, IncidentSeverity } from '../types/incident';

const getTrustScoreColor = (category?: string | null) => {
  switch (category) {
    case 'VERY_HIGH':
    case 'HIGH':
      return '#16a34a';
    case 'MODERATE':
      return '#2563eb';
    case 'LOW':
      return '#dc2626';
    default:
      return '#64748b';
  }
};

const getConfidenceColor = (level?: string | null) => {
  switch (level) {
    case 'HIGH':
      return '#16a34a';
    case 'MEDIUM':
      return '#2563eb';
    case 'LOW':
      return '#d97706';
    default:
      return '#64748b';
  }
};



interface ModerationDetailScreenProps {
  reportId: string;
  onBack: () => void;
  onActionComplete: () => void;
}

export const ModerationDetailScreen: React.FC<ModerationDetailScreenProps> = ({
  reportId,
  onBack,
  onActionComplete,
}) => {
  const [data, setData] = useState<ModerationDetailResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Action modal states
  const [actionModalVisible, setActionModalVisible] = useState<boolean>(false);
  const [selectedAction, setSelectedAction] = useState<ModerationAction>('RESOLVE_INCIDENT');
  const [actionSubmitting, setActionSubmitting] = useState<boolean>(false);

  // AI Reliability Decision Support state (Module 09)
  const [aiAssessment, setAiAssessment] = useState<AITrustAssessment | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);

  const loadAiTrust = useCallback(async (incidentId: string, refresh: boolean = false) => {
    setAiLoading(true);
    try {
      const aiRes = await fetchIncidentTrustScore(incidentId, refresh);
      if (aiRes.success && aiRes.data) {
        setAiAssessment(aiRes.data.assessment);
      }
    } catch {
      // Non-blocking fallback
    } finally {
      setAiLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async () => {
    try {
      setError(null);
      const res = await fetchModerationReportById(reportId);
      if (res.success && res.data) {
        setData(res.data);
        // Load AI trust score
        if (res.data.incident?.id) {
          loadAiTrust(res.data.incident.id, false);
        }
      } else {
        setError(res.message || 'Failed to load report detail');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, [reportId, loadAiTrust]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);


  const handleReview = async () => {
    try {
      setLoading(true);
      const res = await reviewModerationReport(reportId);
      if (res.success) {
        Alert.alert('Status Updated', 'Report has been marked as REVIEWED.');
        loadDetail();
      } else {
        Alert.alert('Error', res.message || 'Failed to review report');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async () => {
    Alert.alert(
      'Dismiss Report',
      'Are you sure you want to dismiss this report? The incident will remain unchanged.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Dismiss',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              const res = await dismissModerationReport(reportId);
              if (res.success) {
                Alert.alert('Report Dismissed', 'Report status set to DISMISSED.');
                onActionComplete();
              } else {
                Alert.alert('Error', res.message || 'Failed to dismiss');
              }
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Request failed');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleExecuteAction = async () => {
    setActionSubmitting(true);
    try {
      const res = await takeModerationAction(reportId, selectedAction);
      if (res.success) {
        Alert.alert(
          'Action Applied',
          `Incident moderated with action: ${selectedAction.replace('_', ' ')}. Notifications dispatched.`
        );
        setActionModalVisible(false);
        onActionComplete();
      } else {
        Alert.alert('Error', res.message || 'Failed to apply moderation action');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Action failed');
    } finally {
      setActionSubmitting(false);
    }
  };

  if (loading && !data) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4338ca" />
          <Text style={styles.loadingText}>Fetching moderation detail...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !data) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>← Queue</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Report Details</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>⚠️ {error || 'Report not found'}</Text>
          <Button title="Back to Queue" onPress={onBack} variant="outline" style={{ marginTop: 12 }} />
        </View>
      </SafeAreaView>
    );
  }

  const { report, incident, verification, active_alerts_count } = data;
  const severityColor = SEVERITY_COLORS[incident.severity as IncidentSeverity] || '#64748b';

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>← Queue</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Moderation Review</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Flag Summary Banner */}
        <Card>
          <View style={styles.flagHeaderRow}>
            <View style={styles.flagReasonBadge}>
              <Text style={styles.flagReasonText}>
                FLAG: {report.reason.replace('_', ' ')}
              </Text>
            </View>
            <View style={[styles.reportStatusBadge, { backgroundColor: '#fee2e2' }]}>
              <Text style={styles.reportStatusText}>{report.status}</Text>
            </View>
          </View>

          {report.description ? (
            <View style={styles.flagDescriptionBox}>
              <Text style={styles.flagDescLabel}>Community Member Note:</Text>
              <Text style={styles.flagDescText}>"{report.description}"</Text>
            </View>
          ) : null}

          <Text style={styles.flagTimestamp}>
            Flagged on: {new Date(report.created_at).toLocaleString()}
          </Text>
        </Card>

        {/* Incident Overview */}
        <Card>
          <View style={styles.incidentHeaderRow}>
            <View style={[styles.severityBadge, { borderColor: severityColor }]}>
              <Text style={[styles.severityText, { color: severityColor }]}>
                {incident.severity} SEVERITY
              </Text>
            </View>
            <View style={styles.incidentStatusBadge}>
              <Text style={styles.incidentStatusText}>STATUS: {incident.status}</Text>
            </View>
          </View>

          <Text style={styles.incidentTitle}>{incident.title}</Text>
          <Text style={styles.incidentDesc}>{incident.description}</Text>

          {incident.image_url ? (
            <Image
              source={{ uri: incident.image_url }}
              style={styles.incidentImage}
              resizeMode="cover"
            />
          ) : null}

          <View style={styles.incidentMetaBox}>
            <Text style={styles.incidentMetaText}>
              Category:{' '}
              {CATEGORY_LABELS[incident.category as keyof typeof CATEGORY_LABELS] ||
                incident.category}
            </Text>
            <Text style={styles.incidentMetaText}>
              Coordinates: {incident.latitude.toFixed(4)}, {incident.longitude.toFixed(4)}
            </Text>
            <Text style={styles.incidentMetaText}>
              Reported on: {new Date(incident.created_at).toLocaleString()}
            </Text>
          </View>
        </Card>

        {/* Community Verification & Alert Signals */}
        <Card>
          <Text style={styles.sectionHeading}>Community Consensus Signals</Text>
          <View style={styles.consensusGrid}>
            <View style={[styles.consensusBox, { backgroundColor: '#f0fdf4' }]}>
              <Text style={[styles.consensusNum, { color: '#16a34a' }]}>
                {verification.confirmations}
              </Text>
              <Text style={styles.consensusLabel}>Neighbor Confirms</Text>
            </View>

            <View style={[styles.consensusBox, { backgroundColor: '#fff7ed' }]}>
              <Text style={[styles.consensusNum, { color: '#ea580c' }]}>
                {verification.disputes}
              </Text>
              <Text style={styles.consensusLabel}>Neighbor Disputes</Text>
            </View>

            <View style={[styles.consensusBox, { backgroundColor: '#fef2f2' }]}>
              <Text style={[styles.consensusNum, { color: '#dc2626' }]}>
                {active_alerts_count}
              </Text>
              <Text style={styles.consensusLabel}>Active Alerts</Text>
            </View>
          </View>
        </Card>

        {/* Module 09: AI Reliability Decision Support Card */}
        <Card>
          <View style={styles.aiHeaderRow}>
            <Text style={styles.sectionHeading}>🤖 AI Reliability Support</Text>
            <TouchableOpacity
              onPress={() => loadAiTrust(incident.id, true)}
              disabled={aiLoading}
              style={styles.aiRefreshBtn}
            >
              <Text style={styles.aiRefreshBtnText}>
                {aiLoading ? 'Analyzing...' : '↻ Recalculate'}
              </Text>
            </TouchableOpacity>
          </View>

          {aiLoading && !aiAssessment ? (
            <View style={styles.aiLoadingBox}>
              <ActivityIndicator size="small" color="#4338ca" />
              <Text style={styles.aiLoadingText}>Running AI trust assessment...</Text>
            </View>
          ) : !aiAssessment ? (
            <View style={styles.aiEmptyBox}>
              <Text style={styles.aiEmptyText}>AI assessment unavailable for this report.</Text>
            </View>
          ) : aiAssessment.confidence_level === 'UNAVAILABLE' ? (
            <View style={styles.aiEmptyBox}>
              <Text style={styles.aiEmptyTitle}>Engine Offline</Text>
              <Text style={styles.aiEmptyText}>
                {aiAssessment.explanation?.[0] || 'The AI reliability engine is offline. Proceed with standard manual review.'}
              </Text>
            </View>
          ) : (
            <View style={styles.aiContentContainer}>
              {/* Score and Category Row */}
              <View style={styles.aiScoreRow}>
                <View
                  style={[
                    styles.aiScoreCircle,
                    { borderColor: getTrustScoreColor(aiAssessment.trust_category) },
                  ]}
                >
                  <Text
                    style={[
                      styles.aiScoreValue,
                      { color: getTrustScoreColor(aiAssessment.trust_category) },
                    ]}
                  >
                    {aiAssessment.trust_score !== null ? Math.round(aiAssessment.trust_score) : '—'}
                  </Text>
                  <Text style={styles.aiScoreMax}>/ 100</Text>
                </View>

                <View style={styles.aiBadgeCol}>
                  <View style={styles.aiBadgeRow}>
                    <Text style={styles.aiBadgeLabel}>Trust Category:</Text>
                    <View
                      style={[
                        styles.aiCategoryBadge,
                        { backgroundColor: `${getTrustScoreColor(aiAssessment.trust_category)}15` },
                      ]}
                    >
                      <Text
                        style={[
                          styles.aiCategoryBadgeText,
                          { color: getTrustScoreColor(aiAssessment.trust_category) },
                        ]}
                      >
                        {aiAssessment.trust_category ? aiAssessment.trust_category.replace(/_/g, ' ') : 'N/A'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.aiBadgeRow}>
                    <Text style={styles.aiBadgeLabel}>Confidence:</Text>
                    <View
                      style={[
                        styles.aiCategoryBadge,
                        { backgroundColor: `${getConfidenceColor(aiAssessment.confidence_level)}15` },
                      ]}
                    >
                      <Text
                        style={[
                          styles.aiCategoryBadgeText,
                          { color: getConfidenceColor(aiAssessment.confidence_level) },
                        ]}
                      >
                        {aiAssessment.confidence_level}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Cold Start Notice */}
              {aiAssessment.confidence_level === 'LOW' && (
                <View style={styles.aiColdStartBanner}>
                  <Text style={styles.aiColdStartTitle}>⚠️ Cold Start Warning</Text>
                  <Text style={styles.aiColdStartText}>
                    Limited community verification available yet. Treat this score with caution.
                  </Text>
                </View>
              )}

              {/* Factors */}
              {aiAssessment.explanation && aiAssessment.explanation.length > 0 && (
                <View style={styles.aiFactorsSection}>
                  <Text style={styles.aiFactorsHeading}>Top Contributing Signals:</Text>
                  {aiAssessment.explanation.map((factor: string, idx: number) => (
                    <View key={idx} style={styles.aiFactorItem}>
                      <Text style={styles.aiFactorBullet}>•</Text>
                      <Text style={styles.aiFactorText}>{factor}</Text>
                    </View>
                  ))}
                </View>
              )}


              {/* Ethical advisory footer */}
              <View style={styles.aiMetaFooter}>
                <Text style={styles.aiMetaText}>
                  Model: {aiAssessment.model_version} • Pipeline: {aiAssessment.feature_version}
                </Text>
                <Text style={styles.aiDisclaimerText}>
                  Decision support only. Automated predictions never replace human moderator discernment.
                </Text>
              </View>
            </View>
          )}
        </Card>

        {/* Action Controls */}
        {report.status !== 'ACTION_TAKEN' && report.status !== 'DISMISSED' ? (
          <View style={styles.moderatorActionsContainer}>
            <Text style={styles.sectionHeading}>Moderator Decisions</Text>

            <View style={styles.decisionButtonsRow}>
              {report.status === 'PENDING' && (
                <Button
                  title="Mark Reviewed"
                  onPress={handleReview}
                  variant="outline"
                  style={{ flex: 1 }}
                />
              )}

              <Button
                title="Dismiss Flag"
                onPress={handleDismiss}
                variant="outline"
                style={{ flex: 1 }}
              />
            </View>

            <Button
              title="⚡ Take Moderation Action"
              onPress={() => setActionModalVisible(true)}
              variant="primary"
              style={{ marginTop: 10 }}
            />
          </View>
        ) : (
          <Card>
            <Text style={styles.completedNotice}>
              ✅ Moderation resolution concluded. Status: {report.status}.
            </Text>
          </Card>
        )}
      </ScrollView>

      {/* Moderation Action Modal */}
      <Modal visible={actionModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Take Moderation Action</Text>
            <Text style={styles.modalSubtitle}>
              Select the action to apply on incident "{incident.title}":
            </Text>

            {(
              [
                { action: 'RESOLVE_INCIDENT', label: '✅ Resolve Incident', desc: 'Marks incident and active alerts as RESOLVED' },
                { action: 'CANCEL_INCIDENT', label: '🛑 Cancel Incident', desc: 'Marks incident as CANCELLED and alerts as RESOLVED' },
                { action: 'MARK_DUPLICATE', label: '📑 Mark as Duplicate', desc: 'Flagged as duplicate of an existing report' },
                { action: 'MARK_MISLEADING', label: '❓ Mark as Misleading', desc: 'Identified as inaccurate or misleading' },
              ] as const
            ).map((opt) => (
              <TouchableOpacity
                key={opt.action}
                style={[
                  styles.actionOptionCard,
                  selectedAction === opt.action && styles.actionOptionCardActive,
                ]}
                onPress={() => setSelectedAction(opt.action)}
              >
                <Text
                  style={[
                    styles.actionOptionTitle,
                    selectedAction === opt.action && styles.actionOptionTitleActive,
                  ]}
                >
                  {opt.label}
                </Text>
                <Text style={styles.actionOptionDesc}>{opt.desc}</Text>
              </TouchableOpacity>
            ))}

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                disabled={actionSubmitting}
                onPress={() => setActionModalVisible(false)}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                disabled={actionSubmitting}
                onPress={handleExecuteAction}
              >
                {actionSubmitting ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmBtnText}>Apply Action</Text>
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
  scrollContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  flagHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  flagReasonBadge: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  flagReasonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#991b1b',
  },
  reportStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  reportStatusText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#dc2626',
  },
  flagDescriptionBox: {
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 8,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  flagDescLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 2,
  },
  flagDescText: {
    fontSize: 13,
    color: '#334155',
    fontStyle: 'italic',
  },
  flagTimestamp: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 4,
  },
  incidentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  severityText: {
    fontSize: 11,
    fontWeight: '800',
  },
  incidentStatusBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  incidentStatusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  incidentTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 6,
  },
  incidentDesc: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 10,
  },
  incidentImage: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    marginBottom: 10,
  },
  incidentMetaBox: {
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 8,
    gap: 4,
  },
  incidentMetaText: {
    fontSize: 12,
    color: '#64748b',
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 10,
  },
  consensusGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  consensusBox: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  consensusNum: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 2,
  },
  consensusLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'center',
  },
  moderatorActionsContainer: {
    marginTop: 10,
  },
  decisionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  completedNotice: {
    fontSize: 14,
    fontWeight: '700',
    color: '#15803d',
    textAlign: 'center',
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
  errorText: {
    fontSize: 14,
    color: '#dc2626',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalBox: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 18,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 12,
  },
  actionOptionCard: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
  },
  actionOptionCardActive: {
    borderColor: '#4338ca',
    backgroundColor: '#eef2ff',
  },
  actionOptionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 2,
  },
  actionOptionTitleActive: {
    color: '#4338ca',
  },
  actionOptionDesc: {
    fontSize: 11,
    color: '#64748b',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  modalConfirmBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#4338ca',
  },
  modalConfirmBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  /* Module 09: AI Decision Support Styles */
  aiHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  aiRefreshBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  aiRefreshBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4338ca',
  },
  aiLoadingBox: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  aiLoadingText: {
    marginTop: 8,
    fontSize: 12,
    color: '#64748b',
  },
  aiEmptyBox: {
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  aiEmptyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
  },
  aiEmptyText: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 18,
  },
  aiContentContainer: {
    gap: 12,
  },
  aiScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  aiScoreCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  aiScoreValue: {
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 26,
  },
  aiScoreMax: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '600',
  },
  aiBadgeCol: {
    flex: 1,
    gap: 6,
  },
  aiBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aiBadgeLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
    width: 95,
  },
  aiCategoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  aiCategoryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  aiColdStartBanner: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fef3c7',
  },
  aiColdStartTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#b45309',
    marginBottom: 2,
  },
  aiColdStartText: {
    fontSize: 11,
    color: '#92400e',
    lineHeight: 16,
  },
  aiSummaryBox: {
    padding: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#4338ca',
  },
  aiSummaryText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
    fontStyle: 'italic',
  },
  aiFactorsSection: {
    backgroundColor: '#ffffff',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  aiFactorsHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 6,
  },
  aiFactorItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 4,
  },
  aiFactorBullet: {
    fontSize: 12,
    color: '#4338ca',
    fontWeight: 'bold',
  },
  aiFactorText: {
    fontSize: 12,
    color: '#475569',
    flex: 1,
    lineHeight: 17,
  },
  aiMetaFooter: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    gap: 4,
  },
  aiMetaText: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '500',
  },
  aiDisclaimerText: {
    fontSize: 10,
    color: '#64748b',
    lineHeight: 14,
    fontStyle: 'italic',
  },
});
