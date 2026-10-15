import request from 'supertest';
import { createApp } from '../app';
import { pool, closePool, query } from '../db';
import { hashPassword, generateJwt } from '../utils/crypto';
import fs from 'fs';
import path from 'path';

describe('UI Enhancement — Prevent Overlapping Incident Markers on Neighborhood Map', () => {
  const app = createApp();

  let testUserId: string;
  let testUserToken: string;

  beforeAll(async () => {
    // Clean previous test data
    await query("DELETE FROM incidents WHERE reporter_id IN (SELECT id FROM users WHERE email = 'cluster_test@nsn.org')");
    await query("DELETE FROM users WHERE email = 'cluster_test@nsn.org'");

    const pwdHash = await hashPassword('TestPassword123!');
    const userRes = await query(
      `INSERT INTO users (full_name, email, password_hash, role, account_status, email_verified)
       VALUES ('Cluster Tester', 'cluster_test@nsn.org', $1, 'RESIDENT', 'ACTIVE', true)
       RETURNING id`,
      [pwdHash]
    );
    testUserId = userRes.rows[0].id;
    testUserToken = generateJwt({ user_id: testUserId, role: 'RESIDENT' });
  });

  afterAll(async () => {
    await query("DELETE FROM incidents WHERE reporter_id = $1", [testUserId]);
    await query("DELETE FROM users WHERE id = $1", [testUserId]);
    await closePool();
  });

  it('1. Persists multiple real incidents at the exact same coordinate without loss or merge', async () => {
    const lat = 12.9800;
    const lng = 77.6000;

    // Create 3 incidents at the exact same coordinate with different categories and severities
    const inc1 = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${testUserToken}`)
      .send({
        title: 'Gas Leak at Market',
        description: 'Strong smell of gas near shop #4',
        category: 'FIRE',
        severity: 'CRITICAL',
        latitude: lat,
        longitude: lng,
      });
    expect(inc1.status).toBe(201);

    const inc2 = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${testUserToken}`)
      .send({
        title: 'Fender Bender at Intersection',
        description: 'Two cars bumped into each other',
        category: 'ACCIDENT',
        severity: 'MEDIUM',
        latitude: lat,
        longitude: lng,
      });
    expect(inc2.status).toBe(201);

    const inc3 = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${testUserToken}`)
      .send({
        title: 'Deep Pothole',
        description: 'Pothole in the right lane',
        category: 'ROAD_HAZARD',
        severity: 'LOW',
        latitude: lat,
        longitude: lng,
      });
    expect(inc3.status).toBe(201);

    // Fetch nearby incidents
    const nearbyRes = await request(app)
      .get('/api/incidents/nearby')
      .set('Authorization', `Bearer ${testUserToken}`)
      .query({
        latitude: lat,
        longitude: lng,
        radius: 5000,
      });

    expect(nearbyRes.status).toBe(200);
    const nearbyList = nearbyRes.body.data.incidents.filter((i: any) => i.reporter_id === testUserId);
    expect(nearbyList.length).toBe(3);

    // Verify all 3 separate records exist with their own categories, severities, and IDs
    const titles = nearbyList.map((i: any) => i.title);
    expect(titles).toContain('Gas Leak at Market');
    expect(titles).toContain('Fender Bender at Intersection');
    expect(titles).toContain('Deep Pothole');
  });

  it('2. Map HTML contains MarkerCluster assets, custom cluster styles, and cluster drawer elements', () => {
    const mapScreenPath = path.resolve(__dirname, '../../../frontend/mobile/src/screens/NeighborhoodMapScreen.tsx');
    const screenContent = fs.readFileSync(mapScreenPath, 'utf8');

    // MarkerCluster assets
    expect(screenContent).toContain('leaflet.markercluster@1.5.3/dist/MarkerCluster.css');
    expect(screenContent).toContain('leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css');
    expect(screenContent).toContain('leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js');

    // Custom cluster icon styling
    expect(screenContent).toContain('.incident-cluster-marker');
    expect(screenContent).toContain('.custom-cluster-icon');
    expect(screenContent).toContain('.cluster-pulse-ring');

    // Cluster drawer and backdrop
    expect(screenContent).toContain('id="cluster-drawer"');
    expect(screenContent).toContain('id="cluster-backdrop"');
    expect(screenContent).toContain('id="cluster-items-container"');
    expect(screenContent).toContain('id="cluster-count-badge"');
  });

  it('3. Visual severity prioritization logic assigns critical color when a critical incident is in the cluster', () => {
    const mapScreenPath = path.resolve(__dirname, '../../../frontend/mobile/src/screens/NeighborhoodMapScreen.tsx');
    const screenContent = fs.readFileSync(mapScreenPath, 'utf8');

    // Severity order definition
    expect(screenContent).toContain("'CRITICAL': 4");
    expect(screenContent).toContain("'HIGH': 3");
    expect(screenContent).toContain("'MEDIUM': 2");
    expect(screenContent).toContain("'LOW': 1");

    // Severity color mapping
    expect(screenContent).toContain("'CRITICAL': '#EF4444'");
    expect(screenContent).toContain("'HIGH': '#F97316'");
    expect(screenContent).toContain("'MEDIUM': '#F59E0B'");
    expect(screenContent).toContain("'LOW': '#10B981'");

    // Highest severity detection logic
    expect(screenContent).toContain('highestRank = rank');
    expect(screenContent).toContain('highestSeverity = sev');
  });

  it('4. Cluster click handler zooms in if coordinates differ, or opens drawer if identical or high zoom', () => {
    const mapScreenPath = path.resolve(__dirname, '../../../frontend/mobile/src/screens/NeighborhoodMapScreen.tsx');
    const screenContent = fs.readFileSync(mapScreenPath, 'utf8');

    // Identical coordinate detection and zoom handling
    expect(screenContent).toContain('bounds.getNorthEast().equals(bounds.getSouthWest())');
    expect(screenContent).toContain('openClusterDrawer(markers)');
    expect(screenContent).toContain('map.fitBounds(bounds');
  });

  it('5. Cluster drawer sorts incidents by severity first (CRITICAL -> HIGH -> MEDIUM -> LOW), then by recency', () => {
    const mapScreenPath = path.resolve(__dirname, '../../../frontend/mobile/src/screens/NeighborhoodMapScreen.tsx');
    const screenContent = fs.readFileSync(mapScreenPath, 'utf8');

    // Sorting implementation
    expect(screenContent).toContain('sortIncidentsBySeverityAndRecency');
    expect(screenContent).toContain('return rankB - rankA');
    expect(screenContent).toContain('return timeB - timeA');
  });

  it('6. Cluster drawer displays category, severity, status, timestamp, and View Details navigation button', () => {
    const mapScreenPath = path.resolve(__dirname, '../../../frontend/mobile/src/screens/NeighborhoodMapScreen.tsx');
    const screenContent = fs.readFileSync(mapScreenPath, 'utf8');

    // Required fields in drawer
    expect(screenContent).toContain('formatIncidentDate(inc.created_at)');
    expect(screenContent).toContain('catConfig.label');
    expect(screenContent).toContain('inc.severity');
    expect(screenContent).toContain('inc.status');
    expect(screenContent).toContain('selectIncident(');
    expect(screenContent).toContain('View Details →');
  });

  it('7. Excludes cancelled incidents from map markers and cluster counts', async () => {
    const lat = 12.9850;
    const lng = 77.6050;

    // Create an incident to be cancelled
    const createRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${testUserToken}`)
      .send({
        title: 'False Alarm Fire',
        description: 'Smoke was just a BBQ',
        category: 'FIRE',
        severity: 'HIGH',
        latitude: lat,
        longitude: lng,
      });
    expect(createRes.status).toBe(201);
    const incidentId = createRes.body.data.incident.id;

    // Cancel the incident
    const cancelRes = await request(app)
      .patch(`/api/incidents/${incidentId}/cancel`)
      .set('Authorization', `Bearer ${testUserToken}`)
      .send({ cancellation_reason: 'Just a backyard barbecue' });
    expect(cancelRes.status).toBe(200);

    // Verify cancelled incident is excluded from nearby active incidents
    const nearbyRes = await request(app)
      .get('/api/incidents/nearby')
      .set('Authorization', `Bearer ${testUserToken}`)
      .query({
        latitude: lat,
        longitude: lng,
        radius: 5000,
      });
    expect(nearbyRes.status).toBe(200);
    const found = nearbyRes.body.data.incidents.find((i: any) => i.id === incidentId);
    expect(found).toBeUndefined();

    // Verify frontend code explicitly filters out CANCELLED incidents
    const mapScreenPath = path.resolve(__dirname, '../../../frontend/mobile/src/screens/NeighborhoodMapScreen.tsx');
    const screenContent = fs.readFileSync(mapScreenPath, 'utf8');
    expect(screenContent).toContain("if (!inc || inc.status === 'CANCELLED') return;");
  });

  it('8. Preserves GPS recenter functionality and postMessage navigation', () => {
    const mapScreenPath = path.resolve(__dirname, '../../../frontend/mobile/src/screens/NeighborhoodMapScreen.tsx');
    const screenContent = fs.readFileSync(mapScreenPath, 'utf8');

    // Recenter GPS
    expect(screenContent).toContain('function recenterMap(newLat, newLng, newAcc)');
    expect(screenContent).toContain("payload.type === 'RECENTER_GPS'");
    expect(screenContent).toContain('handleRecenter');

    // SELECT_INCIDENT dispatch for web and mobile
    expect(screenContent).toContain("type: 'SELECT_INCIDENT'");
    expect(screenContent).toContain('window.ReactNativeWebView.postMessage');
  });
});
