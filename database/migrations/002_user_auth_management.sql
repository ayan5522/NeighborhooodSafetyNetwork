-- Module 01: User & Authentication Management Migration
-- Database: neighborhood_safety_db
-- User: nsn_app_user

-- Create Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'RESIDENT',
    account_status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_users_role CHECK (role IN ('RESIDENT', 'MODERATOR', 'ADMIN')),
    CONSTRAINT chk_users_status CHECK (account_status IN ('ACTIVE', 'SUSPENDED'))
);

-- Case-insensitive unique index for emails
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(TRIM(email)));

-- Password recovery / OTP / Reset token table
CREATE TABLE IF NOT EXISTS password_resets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    otp_code VARCHAR(10) NOT NULL,
    otp_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    otp_verified BOOLEAN NOT NULL DEFAULT FALSE,
    reset_token VARCHAR(255) UNIQUE,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(reset_token);
CREATE INDEX IF NOT EXISTS idx_password_resets_email ON password_resets(LOWER(TRIM(email)));
