# Open Source Neighborhood Safety & Alert Network

Community-driven safety and real-time emergency alert network designed to foster safe, resilient, and collaborative neighborhoods through verified peer alerts, geolocation awareness, and an explainable AI trust engine.

---

## 1. System Architecture

The application adopts a three-tier layered architecture with real-time bidirectional push and local machine learning decision support:

```
Mobile Client (React Native + Expo SDK 52 + TypeScript)
        │
        ▼ (HTTPS REST / WebSocket WSS)
Backend Gateway (Node.js + Express + TypeScript + Socket.IO)
   ├── Authentication & RBAC (JWT + bcrypt)
   ├── PostGIS Spatial Engine (ST_DWithin, ST_MakePoint)
   ├── Alert & Emergency Engine (Targeted notifications + SOS)
   ├── Audit Logging System (Immutable action journal)
   └── AI Trust & Reliability Service
        │
        ├──► PostgreSQL 16+ with PostGIS Spatial Extension
        │     Database: neighborhood_safety_db
        │     User: nsn_app_user
        │
        └──► Local ML Engine (Python 3.13 + scikit-learn + pandas + NumPy)
              Inference: Gradient Boosting Classifier (trust-model-v1)
              Explainability: Dynamic factor extraction & cold-start grading
```

---

## 2. Technology Stack

- **Mobile Client**: React Native 0.76+, Expo SDK 52, TypeScript, React Navigation (Native Stack), Expo Location, Expo ImagePicker.
- **Backend API**: Node.js 20+, Express 4.21, TypeScript 5.9, Helmet, Express Rate Limit, Multer.
- **Database**: PostgreSQL 16+ with PostGIS spatial extension.
- **Real-Time Communication**: Socket.IO 4.8 with authenticated user-room partitioning.
- **AI & Machine Learning Engine**: Local Python 3.13, `scikit-learn`, `pandas`, `NumPy`, `joblib`.
  - Zero external or paid AI APIs (no OpenAI, no Gemini, no Firebase, no Supabase, no cloud ML).
  - 100% offline-capable, locally executed inference.
- **Testing**: Jest 29, Supertest 7, ts-jest (11 test suites, 192 automated backend tests, 5 Python ML tests).

---

## 3. Module Overview (Modules 1–10)

1. **Module 1 — User & Authentication Management**:
   - Secure registration with strict password policies and bcrypt hashing.
   - JWT authentication with account status verification (`ACTIVE` vs `SUSPENDED`).
   - Forgot-password recovery flow: Email existence check $\rightarrow$ 6-digit OTP $\rightarrow$ Single-use reset token $\rightarrow$ Password update.
2. **Module 2 — Location & Neighborhood Management**:
   - High-precision geospatial location tracking using PostGIS geography points (`Point, 4326`).
   - Spatial indexing (`GIST`) for fast radial queries.
   - Location privacy protection: neighbor discovery without leaking exact private GPS coordinates.
3. **Module 3 — Incident Reporting**:
   - Categorized reporting (`ACCIDENT`, `FIRE`, `SUSPICIOUS_ACTIVITY`, `ROAD_HAZARD`, `FLOOD_WATERLOGGING`, `MEDICAL_EMERGENCY`, `INFRASTRUCTURE_ISSUE`, `OTHER`).
   - Image attachment upload with Multer and MIME validation.
   - Ownership controls: reporters can edit or cancel their own active incidents.
4. **Module 4 — Emergency Alert & Response**:
   - Automatic alert dispatch to nearby neighbors based on incident category and severity radius.
   - Expiration and lifecycle management (`ACTIVE`, `RESOLVED`, `EXPIRED`).
   - Emergency contacts management and personal SOS triggering.
5. **Module 5 — Community Verification**:
   - Decentralized consensus mechanism (`CONFIRM` vs `DISPUTE`).
   - Dynamic consensus statuses (`UNVERIFIED`, `COMMUNITY_CONFIRMED`, `COMMUNITY_DISPUTED`).
   - Self-verification prevention (authors cannot verify their own incidents).
6. **Module 6 — Real-Time Communication & Notifications**:
   - Socket.IO authenticated private rooms (`user:<userId>`).
   - Dual-channel notifications: instant WebSocket push with persistent PostgreSQL storage fallback.
   - Read/unread synchronization and batch marked-as-read.
7. **Module 7 — Admin & Moderation**:
   - Role-Based Access Control (`RESIDENT`, `MODERATOR`, `ADMIN`).
   - Moderation queue for flagged incidents with review, dismiss, and action capabilities.
   - Administrator user management: role elevation, account suspension, and self-protection guardrails.
8. **Module 8 — Audit Logging, Security Hardening & Final Integration**:
   - Immutable audit logging for security-sensitive actions with sanitization of passwords and tokens.
   - Rate limiting (general, auth, and report tiers).
   - Insecure Direct Object Reference (IDOR) protections across all endpoints.
9. **Module 9 — AI Trust & Reliability Engine**:
   - Gradient Boosting ML model estimating incident reliability (`0–100`) and confidence grade (`LOW`, `MEDIUM`, `HIGH`).
   - Cold-start handling for incidents with few or no community votes.
   - Human-in-the-loop decision support (AI never automatically censors or deletes incidents).
10. **Module 10 — Final Integration & Complete System Testing**:
    - Comprehensive end-to-end verification covering the 22-step user journey from registration through AI scoring and moderation.
    - 192 automated backend integration tests and 5 Python ML tests passing with 0 failures.

---

## 4. Environment Variables Configuration

Create a `.env` file in the `backend/` directory based on `.env.example`:

```ini
PORT=3000
NODE_ENV=development

# Database Configuration (PostgreSQL + PostGIS)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=neighborhood_safety_db
DB_USER=nsn_app_user
DB_PASSWORD=your_secure_password_here

# JWT Authentication
JWT_SECRET=your_jwt_secret_min_32_characters_here
JWT_EXPIRATION=7d

# CORS
CORS_ORIGIN=*

# Uploads
UPLOAD_DIR=uploads
```

---

## 5. Installation & Setup

### Prerequisites
- Node.js 20+ and npm
- PostgreSQL 16+ with PostGIS extension installed
- Python 3.10+ (Python 3.13 recommended) with `pip`

### Step 1: Database Setup
Connect to PostgreSQL and create the database with PostGIS:
```sql
CREATE DATABASE neighborhood_safety_db;
CREATE USER nsn_app_user WITH ENCRYPTED PASSWORD 'nsn_password_2026';
GRANT ALL PRIVILEGES ON DATABASE neighborhood_safety_db TO nsn_app_user;

\c neighborhood_safety_db
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
GRANT ALL ON SCHEMA public TO nsn_app_user;
```

Run database migrations:
```bash
cd backend
npm install
npm run db:migrate
```

### Step 2: Python AI Setup
```bash
cd ../ai
pip install -r requirements.txt

# Generate synthetic development dataset (5,000 records)
python dataset/generate_dataset.py

# Train baseline and candidate models (Gradient Boosting selected)
python training/train_model.py

# Evaluate on unseen test set
python evaluation/evaluate_model.py

# Run Python AI unit tests
python test_ai_pipeline.py
```

### Step 3: Backend Setup
```bash
cd ../backend
npm install
npm run build
npm run dev
```

### Step 4: Mobile Frontend Setup
```bash
cd ../frontend/mobile
npm install
npx expo start
```

---

## 6. Running Tests

### Complete Backend Test Suite (11 Suites / 192 Tests)
```bash
cd backend
npm test
```

### Python AI Pipeline Tests (5 Tests)
```bash
python ai/test_ai_pipeline.py
```

### TypeScript Validation
```bash
# Backend
cd backend && npx tsc --noEmit

# Frontend
cd frontend/mobile && npx tsc --noEmit
```

### Expo Dependency Health
```bash
cd frontend/mobile && npx expo-doctor
```

---

## 7. Known Limitations & Disclosure

> [!NOTE]
> **Synthetic Development Training Disclosure**:
> The AI Trust & Reliability model (`trust-model-v1`) was trained on **5,000 synthetically generated incident records** in `ai/dataset/synthetic_incidents.csv` representing realistic neighborhood distribution patterns. The model is designed for educational and developmental demonstration. Production deployments should periodically fine-tune the pipeline on verified community data once sufficient real-world volume is established.

- **Decision Support Only**: AI trust scores provide advisory guidance for residents and human moderators. The system strictly adheres to ethical AI guardrails: no automated account banning, incident censorship, or emergency dispatch occurs without human authorization.
- **Hardware Native Calling**: Mobile SOS utilizes `Linking.openURL('tel:...')` which requires a cellular-capable device or telephony provider in production environments.
