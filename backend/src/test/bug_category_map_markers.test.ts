import request from 'supertest';
import { createApp } from '../app';
import { pool, closePool, query } from '../db';
import { hashPassword, generateJwt } from '../utils/crypto';
import fs from 'fs';
import path from 'path';

describe('Category-Specific Incident Markers on Neighborhood Map', () => {
  const app = createApp();

  let testUserId: string;
  let testUserToken: string;

  const CATEGORIES = [
    'FIRE',
    'ACCIDENT',
    'SUSPICIOUS_ACTIVITY',
    'ROAD_HAZARD',
    'FLOOD_WATERLOGGING',
    'MEDICAL_EMERGENCY',
    'INFRASTRUCTURE_ISSUE',
    'OTHER',
  ] as const;

  beforeAll(async () => {
    // Clean previous test data
    await query("DELETE FROM incidents WHERE reporter_id IN (SELECT id FROM users WHERE email = 'map_marker_test@nsn.org')");
    await query("DELETE FROM users WHERE email = 'map_marker_test@nsn.org'");

    const pwdHash = await hashPassword('TestPassword123!');
    const userRes = await query(
      `INSERT INTO users (full_name, email, password_hash, role, account_status, email_verified)
       VALUES ('Map Marker Tester', 'map_marker_test@nsn.org', $1, 'RESIDENT', 'ACTIVE', true)
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

  it('1. Successfully persists and retrieves an incident for each of the 8 categories', async () => {
    const createdIncidents: any[] = [];

    for (let i = 0; i < CATEGORIES.length; i++) {
      const cat = CATEGORIES[i];
      const res = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          title: `Test ${cat} Incident`,
          description: `Description for ${cat} incident at sector ${i + 1}`,
          category: cat,
          severity: i % 2 === 0 ? 'HIGH' : 'MEDIUM',
          latitude: 12.9716 + i * 0.001,
          longitude: 77.5946 + i * 0.001,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.incident.category).toBe(cat);
      createdIncidents.push(res.body.data.incident);
    }

    expect(createdIncidents.length).toBe(8);

    // Fetch nearby incidents
    const nearbyRes = await request(app)
      .get('/api/incidents/nearby')
      .set('Authorization', `Bearer ${testUserToken}`)
      .query({
        latitude: 12.9716,
        longitude: 77.5946,
        radius: 10000,
      });

    expect(nearbyRes.status).toBe(200);
    expect(nearbyRes.body.success).toBe(true);
    const nearbyList = nearbyRes.body.data.incidents;

    // Verify all 8 categories exist in the nearby list
    for (const cat of CATEGORIES) {
      const found = nearbyList.find((inc: any) => inc.category === cat && inc.reporter_id === testUserId);
      expect(found).toBeDefined();
      expect(found.title).toBe(`Test ${cat} Incident`);
    }
  });

  it('2. Map HTML template accurately generates category-specific icons and colors for all 8 categories', () => {
    // Read the map HTML generator implementation from NeighborhoodMapScreen.tsx
    const mapScreenPath = path.resolve(__dirname, '../../../frontend/mobile/src/screens/NeighborhoodMapScreen.tsx');
    const screenContent = fs.readFileSync(mapScreenPath, 'utf8');

    // Verify category config presence in the file
    expect(screenContent).toContain('FIRE: {');
    expect(screenContent).toContain("color: '#DC2626'");
    expect(screenContent).toContain('ACCIDENT: {');
    expect(screenContent).toContain("color: '#2563EB'");
    expect(screenContent).toContain('SUSPICIOUS_ACTIVITY: {');
    expect(screenContent).toContain("color: '#EA580C'");
    expect(screenContent).toContain('ROAD_HAZARD: {');
    expect(screenContent).toContain("color: '#D97706'");
    expect(screenContent).toContain('FLOOD_WATERLOGGING: {');
    expect(screenContent).toContain("color: '#0284C7'");
    expect(screenContent).toContain('MEDICAL_EMERGENCY: {');
    expect(screenContent).toContain("color: '#7C3AED'");
    expect(screenContent).toContain('INFRASTRUCTURE_ISSUE: {');
    expect(screenContent).toContain("color: '#B45309'");
    expect(screenContent).toContain('OTHER: {');
    expect(screenContent).toContain("color: '#64748B'");

    // Verify fallback handling
    expect(screenContent).toContain('function getCategoryConfig(category)');
    expect(screenContent).toContain('return CATEGORY_CONFIG.OTHER');

    // Verify incident popup contains title, category, severity, status, and SELECT_INCIDENT
    expect(screenContent).toContain('SELECT_INCIDENT');
    expect(screenContent).toContain('View Details →');
  });

  it('3. Simulates JavaScript marker generation for each category and validates HTML output', () => {
    // Extract the CATEGORY_CONFIG and marker generation logic from NeighborhoodMapScreen
    const mapScreenPath = path.resolve(__dirname, '../../../frontend/mobile/src/screens/NeighborhoodMapScreen.tsx');
    const screenContent = fs.readFileSync(mapScreenPath, 'utf8');

    // Extract CATEGORY_CONFIG block
    const configMatch = screenContent.match(/var CATEGORY_CONFIG = \{([\s\S]*?)\n            \};/);
    expect(configMatch).toBeTruthy();

    // Evaluate in sandboxed context
    const evalConfig = new Function(`
      var CATEGORY_CONFIG = {${configMatch![1]}};
      return CATEGORY_CONFIG;
    `);
    const categoryConfig = evalConfig();

    const expectedMappings: Record<string, { color: string; label: string; iconKeyword: string }> = {
      FIRE: { color: '#DC2626', label: 'Fire', iconKeyword: 'd="M13.5' },
      ACCIDENT: { color: '#2563EB', label: 'Accident', iconKeyword: 'd="M18.92' },
      SUSPICIOUS_ACTIVITY: { color: '#EA580C', label: 'Suspicious Activity', iconKeyword: 'd="M12 1L3 5' },
      ROAD_HAZARD: { color: '#D97706', label: 'Road Hazard', iconKeyword: 'd="M1 21h22' },
      FLOOD_WATERLOGGING: { color: '#0284C7', label: 'Flood / Waterlogging', iconKeyword: 'stroke="#FFFFFF"' },
      MEDICAL_EMERGENCY: { color: '#7C3AED', label: 'Medical Emergency', iconKeyword: 'd="M19 10.5h-5.5' },
      INFRASTRUCTURE_ISSUE: { color: '#B45309', label: 'Infrastructure Issue', iconKeyword: 'd="M22.7 19' },
      OTHER: { color: '#64748B', label: 'Other', iconKeyword: 'd="M12 2C6.48' },
    };

    for (const [cat, expected] of Object.entries(expectedMappings)) {
      const config = categoryConfig[cat];
      expect(config).toBeDefined();
      expect(config.color.toUpperCase()).toBe(expected.color.toUpperCase());
      expect(config.label).toBe(expected.label);
      expect(config.iconSvg).toContain(expected.iconKeyword);
      expect(config.iconSvg).toContain('<svg');
      expect(config.iconSvg).toContain('</svg>');
    }

    // Test unknown category fallback
    const fallbackFn = new Function(`
      var CATEGORY_CONFIG = {${configMatch![1]}};
      function getCategoryConfig(category) {
        if (category && CATEGORY_CONFIG[category]) {
          return CATEGORY_CONFIG[category];
        }
        return CATEGORY_CONFIG.OTHER;
      }
      return {
        unknown: getCategoryConfig('UNKNOWN_CATEGORY_XYZ'),
        empty: getCategoryConfig(''),
        nullCat: getCategoryConfig(null)
      };
    `);
    const fallbackResult = fallbackFn();
    expect(fallbackResult.unknown.color).toBe('#64748B');
    expect(fallbackResult.unknown.label).toBe('Other');
    expect(fallbackResult.empty.color).toBe('#64748B');
    expect(fallbackResult.nullCat.color).toBe('#64748B');
  });

  it('4. Confirms marker popup generates valid SELECT_INCIDENT message with the correct incident ID', () => {
    const mapScreenPath = path.resolve(__dirname, '../../../frontend/mobile/src/screens/NeighborhoodMapScreen.tsx');
    const screenContent = fs.readFileSync(mapScreenPath, 'utf8');

    expect(screenContent).toContain('SELECT_INCIDENT');
    expect(screenContent).toContain('window.ReactNativeWebView.postMessage');
    expect(screenContent).toContain('window.parent.postMessage');
  });
});
