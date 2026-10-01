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
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import {
  fetchIncidentById,
  updateIncident,
  cancelIncident,
  getFullImageUrl,
} from '../api/client';
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

export const IncidentDetailsScreen: React.FC<IncidentDetailsScreenProps> = ({
  incidentId,
  onBack,
  onIncidentCancelled,
}) => {
  const { user } = useAuth();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState<IncidentCategory>('ACCIDENT');
  const [editSeverity, setEditSeverity] = useState<IncidentSeverity>('MEDIUM');

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
      } else {
        setError(res.message || 'Incident not found');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, [incidentId]);

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

  const handleCancelIncident = () => {
    Alert.alert(
      'Cancel Incident',
      'Are you sure you want to cancel this incident report? This will mark it as CANCELLED across the neighborhood network.',
      [
        { text: 'No, Keep Active', style: 'cancel' },
        {
          text: 'Yes, Cancel Incident',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              const res = await cancelIncident(incidentId);
              if (res.success && res.data) {
                setIncident(res.data.incident);
                Alert.alert('Cancelled', 'Your incident report has been cancelled.');
                if (onIncidentCancelled) onIncidentCancelled();
              } else {
                Alert.alert('Cancel Failed', res.message || 'Failed to cancel incident.');
              }
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to cancel incident.');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
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

        {/* Geotag & Reporter Info */}
        <Card>
          <Text style={styles.sectionTitle}>Location & Verification Info</Text>

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
});
