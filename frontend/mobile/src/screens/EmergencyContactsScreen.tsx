import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import * as Contacts from 'expo-contacts';
import {
  fetchEmergencyContacts,
  createEmergencyContact,
  deleteEmergencyContact,
} from '../api/client';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmergencyContact } from '../types/alert';

interface EmergencyContactsScreenProps {
  onBack: () => void;
}

export const EmergencyContactsScreen: React.FC<EmergencyContactsScreenProps> = ({
  onBack,
}) => {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');

  const loadContacts = useCallback(async () => {
    try {
      const res = await fetchEmergencyContacts();
      if (res.success && res.data) {
        setContacts(res.data.contacts);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  /**
   * Pick single contact using OS native Contact Picker (Requirement 28 & 29).
   * Does NOT upload or read the whole phonebook.
   */
  const handlePickFromDevice = async () => {
    try {
      if (Platform.OS === 'web') {
        setShowManualForm(true);
        return;
      }

      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Contact permission is needed to choose an emergency contact from your device.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Enter Manually', onPress: () => setShowManualForm(true) },
          ]
        );
        return;
      }

      const contact = await Contacts.presentContactPickerAsync();
      if (contact) {
        const contactName =
          contact.name ||
          `${contact.firstName || ''} ${contact.lastName || ''}`.trim() ||
          'Emergency Contact';
        const rawPhone = contact.phoneNumbers?.[0]?.number;

        if (!rawPhone) {
          Alert.alert(
            'Missing Phone Number',
            'The selected contact does not have a phone number. Please enter one manually.',
            [{ text: 'OK', onPress: () => setShowManualForm(true) }]
          );
          return;
        }

        saveContact(contactName, rawPhone);
      }
    } catch (err: any) {
      Alert.alert(
        'Contact Selection',
        'Could not access contact picker. You can enter the contact details manually.',
        [{ text: 'OK', onPress: () => setShowManualForm(true) }]
      );
    }
  };

  const saveContact = async (name: string, phone: string) => {
    setSubmitting(true);
    try {
      const res = await createEmergencyContact({
        contact_name: name.trim(),
        phone_number: phone.trim(),
        is_primary: true,
      });

      if (res.success && res.data) {
        setNameInput('');
        setPhoneInput('');
        setShowManualForm(false);
        loadContacts();
        Alert.alert('Saved', `${name} is now your primary emergency contact.`);
      } else {
        Alert.alert('Save Failed', res.message || 'Unable to save emergency contact');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save contact');
    } finally {
      setSubmitting(false);
    }
  };

  const handleManualSave = () => {
    if (!nameInput.trim()) {
      Alert.alert('Validation Error', 'Please enter contact name.');
      return;
    }
    if (!phoneInput.trim()) {
      Alert.alert('Validation Error', 'Please enter contact phone number.');
      return;
    }
    saveContact(nameInput, phoneInput);
  };

  const handleDelete = (contact: EmergencyContact) => {
    Alert.alert(
      'Remove Contact',
      `Are you sure you want to remove ${contact.contact_name} from your emergency contacts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await deleteEmergencyContact(contact.id);
              if (res.success) {
                loadContacts();
              } else {
                Alert.alert('Failed', res.message || 'Could not delete contact');
              }
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Network error');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Emergency Contacts</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.content}>
        {/* Instructions */}
        <Card>
          <Text style={styles.infoTitle}>Personal Emergency Contact</Text>
          <Text style={styles.infoSubtext}>
            Your primary emergency contact is called or notified when you trigger personal SOS.
            Your device address book is never uploaded or shared.
          </Text>

          <View style={styles.actionRow}>
            {Platform.OS !== 'web' && (
              <Button
                title="📖 Choose from Phonebook"
                onPress={handlePickFromDevice}
                variant="primary"
                style={{ flex: 1 }}
              />
            )}
            <Button
              title={showManualForm ? 'Hide Form' : '✏️ Enter Manually'}
              onPress={() => setShowManualForm(!showManualForm)}
              variant={Platform.OS === 'web' ? 'primary' : 'outline'}
              style={{ flex: 1 }}
            />
          </View>
        </Card>

        {/* Manual Add Form */}
        {showManualForm && (
          <Card>
            <Text style={styles.formTitle}>Add Emergency Contact</Text>

            <Text style={styles.inputLabel}>Contact Name *</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Jane Doe (Sister)"
              placeholderTextColor="#9ca3af"
              value={nameInput}
              onChangeText={setNameInput}
            />

            <Text style={styles.inputLabel}>Phone Number *</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. +91 98765 43210"
              placeholderTextColor="#9ca3af"
              keyboardType="phone-pad"
              value={phoneInput}
              onChangeText={setPhoneInput}
            />

            <Button
              title={submitting ? 'Saving...' : 'Set as Primary Contact'}
              onPress={handleManualSave}
              variant="primary"
              disabled={submitting}
              loading={submitting}
              style={{ marginTop: 14 }}
            />
          </Card>
        )}

        {/* Contacts List */}
        <Text style={styles.sectionHeader}>Saved Emergency Contacts</Text>

        {loading ? (
          <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 20 }} />
        ) : (
          <FlatList
            data={contacts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContainer}
            renderItem={({ item }) => (
              <View style={styles.contactCard}>
                <View style={styles.contactInfo}>
                  <View style={styles.nameRow}>
                    <Text style={styles.contactName}>{item.contact_name}</Text>
                    {item.is_primary && (
                      <View style={styles.primaryBadge}>
                        <Text style={styles.primaryText}>PRIMARY</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.contactPhone}>📞 {item.phone_number}</Text>
                </View>

                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDelete(item)}
                >
                  <Text style={styles.deleteBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No emergency contacts added yet.</Text>
                <Text style={styles.emptySubtext}>
                  Add at least one contact so you can quickly reach them during an emergency.
                </Text>
              </View>
            }
          />
        )}
      </View>
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
  content: {
    flex: 1,
    padding: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  infoSubtext: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginTop: 8,
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
  sectionHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: '#374151',
    marginTop: 16,
    marginBottom: 8,
  },
  listContainer: {
    gap: 8,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  contactInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  contactName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  primaryBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  primaryText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1e40af',
  },
  contactPhone: {
    fontSize: 13,
    color: '#4b5563',
  },
  deleteBtn: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#fee2e2',
  },
  deleteBtnText: {
    color: '#b91c1c',
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  emptySubtext: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 4,
  },
});
