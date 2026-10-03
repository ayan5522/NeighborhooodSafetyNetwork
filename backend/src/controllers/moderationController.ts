import { Request, Response } from 'express';
import { ModerationService } from '../services/moderationService';

export const reportIncident = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  const incidentId = req.params.id;
  const { reason, description } = req.body;

  if (!reason || typeof reason !== 'string') {
    res.status(400).json({
      success: false,
      message: 'Reason is required and must be a valid report reason string',
    });
    return;
  }

  try {
    const report = await ModerationService.reportIncident(
      req.user.id,
      incidentId,
      reason,
      description
    );

    res.status(201).json({
      success: true,
      message: 'Incident reported successfully to the moderation queue',
      data: { report },
    });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to report incident',
    });
  }
};

export const getReports = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  const { status, reason, page, limit } = req.query;

  try {
    const result = await ModerationService.getModerationReports({
      status: typeof status === 'string' ? status : undefined,
      reason: typeof reason === 'string' ? reason : undefined,
      page: parseInt(page as string, 10) || 1,
      limit: parseInt(limit as string, 10) || 20,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve moderation reports',
    });
  }
};

export const getReportById = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  const reportId = req.params.id;

  try {
    const result = await ModerationService.getModerationReportById(reportId);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to retrieve moderation report details',
    });
  }
};

export const reviewReport = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  const reportId = req.params.id;

  try {
    const report = await ModerationService.reviewReport(req.user.id, reportId);
    res.status(200).json({
      success: true,
      message: 'Report marked as reviewed',
      data: { report },
    });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to review report',
    });
  }
};

export const dismissReport = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  const reportId = req.params.id;

  try {
    const report = await ModerationService.dismissReport(req.user.id, reportId);
    res.status(200).json({
      success: true,
      message: 'Report dismissed',
      data: { report },
    });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to dismiss report',
    });
  }
};

export const takeAction = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  const reportId = req.params.id;
  const { action, notes } = req.body;

  if (!action || typeof action !== 'string') {
    res.status(400).json({
      success: false,
      message: 'Action is required and must be a valid moderation action',
    });
    return;
  }

  try {
    const result = await ModerationService.takeModerationAction(
      req.user.id,
      reportId,
      action,
      notes
    );

    res.status(200).json({
      success: true,
      message: `Moderation action '${action}' applied successfully`,
      data: result,
    });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to take moderation action',
    });
  }
};
