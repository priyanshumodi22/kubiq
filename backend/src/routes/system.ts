
import express from 'express';
import { SystemMonitorService } from '../services/SystemMonitorService';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { requireRole, getUserFromReq } from '../middleware/auth';
import { AuditLogService } from '../services/AuditLogService';
import { createHash } from 'crypto';
import { validateLicenseKey } from '../utils/licenseValidator';

const router = express.Router();
const systemMonitor = SystemMonitorService.getInstance();
const auditService = AuditLogService.getInstance();

// GET /api/system/pro-status - Authenticated, non-secret license state for the UI
router.get('/pro-status', async (_req, res) => {
  try {
    const licenseKey = process.env.KUBIQ_LICENSE_KEY?.trim() || '';
    const active = licenseKey ? await validateLicenseKey(licenseKey) : false;

    res.json({
      active,
      licenseFingerprint: active
        ? createHash('sha256').update(licenseKey).digest('hex').slice(0, 16)
        : null,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/system/stats - Live data
router.get('/stats', async (req, res) => {
  try {
    const stats = await systemMonitor.getLiveStats();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/system/disks - List ALL detected disks (for selection UI)
router.get('/disks', async (req, res) => {
  try {
    const disks = await systemMonitor.getAllDisks();
    res.json(disks);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/system/disks/config - Get monitored list
router.get('/disks/config', async (req, res) => {
  try {
    const config = await systemMonitor.getMonitoredDisksConfig();
    res.json(config);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// PUT /api/system/disks/config - Update monitored list
router.put('/disks/config', requireRole('kubiq-admin'), async (req, res) => {
  try {
    const { mounts } = req.body;
    if (!Array.isArray(mounts)) {
        res.status(400).json({ message: 'mounts must be an array of strings' });
        return;
    }
    await systemMonitor.updateMonitoredDisks(mounts);

    auditService.log({
      user: getUserFromReq(req),
      action: 'SYSTEM_DISKS_UPDATE',
      target: `system/disks`,
      details: `Updated monitored disk mounts: ${mounts.join(', ')}`,
      ip: req.ip
    });

    res.json({ success: true, mounts });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/system/prediction - Storage Analysis
router.get('/prediction', async (req, res) => {
  try {
    const prediction = await systemMonitor.getStoragePrediction();
    res.json(prediction);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/system/apm-config
router.get('/apm-config', async (req, res) => {
  try {
    const systemRepo = await DatabaseFactory.getSystemRepository();
    const config = await systemRepo.getApmConfig();
    res.json(config);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// PUT /api/system/apm-config
router.put('/apm-config', requireRole('kubiq-admin'), async (req, res) => {
  try {
    const { ignoredRoutes } = req.body;
    if (!Array.isArray(ignoredRoutes)) {
      res.status(400).json({ message: 'ignoredRoutes must be an array of strings' });
      return;
    }
    const systemRepo = await DatabaseFactory.getSystemRepository();
    await systemRepo.updateApmConfig({ ignoredRoutes });

    auditService.log({
      user: getUserFromReq(req),
      action: 'APM_CONFIG_UPDATE',
      target: `apm/config`,
      details: `Updated APM ignored routes configuration`,
      ip: req.ip
    });

    res.json({ success: true, ignoredRoutes });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export const systemRouter = router;
