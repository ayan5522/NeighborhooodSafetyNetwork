-- Module 01 Update: Email Verification OTP & Secure Password Reset
-- Database: neighborhood_safety_db
-- User: nsn_app_user

-- 1. Ensure email_verified column exists on users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Preserve access for existing users created prior to email verification requirement
UPDATE users SET email_verified = TRUE WHERE account_status = 'ACTIVE';

-- 3. Update account_status constraint to support PENDING accounts for unverified registrations
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_status;
ALTER TABLE users ADD CONSTRAINT chk_users_status CHECK (account_status IN ('PENDING', 'ACTIVE', 'SUSPENDED'));

-- 4. Create dedicated email_verification_otps table for secure registration and password reset OTPs
CREATE TABLE IF NOT EXISTS email_verification_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    otp_hash VARCHAR(255) NOT NULL,
    purpose VARCHAR(50) NOT NULL DEFAULT 'REGISTRATION_VERIFICATION',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_otp_purpose CHECK (purpose IN ('REGISTRATION_VERIFICATION', 'PASSWORD_RESET'))
);

CREATE INDEX IF NOT EXISTS idx_email_verification_otps_user ON email_verification_otps(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_otps_email ON email_verification_otps(LOWER(TRIM(email)));
CREATE INDEX IF NOT EXISTS idx_email_verification_otps_purpose ON email_verification_otps(purpose);
CREATE INDEX IF NOT EXISTS idx_email_verification_otps_created ON email_verification_otps(created_at DESC);

-- 5. Create dedicated password_reset_tokens table for single-use cryptographic reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens(token_hash);
