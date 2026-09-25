import express from 'express';
import { AuditLogService } from '../services/AuditLogService';
import { requireRole } from '../middleware/auth';

const router = express.Router();
const auditService = AuditLogService.getInstance();

// GET /api/audit-logs
router.get('/', (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
        const search = req.query.search as string;
        const logs = auditService.getLogs(limit, search);
        res.json(logs);
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});

export const auditLogRouter = router;
