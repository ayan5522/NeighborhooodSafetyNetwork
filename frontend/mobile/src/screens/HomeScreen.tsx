import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { Card } from '../components/Card';

interface HomeScreenProps {
  onNavigateProfile: () => void;
  onNavigateMap: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onNavigateProfile,
  onNavigateMap,
}) => {
  const { user, logout } = useAuth();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.welcomeText}>Welcome back,</Text>
          <Text style={styles.userName}>{user?.full_name || 'Resident'}</Text>
        </View>

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
          <Text style={styles.cardTitle}>Neighborhood Safety</Text>
          <Text style={styles.networkStatus}>
            🟢 System Foundation & Authentication Operational
          </Text>
          <Text style={styles.networkSubtext}>
            Connected to neighborhood_safety_db with PostGIS spatial indexing.
          </Text>
        </Card>

        <View style={styles.actionButtons}>
          <Button
            title="🗺️ Open Neighborhood Map"
            onPress={onNavigateMap}
            variant="primary"
          />
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
  actionButtons: {
    marginTop: 10,
    gap: 8,
  },
});
