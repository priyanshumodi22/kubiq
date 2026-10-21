
import express from 'express';
import { SystemMonitorService } from '../services/SystemMonitorService';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { requirePermission, getUserFromReq } from '../middleware/auth';
import { AuditLogService } from '../services/AuditLogService';
import { createHash } from 'node:crypto';
import { validateLicenseKey } from '../utils/licenseValidator';
import { KubiAiConfigService } from '../services/KubiAiConfigService';
import { KubiProviderService } from '../services/KubiProviderService';

const router = express.Router();
const systemMonitor = SystemMonitorService.getInstance();
const auditService = AuditLogService.getInstance();
router.use(requirePermission('system.read'));

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

// AI keys are write-only: only kubiq-admin may configure them, and no endpoint returns one.
router.get('/kubi-ai', requirePermission('kubi.configure'), async (_req, res) => {
  try {
    res.json(await KubiAiConfigService.getPublicConfig());
  } catch {
    res.status(503).json({ message: 'kubi AI configuration is unavailable.' });
  }
});

router.put('/kubi-ai', requirePermission('kubi.configure'), async (req, res) => {
  try {
    const config = await KubiAiConfigService.save(req.body || {});
    auditService.log({
      user: getUserFromReq(req), action: 'KUBI_AI_CONFIG_UPDATE', target: 'kubi/ai-config',
      details: `Updated kubi AI provider configuration (${config.provider}/${config.model}).`, ip: req.ip,
    });
    res.json(config);
  } catch (error: any) {
    const code = error?.message;
    const message = code === 'KUBI_CONFIGURATION_ENCRYPTION_UNAVAILABLE'
      ? 'kubi AI secure configuration is not initialized. Set KUBI_AI_CONFIG_ENCRYPTION_KEY first.'
      : code === 'KUBI_API_KEY_REQUIRED' ? 'An API key is required for the first kubi AI configuration.'
      : code === 'KUBI_PROVIDER_INVALID' || code === 'KUBI_MODEL_INVALID' ? 'Choose a supported provider and a valid model identifier.'
      : 'Could not save kubi AI configuration.';
    res.status(400).json({ message });
  }
});

router.post('/kubi-ai/test', requirePermission('kubi.configure'), async (_req, res) => {
  try {
    const response = await new KubiProviderService().complete([{ role: 'user', content: 'Reply exactly: OK' }], 8);
    res.json({ ok: response.length > 0 });
  } catch (error: any) {
    const providerLimited = error?.response?.status === 429 || error?.response?.status === 402;
    res.status(providerLimited ? 429 : 400).json({
      ok: false,
      message: providerLimited ? 'The configured provider has no available quota or credits.' : 'The configured provider could not complete a test.',
    });
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
router.put('/disks/config', requirePermission('system.configure'), async (req, res) => {
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
router.put('/apm-config', requirePermission('system.configure'), async (req, res) => {
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
