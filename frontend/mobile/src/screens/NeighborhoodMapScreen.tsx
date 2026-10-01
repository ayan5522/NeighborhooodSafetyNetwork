import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  SafeAreaView,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useLocation } from '../hooks/useLocation';
import { fetchNearbyUsers, fetchNeighborhood } from '../api/client';
import { Button } from '../components/Button';
import { Card } from '../components/Card';

interface NeighborhoodMapScreenProps {
  onBack: () => void;
}

export const NeighborhoodMapScreen: React.FC<NeighborhoodMapScreenProps> = ({ onBack }) => {
  const {
    location,
    permissionStatus,
    loading,
    error,
    requestAndSyncLocation,
  } = useLocation();

  const webViewRef = useRef<WebView>(null);
  const [nearbyCount, setNearbyCount] = useState<number | null>(null);
  const [neighborhoodName, setNeighborhoodName] = useState<string | null>(null);

  // Request location on screen mount
  useEffect(() => {
    requestAndSyncLocation();
  }, [requestAndSyncLocation]);

  // When location updates, fetch nearby active count & neighborhood
  useEffect(() => {
    if (location) {
      fetchNearbyUsers(2000).then((res) => {
        if (res.success && res.data) {
          setNearbyCount(res.data.nearby_user_count);
        }
      });

      fetchNeighborhood().then((res) => {
        if (res.success && res.data?.neighborhood) {
          setNeighborhoodName(res.data.neighborhood);
        }
      });
    }
  }, [location]);

  // Leaflet OpenStreetMap HTML
  const generateMapHtml = (lat: number, lng: number, acc: number | null) => {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
          <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
          <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
          <style>
            html, body, #map {
              margin: 0;
              padding: 0;
              width: 100%;
              height: 100%;
              background-color: #f3f4f6;
            }
            .user-pulse {
              background: #2563eb;
              border: 3px solid #ffffff;
              border-radius: 50%;
              width: 18px;
              height: 18px;
              box-shadow: 0 0 10px rgba(37, 99, 235, 0.7);
            }
          </style>
        </head>
        <body>
          <div id="map"></div>
          <script>
            var map = L.map('map', { zoomControl: false }).setView([${lat}, ${lng}], 15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              maxZoom: 19,
              attribution: '© OpenStreetMap contributors'
            }).addTo(map);

            var userIcon = L.divIcon({
              className: 'custom-icon',
              html: '<div class="user-pulse"></div>',
              iconSize: [18, 18],
              iconAnchor: [9, 9]
            });

            var userMarker = L.marker([${lat}, ${lng}], { icon: userIcon }).addTo(map)
              .bindPopup('<b>Your Current Location</b><br>Accuracy: ~${acc ? Math.round(acc) + 'm' : 'Standard'}')
              .openPopup();

            ${
              acc && acc > 0
                ? `L.circle([${lat}, ${lng}], {
                    radius: ${acc},
                    color: '#3b82f6',
                    fillColor: '#60a5fa',
                    fillOpacity: 0.15,
                    weight: 1
                  }).addTo(map);`
                : ''
            }
          </script>
        </body>
      </html>
    `;
  };

  const handleRecenter = () => {
    requestAndSyncLocation();
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Neighborhood Map</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Main Content */}
      <View style={styles.contentContainer}>
        {loading && !location ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Acquiring your location...</Text>
            <Text style={styles.subLoadingText}>Using device GPS / Location services</Text>
          </View>
        ) : error && !location ? (
          <View style={styles.errorContainer}>
            <Card>
              <Text style={styles.errorTitle}>Location Access</Text>
              <Text style={styles.errorMessage}>{error}</Text>
              <Button
                title="Try Again"
                onPress={requestAndSyncLocation}
                variant="primary"
                style={{ marginTop: 12 }}
              />
            </Card>
          </View>
        ) : location ? (
          <View style={styles.mapWrapper}>
            {Platform.OS === 'web' ? (
              <iframe
                title="Neighborhood Map"
                srcDoc={generateMapHtml(
                  location.latitude,
                  location.longitude,
                  location.accuracy
                )}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                }}
              />
            ) : (
              <WebView
                ref={webViewRef}
                originWhitelist={['*']}
                source={{
                  html: generateMapHtml(
                    location.latitude,
                    location.longitude,
                    location.accuracy
                  ),
                }}
                style={styles.map}
                javaScriptEnabled={true}
                domStorageEnabled={true}
              />
            )}

            {/* Overlay Info Card */}
            <View style={styles.infoOverlay}>
              <View style={styles.statRow}>
                <View style={styles.statBadge}>
                  <Text style={styles.statLabel}>Neighborhood Area</Text>
                  <Text style={styles.statValue}>
                    {neighborhoodName || 'Local Sector (PostGIS)'}
                  </Text>
                </View>
                {nearbyCount !== null && (
                  <View style={styles.statBadge}>
                    <Text style={styles.statLabel}>Active Nearby</Text>
                    <Text style={styles.statValue}>{nearbyCount} Resident(s)</Text>
                  </View>
                )}
              </View>

              <Button
                title={loading ? 'Updating Location...' : '📍 Use My Location'}
                onPress={handleRecenter}
                loading={loading}
                variant="primary"
                style={styles.recenterButton}
              />
            </View>
          </View>
        ) : null}
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
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  backButtonText: {
    color: '#2563eb',
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  contentContainer: {
    flex: 1,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 14,
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  subLoadingText: {
    marginTop: 6,
    fontSize: 13,
    color: '#6b7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#b91c1c',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: '#4b5563',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  mapWrapper: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  infoOverlay: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  statBadge: {
    flex: 1,
    paddingHorizontal: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  statValue: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '700',
    marginTop: 2,
  },
  recenterButton: {
    marginTop: 6,
  },
});
