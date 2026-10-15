import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  Alert,
  Linking,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useLocation } from '../hooks/useLocation';
import { useNotifications } from '../context/NotificationContext';
import { fetchNearbyUsers, fetchNeighborhood, fetchNearbyIncidents } from '../api/client';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Incident } from '../types/incident';

interface NeighborhoodMapScreenProps {
  onBack: () => void;
  onSelectIncident?: (id: string) => void;
  onNavigateReport?: () => void;
}

export const NeighborhoodMapScreen: React.FC<NeighborhoodMapScreenProps> = ({
  onBack,
  onSelectIncident,
  onNavigateReport,
}) => {
  const {
    location,
    permissionStatus,
    servicesEnabled,
    loading,
    error,
    requestAndSyncLocation,
  } = useLocation();

  const { unreadCount: unreadNotifCount } = useNotifications();
  const webViewRef = useRef<WebView>(null);
  const iframeRef = useRef<any>(null);
  const isLocatingRef = useRef<boolean>(false);
  const [nearbyCount, setNearbyCount] = useState<number | null>(null);
  const [neighborhoodName, setNeighborhoodName] = useState<string | null>(null);
  const [nearbyIncidents, setNearbyIncidents] = useState<Incident[]>([]);

  const loadNearbyData = useCallback(async (lat: number, lng: number) => {
    try {
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

      const res = await fetchNearbyIncidents(lat, lng, 5000);
      if (res.success && res.data) {
        // Exclude cancelled incidents immediately from active map state
        const activeIncidents = (res.data.incidents || []).filter(
          (inc) => inc.status !== 'CANCELLED'
        );
        setNearbyIncidents(activeIncidents);
      }
    } catch (err) {
      console.warn('Failed to fetch nearby map data:', err);
    }
  }, []);

  // Request location on screen mount
  useEffect(() => {
    requestAndSyncLocation();
  }, [requestAndSyncLocation]);

  // When location updates or notification arrives (e.g. alert cancellation), refresh nearby incidents
  useEffect(() => {
    if (location) {
      loadNearbyData(location.latitude, location.longitude);
    }
  }, [location, loadNearbyData, unreadNotifCount]);

  // Web event listener for postMessage from Leaflet popup
  useEffect(() => {
    if (Platform.OS === 'web') {
      const handleWebMessage = (event: MessageEvent) => {
        if (event.data && event.data.type === 'SELECT_INCIDENT' && onSelectIncident) {
          onSelectIncident(event.data.id);
        }
      };
      window.addEventListener('message', handleWebMessage);
      return () => window.removeEventListener('message', handleWebMessage);
    }
  }, [onSelectIncident]);

  // Leaflet OpenStreetMap HTML
  const generateMapHtml = (
    lat: number,
    lng: number,
    acc: number | null,
    incidents: Incident[]
  ) => {
    const serializedIncidents = JSON.stringify(incidents);

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
          <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
          <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" />
          <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css" />
          <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
          <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
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
            .custom-incident-marker, .custom-icon, .custom-cluster-icon {
              background: transparent !important;
              border: none !important;
            }
            .incident-marker {
              position: relative;
              width: 32px;
              height: 32px;
              border-radius: 50%;
              border: 2px solid #ffffff;
              box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
              display: flex;
              align-items: center;
              justify-content: center;
              box-sizing: border-box;
              cursor: pointer;
              transition: transform 0.15s ease-in-out;
            }
            .incident-marker:hover {
              transform: scale(1.15);
            }
            .incident-marker svg {
              display: block;
              width: 18px;
              height: 18px;
            }
            .incident-severity-dot {
              position: absolute;
              top: -2px;
              right: -2px;
              width: 9px;
              height: 9px;
              border-radius: 50%;
              border: 2px solid #ffffff;
              box-sizing: border-box;
            }
            .incident-cluster-marker {
              border-radius: 50%;
              border: 3px solid #ffffff;
              box-shadow: 0 3px 8px rgba(0, 0, 0, 0.4);
              display: flex;
              align-items: center;
              justify-content: center;
              font-family: system-ui, -apple-system, sans-serif;
              font-weight: 800;
              color: #ffffff;
              position: relative;
              cursor: pointer;
              box-sizing: border-box;
              transition: transform 0.15s ease-in-out;
            }
            .incident-cluster-marker:hover {
              transform: scale(1.12);
            }
            .cluster-pulse-ring {
              position: absolute;
              top: -4px;
              left: -4px;
              right: -4px;
              bottom: -4px;
              border-radius: 50%;
              border: 2px solid;
              opacity: 0.6;
              pointer-events: none;
            }
          </style>
        </head>
        <body>
          <div id="map"></div>
          <div id="cluster-backdrop" onclick="closeClusterDrawer()" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.35);z-index:9998;"></div>
          <div id="cluster-drawer" style="display:none;position:fixed;bottom:0;left:0;right:0;max-height:65%;background:#ffffff;border-radius:16px 16px 0 0;box-shadow:0 -4px 20px rgba(0,0,0,0.25);z-index:9999;flex-direction:column;font-family:system-ui,-apple-system,sans-serif;box-sizing:border-box;overflow:hidden;">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #e5e7eb;background:#f9fafb;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:14px;font-weight:700;color:#111827;">Incidents in this Area</span>
                <span id="cluster-count-badge" style="padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;background:#2563eb;color:#ffffff;">0</span>
              </div>
              <button onclick="closeClusterDrawer()" style="background:none;border:none;font-size:18px;line-height:1;color:#6b7280;cursor:pointer;padding:4px 8px;">✕</button>
            </div>
            <div id="cluster-items-container" style="overflow-y:auto;padding:12px 16px;max-height:calc(65vh - 50px);display:flex;flex-direction:column;gap:10px;"></div>
          </div>
          <script>
            var map = L.map('map', { zoomControl: false }).setView([${lat}, ${lng}], 14);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              maxZoom: 19,
              attribution: '© OpenStreetMap contributors'
            }).addTo(map);

            // User location marker
            var userIcon = L.divIcon({
              className: 'custom-icon',
              html: '<div class="user-pulse"></div>',
              iconSize: [18, 18],
              iconAnchor: [9, 9]
            });

            var userMarker = L.marker([${lat}, ${lng}], { icon: userIcon }).addTo(map)
              .bindPopup('<b>Your Current Location</b><br>Accuracy: ~${acc ? Math.round(acc) + 'm' : 'Standard'}');

            var userCircle = null;
            ${
              acc && acc > 0
                ? `userCircle = L.circle([${lat}, ${lng}], {
                    radius: ${acc},
                    color: '#3b82f6',
                    fillColor: '#60a5fa',
                    fillOpacity: 0.15,
                    weight: 1
                  }).addTo(map);`
                : ''
            }

            // Recenter function to smoothly animate camera and update location marker
            function recenterMap(newLat, newLng, newAcc) {
              if (map) {
                map.setView([newLat, newLng], 14, { animate: true });
              }
              if (userMarker) {
                userMarker.setLatLng([newLat, newLng]);
                var accText = newAcc ? Math.round(newAcc) + 'm' : 'Standard';
                userMarker.setPopupContent('<b>Your Current Location</b><br>Accuracy: ~' + accText);
              }
              if (userCircle) {
                userCircle.setLatLng([newLat, newLng]);
                if (newAcc && newAcc > 0) {
                  userCircle.setRadius(newAcc);
                }
              } else if (newAcc && newAcc > 0 && map) {
                userCircle = L.circle([newLat, newLng], {
                  radius: newAcc,
                  color: '#3b82f6',
                  fillColor: '#60a5fa',
                  fillOpacity: 0.15,
                  weight: 1
                }).addTo(map);
              }
            }
            window.recenterMap = recenterMap;

            function handleMessage(event) {
              try {
                var payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                if (payload && payload.type === 'RECENTER_GPS') {
                  recenterMap(payload.latitude, payload.longitude, payload.accuracy);
                }
              } catch (e) {}
            }
            window.addEventListener('message', handleMessage);
            document.addEventListener('message', handleMessage);

            // Category Configurations
            var CATEGORY_CONFIG = {
              FIRE: {
                color: '#DC2626',
                label: 'Fire',
                iconSvg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM12 20c-3.31 0-6-2.69-6-6 0-1.53.5-3.04 1.4-4.24.47 1.25 1.56 2.24 3.1 2.24 1.84 0 3.5-1.5 3.5-3.5 0-.46-.11-.93-.24-1.36 2.07 1.84 3.24 4.23 3.24 6.86 0 3.31-2.69 6-6 6z"/></svg>'
              },
              ACCIDENT: {
                color: '#2563EB',
                label: 'Accident',
                iconSvg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>'
              },
              SUSPICIOUS_ACTIVITY: {
                color: '#EA580C',
                label: 'Suspicious Activity',
                iconSvg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1 6h2v6h-2V7zm0 8h2v2h-2v-2z"/></svg>'
              },
              ROAD_HAZARD: {
                color: '#D97706',
                label: 'Road Hazard',
                iconSvg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>'
              },
              FLOOD_WATERLOGGING: {
                color: '#0284C7',
                label: 'Flood / Waterlogging',
                iconSvg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></svg>'
              },
              MEDICAL_EMERGENCY: {
                color: '#7C3AED',
                label: 'Medical Emergency',
                iconSvg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M19 10.5h-5.5V5c0-.55-.45-1-1-1h-1c-.55 0-1 .45-1 1v5.5H5c-.55 0-1 .45-1 1v1c0 .55.45 1 1 1h5.5V19c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-5.5H19c.55 0 1-.45 1-1v-1c0-.55-.45-1-1-1z"/></svg>'
              },
              INFRASTRUCTURE_ISSUE: {
                color: '#B45309',
                label: 'Infrastructure Issue',
                iconSvg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>'
              },
              OTHER: {
                color: '#64748B',
                label: 'Other',
                iconSvg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>'
              }
            };

            function getCategoryConfig(category) {
              if (category && CATEGORY_CONFIG[category]) {
                return CATEGORY_CONFIG[category];
              }
              return CATEGORY_CONFIG.OTHER;
            }

            function escapeHtml(str) {
              if (!str) return '';
              return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
            }

            var SEVERITY_ORDER = {
              'CRITICAL': 4,
              'HIGH': 3,
              'MEDIUM': 2,
              'LOW': 1
            };

            var SEVERITY_COLORS = {
              'CRITICAL': '#EF4444',
              'HIGH': '#F97316',
              'MEDIUM': '#F59E0B',
              'LOW': '#10B981'
            };

            function selectIncident(id) {
              try {
                if (window.parent && window.parent.postMessage) {
                  window.parent.postMessage({ type: 'SELECT_INCIDENT', id: id }, '*');
                }
              } catch (e) {}
              try {
                if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SELECT_INCIDENT', id: id }));
                }
              } catch (e) {}
            }
            window.selectIncident = selectIncident;

            function formatIncidentDate(dateStr) {
              if (!dateStr) return '';
              try {
                var d = new Date(dateStr);
                if (isNaN(d.getTime())) return String(dateStr);
                return d.toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                });
              } catch (e) {
                return String(dateStr);
              }
            }

            function sortIncidentsBySeverityAndRecency(incList) {
              return incList.slice().sort(function(a, b) {
                var rankA = SEVERITY_ORDER[a.severity] || 0;
                var rankB = SEVERITY_ORDER[b.severity] || 0;
                if (rankB !== rankA) {
                  return rankB - rankA;
                }
                var timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
                var timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
                return timeB - timeA;
              });
            }

            function openClusterDrawer(markers) {
              var container = document.getElementById('cluster-items-container');
              var badge = document.getElementById('cluster-count-badge');
              var drawer = document.getElementById('cluster-drawer');
              var backdrop = document.getElementById('cluster-backdrop');
              if (!container || !drawer) return;

              var incList = [];
              markers.forEach(function(m) {
                if (m.incidentData) incList.push(m.incidentData);
              });

              incList = sortIncidentsBySeverityAndRecency(incList);

              if (badge) {
                badge.textContent = incList.length + (incList.length === 1 ? ' Incident' : ' Incidents');
              }

              var html = '';
              incList.forEach(function(inc) {
                var catConfig = getCategoryConfig(inc.category);
                var severityColor = SEVERITY_COLORS[inc.severity] || '#10B981';
                var formattedDate = formatIncidentDate(inc.created_at);

                html += '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.05);display:flex;flex-direction:column;gap:6px;">' +
                          '<div style="display:flex;align-items:center;justify-content:space-between;">' +
                            '<div style="display:flex;align-items:center;gap:6px;">' +
                              '<span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:' + catConfig.color + ';">' +
                                catConfig.iconSvg +
                              '</span>' +
                              '<span style="font-size:11px;font-weight:700;color:' + catConfig.color + ';text-transform:uppercase;letter-spacing:0.5px;">' + escapeHtml(catConfig.label) + '</span>' +
                            '</div>' +
                            '<span style="padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;color:#fff;background:' + severityColor + ';">' + escapeHtml(inc.severity) + '</span>' +
                          '</div>' +
                          '<div style="font-size:13px;font-weight:600;color:#111827;">' + escapeHtml(inc.title || 'Incident') + '</div>' +
                          '<div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;color:#6b7280;">' +
                            '<span>Status: <strong style="color:#374151;">' + escapeHtml(inc.status) + '</strong></span>' +
                            (formattedDate ? '<span>' + escapeHtml(formattedDate) + '</span>' : '') +
                          '</div>' +
                          '<button onclick="selectIncident(\\'' + inc.id + '\\')" style="margin-top:4px;width:100%;padding:7px 10px;background:#2563eb;color:#ffffff;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;">View Details →</button>' +
                        '</div>';
              });

              container.innerHTML = html;
              drawer.style.display = 'flex';
              if (backdrop) backdrop.style.display = 'block';
            }

            function closeClusterDrawer() {
              var drawer = document.getElementById('cluster-drawer');
              var backdrop = document.getElementById('cluster-backdrop');
              if (drawer) drawer.style.display = 'none';
              if (backdrop) backdrop.style.display = 'none';
            }
            window.closeClusterDrawer = closeClusterDrawer;

            map.on('click', function() {
              closeClusterDrawer();
            });

            // Render Incident markers (active, non-cancelled only)
            var incidents = ${serializedIncidents};
            var incidentMarkers = [];

            incidents.forEach(function(inc) {
              if (!inc || inc.status === 'CANCELLED') return;
              var catConfig = getCategoryConfig(inc.category);
              var severityColor = SEVERITY_COLORS[inc.severity] || '#10B981';

              var icon = L.divIcon({
                className: 'custom-incident-marker',
                html: '<div class="incident-marker" style="background-color:' + catConfig.color + ';" title="' + escapeHtml(inc.title || catConfig.label) + '">' +
                        catConfig.iconSvg +
                        '<span class="incident-severity-dot" style="background-color:' + severityColor + ';"></span>' +
                      '</div>',
                iconSize: [32, 32],
                iconAnchor: [16, 16],
                popupAnchor: [0, -16]
              });

              var marker = L.marker([inc.latitude, inc.longitude], { icon: icon });
              marker.incidentData = inc;

              var formattedDate = formatIncidentDate(inc.created_at);
              var popupContent = 
                '<div style="font-family:system-ui,-apple-system,sans-serif;min-width:170px;padding:2px 0;">' +
                  '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">' +
                    '<span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:' + catConfig.color + ';">' +
                      catConfig.iconSvg +
                    '</span>' +
                    '<strong style="font-size:12px;color:' + catConfig.color + ';text-transform:uppercase;letter-spacing:0.5px;">' + escapeHtml(catConfig.label) + '</strong>' +
                  '</div>' +
                  '<strong style="font-size:13px;color:#111827;display:block;margin-bottom:4px;">' + escapeHtml(inc.title || 'Incident') + '</strong>' +
                  '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:11px;">' +
                    '<span style="padding:2px 6px;border-radius:4px;font-weight:700;color:#fff;background:' + severityColor + ';">' + escapeHtml(inc.severity) + '</span>' +
                    '<span style="color:#6b7280;">Status: ' + escapeHtml(inc.status) + '</span>' +
                  '</div>' +
                  (formattedDate ? '<div style="font-size:11px;color:#6b7280;margin-bottom:6px;">' + escapeHtml(formattedDate) + '</div>' : '') +
                  '<button onclick="selectIncident(\\'' + inc.id + '\\')" style="margin-top:4px;width:100%;padding:6px 10px;background:#2563eb;color:#fff;border:none;border-radius:5px;font-size:11px;font-weight:bold;cursor:pointer;">View Details →</button>' +
                '</div>';

              marker.bindPopup(popupContent);
              incidentMarkers.push(marker);
            });

            if (typeof L.markerClusterGroup === 'function') {
              var clusterGroup = L.markerClusterGroup({
                maxClusterRadius: 45,
                spiderfyOnMaxZoom: true,
                showCoverageOnHover: false,
                zoomToBoundsOnClick: false,
                iconCreateFunction: function(cluster) {
                  var markers = cluster.getAllChildMarkers();
                  var count = markers.length;

                  var highestRank = 1;
                  var highestSeverity = 'LOW';
                  markers.forEach(function(m) {
                    var sev = (m.incidentData && m.incidentData.severity) ? m.incidentData.severity : 'LOW';
                    var rank = SEVERITY_ORDER[sev] || 1;
                    if (rank > highestRank) {
                      highestRank = rank;
                      highestSeverity = sev;
                    }
                  });

                  var color = SEVERITY_COLORS[highestSeverity] || '#10B981';
                  var size = count > 99 ? 44 : (count > 9 ? 38 : 34);
                  var fontSize = count > 99 ? 12 : (count > 9 ? 13 : 14);

                  return L.divIcon({
                    className: 'custom-cluster-icon',
                    html: '<div class="incident-cluster-marker" style="width:' + size + 'px;height:' + size + 'px;font-size:' + fontSize + 'px;background-color:' + color + ';" title="' + count + ' incidents (Highest severity: ' + highestSeverity + ')">' +
                            '<span>' + count + '</span>' +
                            '<div class="cluster-pulse-ring" style="border-color:' + color + ';"></div>' +
                          '</div>',
                    iconSize: [size, size],
                    iconAnchor: [size / 2, size / 2]
                  });
                }
              });

              clusterGroup.on('clusterclick', function(c) {
                var cluster = c.layer;
                var bounds = cluster.getBounds();
                var markers = cluster.getAllChildMarkers();
                var isSameCoord = bounds.getNorthEast().equals(bounds.getSouthWest());
                var currentZoom = map.getZoom();

                if (isSameCoord || currentZoom >= 16) {
                  openClusterDrawer(markers);
                } else {
                  map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
                }
              });

              incidentMarkers.forEach(function(marker) {
                clusterGroup.addLayer(marker);
              });
              map.addLayer(clusterGroup);
            } else {
              incidentMarkers.forEach(function(marker) {
                marker.addTo(map);
              });
            }
          </script>
        </body>
      </html>
    `;
  };

  const centerMapCamera = (lat: number, lng: number, acc: number | null) => {
    if (Platform.OS === 'web') {
      const iframe = iframeRef.current;
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(
          {
            type: 'RECENTER_GPS',
            latitude: lat,
            longitude: lng,
            accuracy: acc,
          },
          '*'
        );
      }
    } else {
      const js = `
        if (typeof window.recenterMap === 'function') {
          window.recenterMap(${lat}, ${lng}, ${acc !== null ? acc : 'null'});
        }
        true;
      `;
      webViewRef.current?.injectJavaScript(js);
    }
  };

  const handleRecenter = async () => {
    if (isLocatingRef.current || loading) {
      return;
    }
    isLocatingRef.current = true;

    try {
      const result = await requestAndSyncLocation();

      if (result.success && result.location) {
        centerMapCamera(
          result.location.latitude,
          result.location.longitude,
          result.location.accuracy
        );
        loadNearbyData(result.location.latitude, result.location.longitude);
      } else if (result.permissionDenied) {
        Alert.alert(
          'Location Permission Required',
          'Location permission is required to center the neighborhood map around your location. Please enable location permission in your device settings.',
          Platform.OS === 'web'
            ? [{ text: 'OK' }]
            : [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Open Settings',
                  onPress: () => {
                    Linking.openSettings();
                  },
                },
              ]
        );
      } else if (result.servicesDisabled) {
        Alert.alert(
          'Location Services Disabled',
          'Location services (GPS) are turned off on your device. Please turn on GPS in your device settings to recenter the map.',
          Platform.OS === 'web'
            ? [{ text: 'OK' }]
            : [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Open Settings',
                  onPress: () => {
                    Linking.openSettings();
                  },
                },
              ]
        );
      } else if (result.error) {
        Alert.alert('Location Error', result.error);
      }
    } finally {
      isLocatingRef.current = false;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Neighborhood Map</Text>
        {onNavigateReport ? (
          <TouchableOpacity style={styles.reportNavBtn} onPress={onNavigateReport}>
            <Text style={styles.reportNavBtnText}>+ Report</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 60 }} />
        )}
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
              <View style={{ gap: 8, marginTop: 12 }}>
                <Button
                  title="Try Again"
                  onPress={handleRecenter}
                  variant="primary"
                  loading={loading}
                  disabled={loading}
                />
                {Platform.OS !== 'web' && (permissionStatus === 'denied' || !servicesEnabled) && (
                  <Button
                    title="Open Settings"
                    onPress={() => Linking.openSettings()}
                    variant="outline"
                  />
                )}
              </View>
            </Card>
          </View>
        ) : location ? (
          <View style={styles.mapWrapper}>
            {Platform.OS === 'web' ? (
              <iframe
                ref={iframeRef}
                title="Neighborhood Map"
                srcDoc={generateMapHtml(
                  location.latitude,
                  location.longitude,
                  location.accuracy,
                  nearbyIncidents
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
                    location.accuracy,
                    nearbyIncidents
                  ),
                }}
                onMessage={(event) => {
                  try {
                    const data = JSON.parse(event.nativeEvent.data);
                    if (data.type === 'SELECT_INCIDENT' && onSelectIncident) {
                      onSelectIncident(data.id);
                    }
                  } catch {}
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
                <View style={styles.statBadge}>
                  <Text style={styles.statLabel}>Incidents (5km)</Text>
                  <Text style={[styles.statValue, { color: nearbyIncidents.length > 0 ? '#dc2626' : '#166534' }]}>
                    {nearbyIncidents.length} Active
                  </Text>
                </View>
              </View>

              <View style={styles.actionRow}>
                <Button
                  title={loading ? 'Updating...' : '📍 Recenter GPS'}
                  onPress={handleRecenter}
                  loading={loading}
                  disabled={loading}
                  variant="outline"
                  style={{ flex: 1 }}
                />
                {onNavigateReport && (
                  <Button
                    title="⚠️ Report Incident"
                    onPress={onNavigateReport}
                    variant="primary"
                    style={{ flex: 1 }}
                  />
                )}
              </View>
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
  reportNavBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  reportNavBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
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
    gap: 10,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statBadge: {
    flex: 1,
    paddingHorizontal: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '500',
  },
  statValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '700',
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
});
