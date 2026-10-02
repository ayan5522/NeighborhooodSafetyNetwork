import { Request, Response } from 'express';
import { EmergencyContactService } from '../services/emergencyContactService';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const getEmergencyContacts = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
    return;
  }

  try {
    const contacts = await EmergencyContactService.getContacts(req.user.id);
    res.status(200).json({
      success: true,
      data: {
        contacts,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve emergency contacts',
    });
  }
};

export const createEmergencyContact = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
    return;
  }

  const { contact_name, phone_number, is_primary } = req.body;

  const validation = EmergencyContactService.validateContactInput(contact_name, phone_number);
  if (!validation.valid) {
    res.status(400).json({
      success: false,
      message: validation.message,
    });
    return;
  }

  try {
    const contact = await EmergencyContactService.createContact(req.user.id, {
      contact_name,
      phone_number,
      is_primary,
    });

    res.status(201).json({
      success: true,
      data: {
        contact,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to save emergency contact',
    });
  }
};

export const deleteEmergencyContact = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
    return;
  }

  const { id } = req.params;
  if (!UUID_REGEX.test(id)) {
    res.status(400).json({
      success: false,
      message: 'Invalid contact ID format',
    });
    return;
  }

  try {
    const result = await EmergencyContactService.deleteContact(id, req.user.id);
    if (result === 'NOT_FOUND') {
      res.status(404).json({
        success: false,
        message: 'Emergency contact not found',
      });
      return;
    }

    if (result === 'FORBIDDEN') {
      res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this emergency contact',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Emergency contact deleted successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete emergency contact',
    });
  }
};
