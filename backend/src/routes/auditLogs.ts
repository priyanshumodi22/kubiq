import express from 'express';
import { AuditLogService } from '../services/AuditLogService';

const router = express.Router();
const auditService = AuditLogService.getInstance();

// GET /api/audit-logs
router.get('/', async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
    const search = req.query.search as string;
    const logs = await auditService.getLogs(limit, search);
    res.json(logs);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/audit-logs/export - Download audit logs as CSV file
router.get('/export', async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 500;
    const search = req.query.search as string;
    const logs = await auditService.getLogs(limit, search);

    const escapeCsv = (str: any) => {
      const s = String(str ?? '').replace(/"/g, '""');
      return `"${s}"`;
    };

    const headers = ['Timestamp', 'Action', 'User', 'IP Address', 'Target', 'Details'];
    const rows = logs.map(l => [
      escapeCsv(new Date(l.timestamp).toISOString()),
      escapeCsv(l.action),
      escapeCsv(l.user),
      escapeCsv(l.ip),
      escapeCsv(l.target),
      escapeCsv(l.details)
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="kubiq-audit-logs-${Date.now()}.csv"`);
    res.status(200).send(csvContent);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

export const auditLogRouter = router;
