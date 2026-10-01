import React, { useState, useEffect } from 'react';
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
  Platform,
  TextInput,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocation } from '../hooks/useLocation';
import { createIncident } from '../api/client';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import {
  IncidentCategory,
  IncidentSeverity,
  CATEGORY_LABELS,
  SEVERITY_COLORS,
} from '../types/incident';

interface ReportIncidentScreenProps {
  onBack: () => void;
  onSuccess: (incidentId: string) => void;
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

export const ReportIncidentScreen: React.FC<ReportIncidentScreenProps> = ({
  onBack,
  onSuccess,
}) => {
  const { location, loading: locationLoading, error: locationError, requestAndSyncLocation } =
    useLocation();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<IncidentCategory>('ACCIDENT');
  const [severity, setSeverity] = useState<IncidentSeverity>('MEDIUM');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Auto-fetch location on screen mount
  useEffect(() => {
    requestAndSyncLocation();
  }, [requestAndSyncLocation]);

  const handlePickFromGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Gallery access is needed to attach photos to your incident report.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedImage(result.assets[0].uri);
      }
    } catch (err: any) {
      Alert.alert('Image Selection Error', err.message || 'Unable to open photo gallery');
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Camera access is needed to capture photos for your incident report.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedImage(result.assets[0].uri);
      }
    } catch (err: any) {
      Alert.alert('Camera Error', err.message || 'Unable to access camera');
    }
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
  };

  const handleSubmit = async () => {
    setSubmitError(null);

    // Validation
    if (!title.trim()) {
      setSubmitError('Please enter a clear title for this incident.');
      return;
    }

    if (title.trim().length > 255) {
      setSubmitError('Title cannot exceed 255 characters.');
      return;
    }

    if (!description.trim()) {
      setSubmitError('Please provide a description with details about the situation.');
      return;
    }

    if (!location) {
      setSubmitError('Location is required. Please acquire your current location before submitting.');
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('description', description.trim());
      formData.append('category', category);
      formData.append('severity', severity);
      formData.append('latitude', location.latitude.toString());
      formData.append('longitude', location.longitude.toString());

      if (selectedImage) {
        if (Platform.OS === 'web') {
          const res = await fetch(selectedImage);
          const blob = await res.blob();
          formData.append('image', blob, 'incident.jpg');
        } else {
          const filename = selectedImage.split('/').pop() || 'incident.jpg';
          const match = /\.(\w+)$/.exec(filename);
          const mimeType = match ? `image/${match[1]}` : 'image/jpeg';
          // @ts-ignore
          formData.append('image', {
            uri: selectedImage,
            name: filename,
            type: mimeType,
          });
        }
      }

      const response = await createIncident(formData);

      if (response.success && response.data) {
        Alert.alert(
          'Incident Reported',
          'Your incident report has been submitted and is active in your neighborhood network.',
          [
            {
              text: 'View Report',
              onPress: () => onSuccess(response.data!.incident.id),
            },
          ]
        );
        onSuccess(response.data.incident.id);
      } else {
        setSubmitError(response.message || 'Failed to submit incident report');
      }
    } catch (error: any) {
      setSubmitError(error.message || 'A network error occurred while submitting.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>← Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Report Incident</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {submitError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{submitError}</Text>
          </View>
        )}

        {/* 1. Category Selection */}
        <Card>
          <Text style={styles.sectionTitle}>Incident Category</Text>
          <Text style={styles.helperText}>Select the category that best describes the issue:</Text>
          <View style={styles.chipGrid}>
            {CATEGORIES.map((cat) => {
              const isSelected = category === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[styles.categoryChip, isSelected && styles.categoryChipActive]}
                  onPress={() => setCategory(cat)}
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
        </Card>

        {/* 2. Details */}
        <Card>
          <Text style={styles.sectionTitle}>Details</Text>

          <Text style={styles.inputLabel}>Title *</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. Broken water pipeline on Main Street"
            placeholderTextColor="#9ca3af"
            value={title}
            onChangeText={setTitle}
            maxLength={255}
          />
          <Text style={styles.charCount}>{title.length}/255</Text>

          <Text style={styles.inputLabel}>Severity Level *</Text>
          <View style={styles.severityRow}>
            {SEVERITIES.map((sev) => {
              const isSelected = severity === sev;
              const sevColor = SEVERITY_COLORS[sev];
              return (
                <TouchableOpacity
                  key={sev}
                  style={[
                    styles.severityBtn,
                    isSelected && { borderColor: sevColor, backgroundColor: `${sevColor}15` },
                  ]}
                  onPress={() => setSeverity(sev)}
                >
                  <View
                    style={[
                      styles.severityDot,
                      { backgroundColor: sevColor },
                    ]}
                  />
                  <Text
                    style={[
                      styles.severityText,
                      isSelected && { color: sevColor, fontWeight: '700' },
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
            placeholder="Describe the incident in detail (hazard, injuries, obstructions, landmarks)..."
            placeholderTextColor="#9ca3af"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </Card>

        {/* 3. Location Pin */}
        <Card>
          <Text style={styles.sectionTitle}>Incident Location</Text>
          <Text style={styles.helperText}>
            Incidents are geotagged to alert neighbors within your vicinity.
          </Text>

          {locationLoading ? (
            <View style={styles.locationStatusBox}>
              <ActivityIndicator size="small" color="#2563eb" />
              <Text style={styles.locationStatusText}>Acquiring GPS coordinates...</Text>
            </View>
          ) : location ? (
            <View style={styles.locationSuccessBox}>
              <Text style={styles.coordsText}>
                📍 Lat: {location.latitude.toFixed(5)}, Lng: {location.longitude.toFixed(5)}
              </Text>
              {location.accuracy !== null && (
                <Text style={styles.accuracyText}>
                  GPS Accuracy: ~{Math.round(location.accuracy)} meters
                </Text>
              )}
            </View>
          ) : (
            <View style={styles.locationErrorBox}>
              <Text style={styles.locationErrorText}>
                {locationError || 'No GPS coordinates acquired yet.'}
              </Text>
              <Button
                title="Acquire Current Location"
                onPress={requestAndSyncLocation}
                variant="outline"
                style={{ marginTop: 8 }}
              />
            </View>
          )}
        </Card>

        {/* 4. Photo Evidence (Optional) */}
        <Card>
          <Text style={styles.sectionTitle}>Photo Evidence (Optional)</Text>
          <Text style={styles.helperText}>
            Attach a photo from your camera or photo library (Max 5MB):
          </Text>

          {selectedImage ? (
            <View style={styles.previewContainer}>
              <Image source={{ uri: selectedImage }} style={styles.imagePreview} />
              <TouchableOpacity style={styles.removeImageBtn} onPress={handleRemoveImage}>
                <Text style={styles.removeImageText}>✕ Remove Photo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.imageActionRow}>
              <TouchableOpacity style={styles.photoButton} onPress={handleTakePhoto}>
                <Text style={styles.photoButtonIcon}>📷</Text>
                <Text style={styles.photoButtonText}>Take Photo</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.photoButton} onPress={handlePickFromGallery}>
                <Text style={styles.photoButtonIcon}>🖼️</Text>
                <Text style={styles.photoButtonText}>Choose from Gallery</Text>
              </TouchableOpacity>
            </View>
          )}
        </Card>

        {/* Submit Action */}
        <View style={styles.submitSection}>
          <Button
            title={submitting ? 'Submitting Report...' : 'Submit Incident Report'}
            onPress={handleSubmit}
            variant="primary"
            disabled={submitting || locationLoading}
            loading={submitting}
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
    fontSize: 16,
    color: '#2563eb',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  scrollContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  errorBanner: {
    backgroundColor: '#fee2e2',
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
    padding: 12,
    borderRadius: 6,
    marginBottom: 16,
  },
  errorBannerText: {
    color: '#991b1b',
    fontSize: 14,
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 6,
  },
  helperText: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 12,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  categoryChipActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb',
  },
  categoryChipText: {
    fontSize: 13,
    color: '#4b5563',
    fontWeight: '500',
  },
  categoryChipTextActive: {
    color: '#2563eb',
    fontWeight: '700',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginTop: 12,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
  },
  textArea: {
    minHeight: 90,
  },
  charCount: {
    fontSize: 11,
    color: '#9ca3af',
    textAlign: 'right',
    marginTop: 4,
  },
  severityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  severityBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    gap: 6,
  },
  severityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  severityText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4b5563',
  },
  locationStatusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    gap: 10,
  },
  locationStatusText: {
    fontSize: 13,
    color: '#1d4ed8',
    fontWeight: '500',
  },
  locationSuccessBox: {
    padding: 12,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    borderRadius: 8,
  },
  coordsText: {
    fontSize: 14,
    color: '#065f46',
    fontWeight: '600',
  },
  accuracyText: {
    fontSize: 12,
    color: '#047857',
    marginTop: 2,
  },
  locationErrorBox: {
    padding: 12,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
  },
  locationErrorText: {
    fontSize: 13,
    color: '#991b1b',
  },
  imageActionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  photoButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderStyle: 'dashed',
    backgroundColor: '#fafafa',
  },
  photoButtonIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  photoButtonText: {
    fontSize: 13,
    color: '#4b5563',
    fontWeight: '500',
  },
  previewContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  imagePreview: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
  },
  removeImageBtn: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#fee2e2',
  },
  removeImageText: {
    color: '#b91c1c',
    fontSize: 13,
    fontWeight: '600',
  },
  submitSection: {
    marginTop: 10,
    marginBottom: 20,
  },
});
