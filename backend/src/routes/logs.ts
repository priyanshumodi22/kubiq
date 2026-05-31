import { Request, Response, Router } from 'express';
import fs from 'fs';
import path from 'path';
import { DatabaseFactory } from '../database/DatabaseFactory';
import axios from 'axios';
import { isPathSafe } from '../utils/pathSecurity';
import { AICacheService } from '../services/AICacheService';

export const logRouter = Router();

logRouter.get('/check', (req: Request, res: Response) => {
    const filePath = req.query.path as string;

    if (!filePath) return res.status(400).json({ valid: false, message: 'Path required' });
    if (!isPathSafe(filePath)) return res.status(403).json({ valid: false, message: 'Path traversal detected' });

    try {
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            return res.json({ valid: true, exists: true, size: stats.size, updated: stats.mtime });
        }
        return res.json({ valid: true, exists: false, message: 'File does not exist yet' });
    } catch (e) {
        return res.status(500).json({ valid: false, error: (e as Error).message });
    }
});

// GET /api/logs/sources - fetch all sources for a service
logRouter.get('/sources', async (req: Request, res: Response) => {
    try {
        const serviceName = req.query.serviceName as string;
        if (!serviceName) return res.status(400).json({ error: 'serviceName is required' });

        if (!DatabaseFactory.isApmSupported()) {
            return res.json([]);
        }

        const repo = await DatabaseFactory.getLogRepository();
        const sources = await repo.getLogSourcesForService(serviceName);
        res.json(sources);
    } catch (err: any) {
        if (err.message.includes('LOG_RETENTION_NOT_SUPPORTED')) {
            return res.json([]);
        }
        res.status(500).json({ error: err.message });
    }
});

// GET /api/logs/query - Query historical logs
logRouter.get('/query', async (req: Request, res: Response) => {
    try {
        const { serviceName, sourceName, level, search, fromMs, toMs, limit } = req.query;

        if (!serviceName) return res.status(400).json({ error: 'serviceName is required' });
        if (!fromMs || !toMs) return res.status(400).json({ error: 'fromMs and toMs are required' });

        const from = new Date(parseInt(fromMs as string, 10));
        const to = new Date(parseInt(toMs as string, 10));
        const limitNum = limit ? parseInt(limit as string, 10) : 500;

        const repo = await DatabaseFactory.getLogRepository();
        const logs = await repo.queryLogs(serviceName as string, {
            sourceName: sourceName as string | undefined,
            from,
            to,
            level: level as string | undefined,
            search: search as string | undefined,
            limit: limitNum
        });

        res.json(logs);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/logs/recent-summary - Fetch the most recent AI summary for a service
logRouter.get('/recent-summary', async (req: Request, res: Response) => {
    try {
        const serviceName = req.query.serviceName as string;
        if (!serviceName) {
            return res.status(400).json({ error: 'serviceName is required' });
        }

        const cacheService = AICacheService.getInstance();
        const recentSummary = cacheService.getMostRecentSummary(serviceName);
        
        if (recentSummary) {
            return res.json({ available: true, summary: recentSummary });
        }

        return res.json({ available: false });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/logs/summarize - AI log summarization
logRouter.post('/summarize', async (req: Request, res: Response) => {
    try {
        const { logs, serviceName } = req.body;
        if (!logs || !Array.isArray(logs) || logs.length === 0) {
            return res.status(400).json({ error: 'Array of logs is required in the body' });
        }

        const cacheService = AICacheService.getInstance();
        let timeBucketStart = 0;
        let timeBucketEnd = 0;

        if (serviceName) {
            const bucket = cacheService.calculateTimeBucket();
            timeBucketStart = bucket.start;
            timeBucketEnd = bucket.end;

            const cached = cacheService.getSummary(serviceName, timeBucketStart);
            if (cached) {
                return res.json({ summary: cached.summary, cached: true });
            }
        }

        // 1. License Check
        const { validateLicenseKey } = await import('../utils/licenseValidator');
        const licenseKey = process.env.KUBIQ_LICENSE_KEY || '';

        if (!licenseKey) {
            return res.status(402).json({ error: 'NO_LICENSE', message: 'kubiq Pro License required for AI features.' });
        }

        const isValid = await validateLicenseKey(licenseKey);
        if (!isValid) {
            return res.status(402).json({ error: 'INVALID_LICENSE', message: 'The provided kubiq Pro License is invalid or expired.' });
        }

        // 2. AI Provider Configuration
        const aiProvider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
        const apiKey = process.env.AI_API_KEY;

        if (!apiKey) {
            // Smart local digest fallback if they have a license but forgot their API key
            const errCount = logs.filter(l => l.level?.toUpperCase() === 'ERROR').length;
            const warnCount = logs.filter(l => l.level?.toUpperCase() === 'WARN').length;

            const fallbackMarkdown = `### 🤖 Local Digest Summary
*You have kubiq Pro, but no \`AI_API_KEY\` is configured in your environment.*

**Quick Stats:**
- **Errors**: ${errCount}
- **Warnings**: ${warnCount}
- **Total Logs**: ${logs.length}

Please add your OpenAI, Anthropic, or Gemini API key to your \`.env\` file for deep AI analysis.`;
            return res.json({ summary: fallbackMarkdown });
        }

        // Prepare context for AI
        const logLines = logs.slice(-100).map(l => `[${l.level || 'INFO'}] ${l.message}`).join('\n');
        const prompt = `You are an expert DevOps engineer and SRE. Analyze the following application logs.
Identify any errors, warnings, or anomalies. Provide a concise, markdown-formatted summary including:
1. **Root Cause Analysis** (if an error exists)
2. **Key Insights**
3. **Recommended Actions**

Logs to analyze:
${logLines}`;

        let summary = '';

        if (aiProvider === 'openai') {
            const url = 'https://api.openai.com/v1/chat/completions';
            const response = await axios.post(url, {
                model: 'gpt-4o',
                messages: [{ role: 'user', content: prompt }]
            }, {
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
            });
            summary = response.data.choices[0].message.content;

        } else if (aiProvider === 'anthropic') {
            const url = 'https://api.anthropic.com/v1/messages';
            const response = await axios.post(url, {
                model: 'claude-3-5-sonnet-latest',
                max_tokens: 1024,
                messages: [{ role: 'user', content: prompt }]
            }, {
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'Content-Type': 'application/json'
                }
            });
            summary = response.data.content[0].text;

        } else {
            // Default to Gemini
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
            const response = await axios.post(url, {
                contents: [{ parts: [{ text: prompt }] }]
            }, { headers: { 'Content-Type': 'application/json' } });

            if (response.data && response.data.candidates && response.data.candidates[0]) {
                summary = response.data.candidates[0].content.parts[0].text;
            } else {
                throw new Error('Invalid response format from Gemini API');
            }
        }

        if (summary) {
            // Strip markdown block wrappers that LLMs sometimes add (e.g. ```markdown ... ```)
            summary = summary.replace(/^```(?:markdown)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
            
            if (serviceName) {
                cacheService.saveSummary(serviceName, timeBucketStart, timeBucketEnd, summary);
            }
        }

        return res.json({ summary, cached: false });

    } catch (err: any) {
        console.error('Failed to summarize logs:', err.response?.data || err.message);
        res.status(500).json({ error: 'Failed to generate AI summary', details: err.message });
    }
});
