import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../config';

class EmailService {
  private transporter: Transporter | null = null;
  private initializingPromise: Promise<Transporter> | null = null;

  private async getTransporter(): Promise<Transporter> {
    if (this.transporter) {
      return this.transporter;
    }

    if (this.initializingPromise) {
      return await this.initializingPromise;
    }

    this.initializingPromise = (async () => {
      // 1. If explicit SMTP credentials are provided in .env, use them
      if (config.smtp.host && config.smtp.user) {
        this.transporter = nodemailer.createTransport({
          host: config.smtp.host,
          port: config.smtp.port,
          secure: config.smtp.secure,
          auth: {
            user: config.smtp.user,
            pass: config.smtp.password,
          },
        });
        return this.transporter;
      }

      // 2. Otherwise create a real test SMTP account (Ethereal) for development/testing
      try {
        const testAccount = await nodemailer.createTestAccount();
        this.transporter = nodemailer.createTransport({
          host: testAccount.smtp.host,
          port: testAccount.smtp.port,
          secure: testAccount.smtp.secure,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });
        return this.transporter;
      } catch (err: any) {
        // Fallback: create mock transport if ethereal network unreachable
        console.warn('Ethereal test email account creation failed, fallback to direct transporter');
        this.transporter = nodemailer.createTransport({
          jsonTransport: true,
        });
        return this.transporter;
      }
    })();

    const initialized = await this.initializingPromise;
    this.initializingPromise = null;
    return initialized;
  }

  /**
   * Send registration verification OTP email.
   * Never logs OTP or sensitive details.
   */
  async sendRegistrationOtp(
    email: string,
    fullName: string,
    otp: string
  ): Promise<boolean> {
    try {
      const transporter = await this.getTransporter();
      const mailOptions = {
        from: config.smtp.from,
        to: email,
        subject: 'Verify your Neighborhood Safety Network account',
        text: `Hello ${fullName || 'Resident'},\n\nYour email verification code is:\n\n${otp}\n\nThis code expires in 5 minutes.\n\nIf you did not create this account, you can ignore this email.\n\nNeighborhood Safety Network`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; borderRadius: 8px;">
            <h2 style="color: #1e3a8a; margin-bottom: 16px;">Neighborhood Safety Network</h2>
            <p style="color: #374151; font-size: 16px;">Hello ${fullName || 'Resident'},</p>
            <p style="color: #374151; font-size: 16px;">Your email verification code is:</p>
            <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; text-align: center; margin: 24px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1e3a8a;">${otp}</span>
            </div>
            <p style="color: #6b7280; font-size: 14px;">This code expires in 5 minutes.</p>
            <p style="color: #6b7280; font-size: 14px;">If you did not create this account, you can safely ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
            <p style="color: #9ca3af; font-size: 12px;">Neighborhood Safety Network — Community Alert System</p>
          </div>
        `,
      };

      await transporter.sendMail(mailOptions);
      return true;
    } catch (err: any) {
      console.error('Email delivery failure:', err.message || 'SMTP delivery failed');
      return false;
    }
  }

  /**
   * Send password reset verification OTP email.
   * Never logs OTP or sensitive details.
   */
  async sendPasswordResetOtp(
    email: string,
    fullName: string,
    otp: string
  ): Promise<boolean> {
    try {
      const transporter = await this.getTransporter();
      const mailOptions = {
        from: config.smtp.from,
        to: email,
        subject: 'Password Reset Code - Neighborhood Safety Network',
        text: `Hello ${fullName || 'Resident'},\n\nYour password reset verification code is:\n\n${otp}\n\nThis code expires in 5 minutes.\n\nIf you did not request a password reset, you can safely ignore this email.\n\nNeighborhood Safety Network`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; borderRadius: 8px;">
            <h2 style="color: #1e3a8a; margin-bottom: 16px;">Neighborhood Safety Network</h2>
            <p style="color: #374151; font-size: 16px;">Hello ${fullName || 'Resident'},</p>
            <p style="color: #374151; font-size: 16px;">Your password reset verification code is:</p>
            <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; text-align: center; margin: 24px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #dc2626;">${otp}</span>
            </div>
            <p style="color: #6b7280; font-size: 14px;">This code expires in 5 minutes.</p>
            <p style="color: #6b7280; font-size: 14px;">If you did not request a password reset, you can safely ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
            <p style="color: #9ca3af; font-size: 12px;">Neighborhood Safety Network — Security Team</p>
          </div>
        `,
      };

      await transporter.sendMail(mailOptions);
      return true;
    } catch (err: any) {
      console.error('Email delivery failure:', err.message || 'SMTP delivery failed');
      return false;
    }
  }
}

export const emailService = new EmailService();
