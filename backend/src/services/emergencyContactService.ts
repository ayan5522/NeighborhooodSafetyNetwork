import { query, pool } from '../db';

export interface EmergencyContact {
  id: string;
  user_id: string;
  contact_name: string;
  phone_number: string;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export class EmergencyContactService {
  /**
   * Validate phone number and name
   */
  public static validateContactInput(
    contact_name: any,
    phone_number: any
  ): { valid: boolean; message?: string } {
    if (!contact_name || typeof contact_name !== 'string' || contact_name.trim().length === 0) {
      return { valid: false, message: 'Contact name is required' };
    }

    if (contact_name.trim().length > 255) {
      return { valid: false, message: 'Contact name cannot exceed 255 characters' };
    }

    if (!phone_number || typeof phone_number !== 'string' || phone_number.trim().length === 0) {
      return { valid: false, message: 'Phone number is required' };
    }

    const cleanedPhone = phone_number.trim().replace(/[\s\-()]/g, '');
    if (cleanedPhone.length < 5 || cleanedPhone.length > 20) {
      return { valid: false, message: 'Phone number must be between 5 and 20 digits' };
    }

    return { valid: true };
  }

  /**
   * Get all emergency contacts for user
   */
  public static async getContacts(userId: string): Promise<EmergencyContact[]> {
    const sql = `
      SELECT id, user_id, contact_name, phone_number, is_primary, created_at, updated_at
      FROM emergency_contacts
      WHERE user_id = $1
      ORDER BY is_primary DESC, created_at ASC;
    `;
    const res = await query(sql, [userId]);
    return res.rows;
  }

  /**
   * Create emergency contact with primary status management
   */
  public static async createContact(
    userId: string,
    data: {
      contact_name: string;
      phone_number: string;
      is_primary?: boolean;
    }
  ): Promise<EmergencyContact> {
    const validation = this.validateContactInput(data.contact_name, data.phone_number);
    if (!validation.valid) {
      throw new Error(validation.message);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const isPrimary = data.is_primary !== false; // Default true if first or requested

      if (isPrimary) {
        // Demote previous primary contact
        await client.query(
          `UPDATE emergency_contacts SET is_primary = false WHERE user_id = $1`,
          [userId]
        );
      }

      const sql = `
        INSERT INTO emergency_contacts (user_id, contact_name, phone_number, is_primary)
        VALUES ($1, $2, $3, $4)
        RETURNING id, user_id, contact_name, phone_number, is_primary, created_at, updated_at;
      `;

      const res = await client.query(sql, [
        userId,
        data.contact_name.trim(),
        data.phone_number.trim(),
        isPrimary,
      ]);

      await client.query('COMMIT');
      return res.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Delete an emergency contact with IDOR protection
   */
  public static async deleteContact(
    contactId: string,
    userId: string
  ): Promise<boolean | 'FORBIDDEN' | 'NOT_FOUND'> {
    const checkRes = await query(
      `SELECT user_id, is_primary FROM emergency_contacts WHERE id = $1`,
      [contactId]
    );

    if (checkRes.rows.length === 0) {
      return 'NOT_FOUND';
    }

    if (checkRes.rows[0].user_id !== userId) {
      return 'FORBIDDEN';
    }

    const wasPrimary = checkRes.rows[0].is_primary;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM emergency_contacts WHERE id = $1`, [contactId]);

      // If we deleted the primary, promote the most recent remaining contact if any
      if (wasPrimary) {
        await client.query(`
          UPDATE emergency_contacts
          SET is_primary = true
          WHERE id = (
            SELECT id FROM emergency_contacts
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 1
          )
        `, [userId]);
      }

      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
