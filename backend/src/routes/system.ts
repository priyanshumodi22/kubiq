
import express from 'express';
import { SystemMonitorService } from '../services/SystemMonitorService';

const router = express.Router();
const systemMonitor = SystemMonitorService.getInstance();

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
router.put('/disks/config', async (req, res) => {
  try {
    const { mounts } = req.body;
    if (!Array.isArray(mounts)) {
        res.status(400).json({ message: 'mounts must be an array of strings' });
        return;
    }
    await systemMonitor.updateMonitoredDisks(mounts);
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

export const systemRouter = router;
