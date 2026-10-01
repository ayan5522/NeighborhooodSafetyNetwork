# Neighborhood Safety & Alert Network

Open Source community-driven safety and real-time emergency alert network.

## Architecture

- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL 16 + PostGIS 3.4
- **Mobile Client**: React Native + Expo (SDK 57) + TypeScript
- **Authentication**: JWT + bcrypt
- **Secure Storage**: Expo SecureStore
- **Real-Time Engine**: Socket.IO
- **Maps**: OpenStreetMap-compatible geospatial mapping with PostGIS spatial indexing

## Project Identity & Security Boundaries

- Database: `neighborhood_safety_db`
- Database User: `nsn_app_user`
- Legacy / Deprecated Identities (`rosp_db`, `rosp_user`, `rosp_postgres`) are strictly forbidden and blocked by runtime validation.

## Module 1: User & Authentication Management
- Secure password hashing with bcrypt
- Strict email normalization (lowercase & trimmed)
- Role protection: public registration can only create `RESIDENT`
- Account status enforcement: `ACTIVE` vs `SUSPENDED`
- Reusable JWT authentication middleware & role-based authorization
- Profile management with immutable role/status for residents
- Complete Forgot Password flow: Email verification -> OTP -> Single-use reset token -> Password reset
