import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  Platform,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import {
  fetchIncidentById,
  updateIncident,
  cancelIncident,
  getFullImageUrl,
  verifyIncident,
  fetchIncidentVerifications,
  reportIncident,
  fetchIncidentTrustScore,
} from '../api/client';
import { ReportReason } from '../types/admin';
import { AITrustAssessment } from '../types/ai';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import {
  Incident,
  IncidentCategory,
  IncidentSeverity,
  CATEGORY_LABELS,
  SEVERITY_COLORS,
  STATUS_COLORS,
} from '../types/incident';
import {
  VerificationSummary,
  VerificationType,
  VERIFICATION_STATUS_META,
} from '../types/verification';

interface IncidentDetailsScreenProps {
  incidentId: string;
  onBack: () => void;
  onIncidentCancelled?: () => void;
}

const CATEGORIES: IncidentCategory[] = [
  'ACCIDENT',
  'FIRE',
  'SUSPICIOUS_ACTIVITY',
  'ROAD_HAZARD',
  'FLOOD_WATERLOGGING',
  'MEDICAL_EMERGENCY',
  'INFRASTRUCTURE_ISSUE',
  'OTHER',
];

const SEVERITIES: IncidentSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

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



export const IncidentDetailsScreen: React.FC<IncidentDetailsScreenProps> = ({
  incidentId,
  onBack,
  onIncidentCancelled,
}) => {
  const { user } = useAuth();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [verifyingLoading, setVerifyingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Verification state (Module 05)
  const [verification, setVerification] = useState<VerificationSummary | null>(null);

  // Incident Flagging state (Module 07)
  const [flagModalVisible, setFlagModalVisible] = useState(false);
  const [flagReason, setFlagReason] = useState<ReportReason>('MISLEADING');
  const [flagDescription, setFlagDescription] = useState('');
  const [flagSubmitting, setFlagSubmitting] = useState(false);

  // AI Reliability state (Module 09)
  const [aiAssessment, setAiAssessment] = useState<AITrustAssessment | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState<IncidentCategory>('ACCIDENT');
  const [editSeverity, setEditSeverity] = useState<IncidentSeverity>('MEDIUM');

  const loadAiTrust = useCallback(async (refresh: boolean = false) => {
    setAiLoading(true);
    try {
      const aiRes = await fetchIncidentTrustScore(incidentId, refresh);
      if (aiRes.success && aiRes.data) {
        setAiAssessment(aiRes.data.assessment);
      }
    } catch {
      // Graceful non-blocking fallback
    } finally {
      setAiLoading(false);
    }
  }, [incidentId]);

  const loadDetails = useCallback(async () => {
    try {
      setError(null);
      const res = await fetchIncidentById(incidentId);
      if (res.success && res.data) {
        const inc = res.data.incident;
        setIncident(inc);
        setEditTitle(inc.title);
        setEditDescription(inc.description);
        setEditCategory(inc.category);
        setEditSeverity(inc.severity);

        if (inc.verification) {
          setVerification(inc.verification);
        } else {
          const vRes = await fetchIncidentVerifications(incidentId);
          if (vRes.success && vRes.data) {
            setVerification(vRes.data);
          }
        }

        // Fetch AI Reliability assessment
        loadAiTrust(false);
      } else {
        setError(res.message || 'Incident not found');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, [incidentId, loadAiTrust]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  const isOwner = user?.id && incident?.reporter_id === user.id;
  const isCancelled = incident?.status === 'CANCELLED';

  const handleSaveChanges = async () => {
    if (!editTitle.trim()) {
      Alert.alert('Validation Error', 'Title cannot be blank.');
      return;
    }
    if (!editDescription.trim()) {
      Alert.alert('Validation Error', 'Description cannot be blank.');
      return;
    }

    setActionLoading(true);
    try {
      const res = await updateIncident(incidentId, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        category: editCategory,
        severity: editSeverity,
      });

      if (res.success && res.data) {
        setIncident(res.data.incident);
        setIsEditing(false);
        Alert.alert('Updated', 'Incident report has been updated successfully.');
      } else {
        Alert.alert('Update Failed', res.message || 'Could not update incident.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'An unexpected error occurred.');
    } finally {
      setActionLoading(false);
    }
  };

  const confirmAction = (
    title: string,
    message: string,
    onConfirm: () => void | Promise<void>
  ) => {
    if (Platform.OS === 'web') {
      const ok =
        typeof window !== 'undefined' && window.confirm
          ? window.confirm(`${title}\n\n${message}`)
          : true;
      if (ok) {
        onConfirm();
      }
    } else {
      Alert.alert(title, message, [
        { text: 'No, Keep Active', style: 'cancel' },
        { text: 'Yes, Cancel Incident', style: 'destructive', onPress: onConfirm },
      ]);
    }
  };

  const showAlert = (title: string, message: string, onOk?: () => void) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.alert) {
        window.alert(`${title}\n\n${message}`);
      }
      if (onOk) onOk();
    } else {
      Alert.alert(title, message, onOk ? [{ text: 'OK', onPress: onOk }] : undefined);
    }
  };

  const handleCancelIncident = () => {
    confirmAction(
      'Cancel Incident',
      'Are you sure you want to cancel this incident report? This will mark it as CANCELLED across the neighborhood network and resolve active alerts.',
      async () => {
        setActionLoading(true);
        try {
          const res = await cancelIncident(incidentId);
          if (res.success && res.data) {
            setIncident(res.data.incident);
            showAlert('Cancelled', 'Your incident report has been cancelled.', () => {
              if (onIncidentCancelled) onIncidentCancelled();
            });
          } else {
            showAlert('Cancel Failed', res.message || 'Failed to cancel incident.');
          }
        } catch (err: any) {
          showAlert('Error', err.message || 'Failed to cancel incident.');
        } finally {
          setActionLoading(false);
        }
      }
    );
  };

  const hasVoted = Boolean(verification?.my_verification);

  const handleVerify = async (type: VerificationType) => {
    if (isOwner) {
      Alert.alert('Not Permitted', 'You cannot verify your own report.');
      return;
    }
    if (isCancelled || incident?.status === 'RESOLVED') {
      Alert.alert('Notice', 'Verification is closed for this incident.');
      return;
    }
    if (hasVoted) {
      Alert.alert(
        'Vote Already Recorded',
        'You have already voted on this incident. Community verification votes are permanent and cannot be changed.'
      );
      return;
    }

    setVerifyingLoading(true);
    try {
      const res = await verifyIncident(incidentId, type);
      if (res.success && res.data) {
        setVerification(res.data);
        loadAiTrust(true);
      } else {
        Alert.alert('Verification Failed', res.message || 'Could not submit verification.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'An unexpected error occurred.');
    } finally {
      setVerifyingLoading(false);
    }
  };

  const handleSubmitFlag = async () => {
    if (!incident) return;
    setFlagSubmitting(true);
    try {
      const res = await reportIncident(
        incident.id,
        flagReason,
        flagDescription.trim() || undefined
      );
      if (res.success) {
        Alert.alert(
          'Flag Submitted',
          'Thank you. Your report has been submitted to the community moderation queue for review.'
        );
        setFlagModalVisible(false);
        setFlagDescription('');
      } else {
        Alert.alert('Report Error', res.message || 'Could not submit flag');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Submission failed');
    } finally {
      setFlagSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading incident details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !incident) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Incident Details</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error || 'Incident not found'}</Text>
          <Button title="Go Back" onPress={onBack} variant="outline" style={{ marginTop: 12 }} />
        </View>
      </SafeAreaView>
    );
  }

  const sevColor = SEVERITY_COLORS[incident.severity] || '#6b7280';
  const statusColor = STATUS_COLORS[incident.status] || '#6b7280';
  const fullImg = getFullImageUrl(incident.image_url);
  const verificationMeta = VERIFICATION_STATUS_META[verification?.status || 'UNVERIFIED'];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Incident Details</Text>
        {isOwner && !isCancelled && !isEditing ? (
          <TouchableOpacity onPress={() => setIsEditing(true)}>
            <Text style={styles.editActionText}>Edit</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 50 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Status & Severity Bar */}
        <View style={styles.metaRow}>
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: '#e0e7ff' }]}>
              <Text style={[styles.badgeText, { color: '#3730a3' }]}>
                {CATEGORY_LABELS[incident.category] || incident.category}
              </Text>
            </View>
            <View
              style={[
                styles.badge,
                { backgroundColor: `${sevColor}20`, borderColor: sevColor, borderWidth: 1 },
              ]}
            >
              <Text style={[styles.badgeText, { color: sevColor }]}>{incident.severity}</Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: `${statusColor}20` }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{incident.status}</Text>
          </View>
        </View>

        {isCancelled && (
          <View style={styles.cancelledBanner}>
            <Text style={styles.cancelledBannerText}>
              ⚠️ This incident report has been cancelled by the reporter.
            </Text>
          </View>
        )}

        {/* View vs Edit Mode */}
        {isEditing ? (
          <Card>
            <Text style={styles.sectionTitle}>Edit Incident Details</Text>

            <Text style={styles.inputLabel}>Title *</Text>
            <TextInput
              style={styles.textInput}
              value={editTitle}
              onChangeText={setEditTitle}
              maxLength={255}
            />

            <Text style={styles.inputLabel}>Category</Text>
            <View style={styles.chipGrid}>
              {CATEGORIES.map((cat) => {
                const isSelected = editCategory === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.categoryChip, isSelected && styles.categoryChipActive]}
                    onPress={() => setEditCategory(cat)}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        isSelected && styles.categoryChipTextActive,
                      ]}
                    >
                      {CATEGORY_LABELS[cat]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.inputLabel}>Severity</Text>
            <View style={styles.severityRow}>
              {SEVERITIES.map((sev) => {
                const isSelected = editSeverity === sev;
                const color = SEVERITY_COLORS[sev];
                return (
                  <TouchableOpacity
                    key={sev}
                    style={[
                      styles.severityBtn,
                      isSelected && { borderColor: color, backgroundColor: `${color}15` },
                    ]}
                    onPress={() => setEditSeverity(sev)}
                  >
                    <Text
                      style={[
                        styles.severityText,
                        isSelected && { color: color, fontWeight: '700' },
                      ]}
                    >
                      {sev}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.inputLabel}>Description *</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={editDescription}
              onChangeText={setEditDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <View style={styles.editBtnRow}>
              <Button
                title="Cancel Edit"
                onPress={() => setIsEditing(false)}
                variant="outline"
                style={{ flex: 1 }}
              />
              <Button
                title={actionLoading ? 'Saving...' : 'Save Changes'}
                onPress={handleSaveChanges}
                variant="primary"
                loading={actionLoading}
                disabled={actionLoading}
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        ) : (
          <Card>
            <Text style={styles.incidentTitle}>{incident.title}</Text>
            <Text style={styles.incidentDescription}>{incident.description}</Text>
          </Card>
        )}

        {/* Attached Photo */}
        {fullImg && (
          <Card>
            <Text style={styles.sectionTitle}>Attached Evidence</Text>
            <Image
              source={{ uri: fullImg }}
              style={styles.fullImage}
              resizeMode="cover"
            />
          </Card>
        )}

        {/* Module 05: Community Verification Section */}
        <Card>
          <View style={styles.verificationHeaderRow}>
            <Text style={styles.sectionTitle}>Community Verification</Text>
            <View
              style={[
                styles.verificationBadge,
                { backgroundColor: verificationMeta.bgColor },
              ]}
            >
              <Text
                style={[
                  styles.verificationBadgeText,
                  { color: verificationMeta.color },
                ]}
              >
                {verificationMeta.label}
              </Text>
            </View>
          </View>

          {/* Aggregate Counts */}
          <View style={styles.verificationCountsRow}>
            <View style={styles.countCard}>
              <Text style={styles.countNumber}>
                {verification?.confirm_count ?? 0}
              </Text>
              <Text style={styles.countLabel}>Confirmed</Text>
            </View>
            <View style={styles.countDivider} />
            <View style={styles.countCard}>
              <Text style={styles.countNumber}>
                {verification?.dispute_count ?? 0}
              </Text>
              <Text style={styles.countLabel}>Disputed</Text>
            </View>
          </View>

          {/* Verification Actions or Reporter / Closed Notices */}
          {isOwner ? (
            <View style={styles.reporterNoticeBox}>
              <Text style={styles.reporterNoticeText}>
                You reported this incident. You cannot verify your own report.
              </Text>
            </View>
          ) : isCancelled || incident.status === 'RESOLVED' ? (
            <View style={styles.closedNoticeBox}>
              <Text style={styles.closedNoticeText}>
                Verification is closed because this incident is {incident.status.toLowerCase()}.
              </Text>
            </View>
          ) : (
            <View>
              {hasVoted && (
                <View style={styles.votedNoticeBox}>
                  <Text style={styles.votedNoticeText}>
                    {verification?.my_verification === 'CONFIRM'
                      ? '✓ Your Decision: Confirmed (Permanent)'
                      : '✗ Your Decision: Disputed (Permanent)'}
                  </Text>
                </View>
              )}

              <View style={styles.verificationBtnGroup}>
                <TouchableOpacity
                  style={[
                    styles.verifyBtn,
                    styles.confirmBtn,
                    verification?.my_verification === 'CONFIRM' && styles.verifyBtnActiveConfirm,
                    hasVoted && styles.verifyBtnDisabled,
                    hasVoted && verification?.my_verification !== 'CONFIRM' && styles.verifyBtnDisabledInactive,
                  ]}
                  onPress={() => handleVerify('CONFIRM')}
                  disabled={verifyingLoading || hasVoted}
                  activeOpacity={hasVoted ? 1 : 0.7}
                >
                  <Text
                    style={[
                      styles.verifyBtnText,
                      styles.confirmBtnText,
                      verification?.my_verification === 'CONFIRM' && styles.verifyBtnActiveText,
                      hasVoted && verification?.my_verification !== 'CONFIRM' && styles.verifyBtnDisabledInactiveText,
                    ]}
                  >
                    {verification?.my_verification === 'CONFIRM' ? '✓ You Confirmed' : '👍 Confirm'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.verifyBtn,
                    styles.disputeBtn,
                    verification?.my_verification === 'DISPUTE' && styles.verifyBtnActiveDispute,
                    hasVoted && styles.verifyBtnDisabled,
                    hasVoted && verification?.my_verification !== 'DISPUTE' && styles.verifyBtnDisabledInactive,
                  ]}
                  onPress={() => handleVerify('DISPUTE')}
                  disabled={verifyingLoading || hasVoted}
                  activeOpacity={hasVoted ? 1 : 0.7}
                >
                  <Text
                    style={[
                      styles.verifyBtnText,
                      styles.disputeBtnText,
                      verification?.my_verification === 'DISPUTE' && styles.verifyBtnActiveText,
                      hasVoted && verification?.my_verification !== 'DISPUTE' && styles.verifyBtnDisabledInactiveText,
                    ]}
                  >
                    {verification?.my_verification === 'DISPUTE' ? '✗ You Disputed' : '👎 Dispute'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {verifyingLoading && (
            <ActivityIndicator size="small" color="#2563eb" style={{ marginTop: 8 }} />
          )}

          <Text style={styles.verificationDisclaimer}>
            Community verification reflects responses from local residents. It does not independently establish factual truth.
          </Text>
        </Card>

        {/* Module 09: AI Trust & Reliability Assessment */}
        <Card>
          <View style={styles.aiHeaderRow}>
            <Text style={styles.sectionTitle}>🤖 AI Reliability Assessment</Text>
            <TouchableOpacity
              onPress={() => loadAiTrust(true)}
              disabled={aiLoading}
              style={styles.aiRefreshBtn}
            >
              <Text style={styles.aiRefreshBtnText}>{aiLoading ? 'Analyzing...' : '↻ Recalculate'}</Text>
            </TouchableOpacity>
          </View>

          {aiLoading && !aiAssessment ? (
            <View style={styles.aiLoadingBox}>
              <ActivityIndicator size="small" color="#2563eb" />
              <Text style={styles.aiLoadingText}>Analyzing incident reliability...</Text>
            </View>
          ) : !aiAssessment ? (
            <View style={styles.aiEmptyBox}>
              <Text style={styles.aiEmptyText}>AI reliability assessment unavailable at this time.</Text>
            </View>
          ) : aiAssessment.confidence_level === 'UNAVAILABLE' ? (
            <View style={styles.aiEmptyBox}>
              <Text style={styles.aiEmptyTitle}>Assessment Offline</Text>
              <Text style={styles.aiEmptyText}>
                {aiAssessment.explanation?.[0] || 'The AI reliability engine is currently unavailable. Incident moderation and community verifications remain fully active.'}
              </Text>
            </View>
          ) : (
            <View style={styles.aiContentContainer}>
              {/* Score and Badges Row */}
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
                    <Text style={styles.aiBadgeLabel}>Category:</Text>
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

              {/* Cold-Start Banner if confidence is LOW */}
              {aiAssessment.confidence_level === 'LOW' && (
                <View style={styles.aiColdStartBanner}>
                  <Text style={styles.aiColdStartTitle}>⚠️ Preliminary Assessment (Cold Start)</Text>
                  <Text style={styles.aiColdStartText}>
                    Few community members have voted on this incident yet. As neighbors confirm or dispute, confidence and score precision will adjust.
                  </Text>
                </View>
              )}

              {/* Explanations list */}
              {aiAssessment.explanation && aiAssessment.explanation.length > 0 && (
                <View style={styles.aiFactorsSection}>
                  <Text style={styles.aiFactorsHeading}>Key Contributing Signals:</Text>
                  {aiAssessment.explanation.map((factor: string, idx: number) => (
                    <View key={idx} style={styles.aiFactorItem}>
                      <Text style={styles.aiFactorBullet}>•</Text>
                      <Text style={styles.aiFactorText}>{factor}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Meta & Disclaimer Footer */}
              <View style={styles.aiMetaFooter}>
                <Text style={styles.aiMetaText}>
                  Model: {aiAssessment.model_version} • Features: {aiAssessment.feature_version}
                </Text>
                <Text style={styles.aiDisclaimerText}>
                  Advisory only. The AI model assists decision-making and does not substitute for human moderation or official emergency response.
                </Text>
              </View>
            </View>
          )}
        </Card>

        {/* Location & Reporter Info */}
        <Card>
          <Text style={styles.sectionTitle}>Location & Reporter Details</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Coordinates:</Text>
            <Text style={styles.infoValue}>
              {incident.latitude.toFixed(5)}, {incident.longitude.toFixed(5)}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Reported By:</Text>
            <Text style={styles.infoValue}>
              {incident.reporter_name || (isOwner ? 'You' : 'Resident')}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Submitted:</Text>
            <Text style={styles.infoValue}>
              {new Date(incident.created_at).toLocaleString()}
            </Text>
          </View>

          {incident.updated_at && incident.updated_at !== incident.created_at && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Last Updated:</Text>
              <Text style={styles.infoValue}>
                {new Date(incident.updated_at).toLocaleString()}
              </Text>
            </View>
          )}
        </Card>

        {/* Module 07: Community Moderation Flag (for non-owners) */}
        {!isOwner && !isCancelled && incident.status !== 'RESOLVED' && (
          <View style={styles.actionContainer}>
            <Button
              title="🚩 Flag / Report Incident"
              onPress={() => setFlagModalVisible(true)}
              variant="outline"
            />
          </View>
        )}

        {/* Reporter Actions */}
        {isOwner && !isCancelled && !isEditing && (
          <View style={styles.actionContainer}>
            <Button
              title={actionLoading ? 'Cancelling...' : 'Cancel This Incident Report'}
              onPress={handleCancelIncident}
              variant="danger"
              disabled={actionLoading}
            />
          </View>
        )}
      </ScrollView>

      {/* Flag Incident Modal */}
      <Modal visible={flagModalVisible} transparent animationType="fade">
        <View style={styles.flagModalOverlay}>
          <View style={styles.flagModalBox}>
            <Text style={styles.flagModalTitle}>🚩 Flag Incident</Text>
            <Text style={styles.flagModalSubtitle}>
              Help keep the neighborhood safe by reporting inaccurate or problematic content.
            </Text>

            <Text style={styles.flagInputLabel}>Select Reason *</Text>
            <View style={styles.reasonOptionGroup}>
              {(
                [
                  { reason: 'FALSE_INFORMATION', label: '❌ False Info' },
                  { reason: 'SPAM', label: '🚫 Spam' },
                  { reason: 'DUPLICATE', label: '📑 Duplicate' },
                  { reason: 'INAPPROPRIATE_CONTENT', label: '⚠️ Inappropriate' },
                  { reason: 'MISLEADING', label: '❓ Misleading' },
                  { reason: 'OTHER', label: 'ℹ️ Other' },
                ] as const
              ).map((item) => (
                <TouchableOpacity
                  key={item.reason}
                  style={[
                    styles.reasonOptionChip,
                    flagReason === item.reason && styles.reasonOptionChipActive,
                  ]}
                  onPress={() => setFlagReason(item.reason)}
                >
                  <Text
                    style={[
                      styles.reasonOptionText,
                      flagReason === item.reason && styles.reasonOptionTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.flagInputLabel}>Additional Details (Optional)</Text>
            <TextInput
              style={styles.flagTextInput}
              placeholder="Explain why this incident should be reviewed..."
              value={flagDescription}
              onChangeText={setFlagDescription}
              multiline
              numberOfLines={3}
              placeholderTextColor="#94a3b8"
            />

            <View style={styles.flagModalButtons}>
              <TouchableOpacity
                style={styles.flagCancelBtn}
                disabled={flagSubmitting}
                onPress={() => setFlagModalVisible(false)}
              >
                <Text style={styles.flagCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.flagSubmitBtn}
                disabled={flagSubmitting}
                onPress={handleSubmitFlag}
              >
                {flagSubmitting ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.flagSubmitBtnText}>Submit Flag</Text>
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
  editActionText: {
    fontSize: 15,
    color: '#2563eb',
    fontWeight: '700',
    padding: 8,
  },
  scrollContainer: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  metaRow: {
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
  cancelledBanner: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 8,
    padding: 12,
  },
  cancelledBannerText: {
    color: '#991b1b',
    fontSize: 13,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 16,
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
  fullImage: {
    width: '100%',
    height: 220,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
    marginTop: 6,
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
  actionContainer: {
    marginTop: 8,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginTop: 10,
    marginBottom: 4,
  },
  textInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  textArea: {
    minHeight: 80,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  categoryChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  categoryChipActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb',
  },
  categoryChipText: {
    fontSize: 12,
    color: '#4b5563',
  },
  categoryChipTextActive: {
    color: '#2563eb',
    fontWeight: '700',
  },
  severityRow: {
    flexDirection: 'row',
    gap: 6,
  },
  severityBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
  },
  severityText: {
    fontSize: 12,
    color: '#4b5563',
  },
  editBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
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
  // Module 05: Community Verification Styles
  verificationHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  verificationBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  verificationBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  verificationCountsRow: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: 14,
  },
  countCard: {
    alignItems: 'center',
    flex: 1,
  },
  countNumber: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111827',
  },
  countLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
    fontWeight: '500',
  },
  countDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#e5e7eb',
  },
  reporterNoticeBox: {
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  reporterNoticeText: {
    fontSize: 13,
    color: '#1e40af',
    textAlign: 'center',
    fontWeight: '500',
  },
  closedNoticeBox: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  closedNoticeText: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    fontWeight: '500',
  },
  verificationBtnGroup: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  verifyBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  verifyBtnText: {
    fontWeight: '700',
    fontSize: 14,
  },
  confirmBtn: {
    borderColor: '#10b981',
    backgroundColor: '#ffffff',
  },
  confirmBtnText: {
    color: '#059669',
  },
  disputeBtn: {
    borderColor: '#ef4444',
    backgroundColor: '#ffffff',
  },
  disputeBtnText: {
    color: '#dc2626',
  },
  verifyBtnActiveConfirm: {
    backgroundColor: '#10b981',
    borderColor: '#059669',
  },
  verifyBtnActiveDispute: {
    backgroundColor: '#ef4444',
    borderColor: '#dc2626',
  },
  verifyBtnActiveText: {
    color: '#ffffff',
  },
  votedNoticeBox: {
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#64748b',
    alignItems: 'center',
  },
  votedNoticeText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '700',
    textAlign: 'center',
  },
  verifyBtnDisabled: {
    opacity: 0.8,
  },
  verifyBtnDisabledInactive: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    opacity: 0.5,
  },
  verifyBtnDisabledInactiveText: {
    color: '#94a3b8',
  },
  verificationDisclaimer: {
    fontSize: 11,
    color: '#9ca3af',
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  flagModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  flagModalBox: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 18,
  },
  flagModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  flagModalSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 12,
    lineHeight: 18,
  },
  flagInputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    marginTop: 6,
  },
  reasonOptionGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  reasonOptionChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  reasonOptionChipActive: {
    backgroundColor: '#fee2e2',
    borderColor: '#dc2626',
  },
  reasonOptionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  reasonOptionTextActive: {
    color: '#dc2626',
    fontWeight: '700',
  },
  flagTextInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: '#0f172a',
    minHeight: 70,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  flagModalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  flagCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
  },
  flagCancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  flagSubmitBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#dc2626',
  },
  flagSubmitBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  /* Module 09: AI Reliability Styles */
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
    color: '#2563eb',
  },
  aiLoadingBox: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  aiLoadingText: {
    marginTop: 8,
    fontSize: 13,
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
    width: 72,
    height: 72,
    borderRadius: 36,
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
    width: 75,
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
    borderLeftColor: '#2563eb',
  },
  aiSummaryText: {
    fontSize: 13,
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
    color: '#2563eb',
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

