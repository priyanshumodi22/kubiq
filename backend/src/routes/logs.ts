import { Request, Response, Router } from 'express';
import fs from 'fs';
import path from 'path';

export const logRouter = Router();

// In a real scenario, we might want to restrict this to specific directories for security
// For this implementation, we rely on the service configuration to provide safe paths.

interface LogFileRequest {
    path: string;
}

// Helper to validate path security (prevent accessing /etc/passwd etc via ../../)
// This is a minimal check; robust implementations limit to an ALLOWLIST of directories.
const isPathSafe = (targetPath: string): boolean => {
    // For now, we assume if it starts with /var/log or /home/ or /app/ it's "safe"
    // This is a Placeholder for user-defined allowed paths.
    // In production, compare against the Service defined log paths.
    return !targetPath.includes('..'); 
};

logRouter.get('/check', (req: Request, res: Response) => {
    const filePath = req.query.path as string;
    
    if (!filePath) {
        return res.status(400).json({ valid: false, message: 'Path required' });
    }

    if (!isPathSafe(filePath)) {
         return res.status(403).json({ valid: false, message: 'Path traversal detected' });
    }

    try {
        if (fs.existsSync(filePath)) {
             const stats = fs.statSync(filePath);
             return res.json({ 
                 valid: true, 
                 exists: true, 
                 size: stats.size,
                 updated: stats.mtime
             });
        }
        return res.json({ valid: true, exists: false, message: 'File does not exist yet' });
    } catch (e) {
        return res.status(500).json({ valid: false, error: (e as Error).message });
    }
});
