import express from 'express';
import yaml from 'js-yaml';
import axios from 'axios';
import { KubernetesService } from '../services/KubernetesService';
import { requireRole, getUserFromReq, checkNamespaceAccess } from '../middleware/auth';
import { clickhouseService } from '../services/ClickhouseService';
import { AuditLogService } from '../services/AuditLogService';
import { DatabaseFactory } from '../database/DatabaseFactory';

const router = express.Router();
const k8sService = KubernetesService.getInstance();
const auditLogService = AuditLogService.getInstance();


const getContext = (req: express.Request) => { const ctx = req.headers['x-kubernetes-context']; const parsed = (Array.isArray(ctx) ? ctx[0] : ctx) || ''; return parsed || k8sService.defaultContext; };


// GET /api/kubernetes/status
router.get('/status', (_req, res) => {
    res.json({
        available: k8sService.available,
        context: k8sService.defaultContext,
        scrapeInterval: parseInt(process.env.APM_SCRAPE_INTERVAL_SECONDS || '60', 10),
        clickhouseEnabled: clickhouseService.isConfigured()
    });
});

// GET /api/kubernetes/contexts
router.get('/contexts', (_req, res) => {
    try {
        const contexts = k8sService.getContexts();
        res.json({
            current: k8sService.defaultContext,
            contexts
        });
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});

const handleK8sError = (res: express.Response, e: any) => {
    const code = e?.statusCode || e?.code || e?.response?.statusCode || e?.response?.status || e?.body?.code;
    const isForbidden = code === 403 || (e?.message && (e.message.includes('403') || e.message.includes('forbidden') || e.message.includes('Forbidden')));
    if (isForbidden) {
        return res.status(403).json({
            error: 'RBAC_FORBIDDEN',
            message: e.body?.message || e.message || 'Kubernetes RBAC permission forbidden'
        });
    }
    res.status(500).json({ message: e.message || 'Internal server error' });
};

// GET /api/kubernetes/namespaces
router.get('/namespaces', async (req, res) => {
    try {
        if (!k8sService.available) return res.json([]);
        const clusterNamespaces = await k8sService.getNamespaces(getContext(req));
        
        const user = getUserFromReq(req) as any;
        // Admins see all cluster namespaces
        if (!user || user.role === 'kubiq-admin' || user.roles?.includes('kubiq-admin')) {
            return res.json(clusterNamespaces);
        }

        // Viewers are scoped to allowedNamespaces
        let allowed: string[] | undefined = user.allowedNamespaces;
        if (!allowed && user.sub) {
            try {
                const repo = await DatabaseFactory.getUserRepository();
                const dbUser = await repo.findById(user.sub);
                allowed = dbUser?.allowedNamespaces;
            } catch {}
        }

        if (allowed && Array.isArray(allowed) && allowed.length > 0) {
            const allowedLower = allowed.map((s: string) => String(s).toLowerCase().trim());
            const filtered = clusterNamespaces.filter(ns => allowedLower.includes(ns.toLowerCase().trim()));
            return res.json(filtered.length > 0 ? filtered : allowed);
        }

        res.json(clusterNamespaces);
    } catch (e: any) {
        handleK8sError(res, e);
    }
});

// GET /api/kubernetes/namespaces/:ns/pods
router.get('/namespaces/:ns/pods', checkNamespaceAccess, async (req, res) => {
    try {
        if (!k8sService.available) return res.json([]);
        const pods = await k8sService.getPods(getContext(req), (req.params.ns as string));
        res.json(pods);
    } catch (e: any) {
        handleK8sError(res, e);
    }
});

// GET /api/kubernetes/namespaces/:ns/metrics
router.get('/namespaces/:ns/metrics', checkNamespaceAccess, async (req, res) => {
    try {
        if (!k8sService.available) return res.json([]);
        const metrics = await k8sService.getPodMetrics(getContext(req), (req.params.ns as string));
        res.json(metrics);
    } catch (e: any) {
        handleK8sError(res, e);
    }
});

// GET /api/kubernetes/namespaces/:ns/events
router.get('/namespaces/:ns/events', checkNamespaceAccess, async (req, res) => {
    try {
        if (!k8sService.available) return res.json([]);
        const events = await k8sService.getEvents(getContext(req), (req.params.ns as string));
        res.json(events);
    } catch (e: any) {
        handleK8sError(res, e);
    }
});

// GET /api/kubernetes/namespaces/:ns/deployments
router.get('/namespaces/:ns/deployments', checkNamespaceAccess, async (req, res) => {
    try {
        if (!k8sService.available) return res.json([]);
        const deployments = await k8sService.getDeployments(getContext(req), (req.params.ns as string));
        res.json(deployments);
    } catch (e: any) {
        handleK8sError(res, e);
    }
});

// --- New Resources ---

router.get('/nodes', async (req, res) => {
    try {
        if (!k8sService.available) return res.json([]);
        res.json(await k8sService.getNodes(getContext(req)));
    } catch (e: any) { handleK8sError(res, e); }
});

router.get('/namespaces/:ns/services', checkNamespaceAccess, async (req, res) => {
    try {
        if (!k8sService.available) return res.json([]);
        res.json(await k8sService.getServices(getContext(req), (req.params.ns as string)));
    } catch (e: any) { handleK8sError(res, e); }
});

router.get('/namespaces/:ns/endpoints', checkNamespaceAccess, async (req, res) => {
    try {
        if (!k8sService.available) return res.json([]);
        res.json(await k8sService.getEndpoints(getContext(req), (req.params.ns as string)));
    } catch (e: any) { handleK8sError(res, e); }
});

router.get('/namespaces/:ns/ingresses', checkNamespaceAccess, async (req, res) => {
    try {
        if (!k8sService.available) return res.json([]);
        res.json(await k8sService.getIngresses(getContext(req), (req.params.ns as string)));
    } catch (e: any) { handleK8sError(res, e); }
});

router.get('/persistentvolumes', async (req, res) => {
    try {
        if (!k8sService.available) return res.json([]);
        res.json(await k8sService.getPersistentVolumes(getContext(req)));
    } catch (e: any) { handleK8sError(res, e); }
});

router.get('/namespaces/:ns/persistentvolumeclaims', checkNamespaceAccess, async (req, res) => {
    try {
        if (!k8sService.available) return res.json([]);
        res.json(await k8sService.getPersistentVolumeClaims(getContext(req), (req.params.ns as string)));
    } catch (e: any) { handleK8sError(res, e); }
});

router.get('/storageclasses', async (req, res) => {
    try {
        if (!k8sService.available) return res.json([]);
        res.json(await k8sService.getStorageClasses(getContext(req)));
    } catch (e: any) { handleK8sError(res, e); }
});

router.get('/namespaces/:ns/configmaps', checkNamespaceAccess, async (req, res) => {
    try {
        if (!k8sService.available) return res.json([]);
        res.json(await k8sService.getConfigMaps(getContext(req), (req.params.ns as string)));
    } catch (e: any) { handleK8sError(res, e); }
});

router.get('/namespaces/:ns/secrets', checkNamespaceAccess, async (req, res) => {
    try {
        if (!k8sService.available) return res.json([]);
        res.json(await k8sService.getSecrets(getContext(req), (req.params.ns as string)));
    } catch (e: any) { handleK8sError(res, e); }
});

// GET /api/kubernetes/namespaces/:ns/pods/:podName/metrics/history

router.get('/namespaces/:ns/pods/:podName/metrics/history', async (req, res) => {
    try {
        if (!clickhouseService.isConfigured()) {
            return res.status(404).json({ message: 'Clickhouse not configured for APM storage' });
        }
        
        // Default to last 24 hours
        let since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        if (req.query.hours) {
            const h = parseInt(req.query.hours as string);
            if (!isNaN(h) && h > 0) {
                since = new Date(Date.now() - h * 60 * 60 * 1000);
            }
        }
        
        const history = await clickhouseService.getPodMetricsHistory(
            getContext(req),
            req.params.ns as string,
            req.params.podName as string,
            since
        );
        
        res.json(history);
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});

// --- Management Actions ---

// --- Management Actions ---

// POST /api/kubernetes/namespaces/:ns/deployments/:name/scale
router.post('/namespaces/:ns/deployments/:name/scale', requireRole('kubiq-admin'), async (req, res) => {
    try {
        const { replicas } = req.body;
        if (typeof replicas !== 'number') return res.status(400).json({ message: 'Replicas must be a number' });
        const ns = req.params.ns as string;
        const name = req.params.name as string;
        await k8sService.scaleDeployment(getContext(req), ns, name, replicas);

        const user = getUserFromReq(req);
        auditLogService.log({
            user,
            action: 'DEPLOYMENT_SCALE',
            target: `deployment/${ns}/${name}`,
            details: `Scaled replicas to ${replicas}`,
            ip: req.ip
        });

        res.json({ message: 'Scaling initiated' });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// POST /api/kubernetes/namespaces/:ns/deployments/:name/restart
router.post('/namespaces/:ns/deployments/:name/restart', requireRole('kubiq-admin'), async (req, res) => {
    try {
        const ns = req.params.ns as string;
        const name = req.params.name as string;
        await k8sService.restartDeployment(getContext(req), ns, name);

        const user = getUserFromReq(req);
        auditLogService.log({
            user,
            action: 'DEPLOYMENT_RESTART',
            target: `deployment/${ns}/${name}`,
            details: `Initiated rollout restart`,
            ip: req.ip
        });

        res.json({ message: 'Restart initiated' });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// DELETE /api/kubernetes/namespaces/:ns/:type/:name
router.delete('/namespaces/:ns/:type/:name', requireRole('kubiq-admin'), async (req, res) => {
    try {
        const ns = req.params.ns as string;
        const type = req.params.type as string;
        const name = req.params.name as string;
        await k8sService.deleteResource(getContext(req), ns, type, name);

        const user = getUserFromReq(req);
        auditLogService.log({
            user,
            action: 'RESOURCE_DELETE',
            target: `${type}/${ns}/${name}`,
            details: `Deleted Kubernetes ${type} resource`,
            ip: req.ip
        });

        res.json({ message: 'Deletion initiated' });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// POST /api/kubernetes/apply - Apply raw YAML/JSON manifest
router.post('/apply', requireRole('kubiq-admin'), async (req, res) => {
    try {
        let { manifest } = req.body;
        if (!manifest) return res.status(400).json({ message: 'Manifest is required' });

        if (typeof manifest === 'string') {
            try {
                manifest = yaml.load(manifest);
            } catch (yamlError: any) {
                return res.status(400).json({ message: `YAML Parsing Error: ${yamlError.message}` });
            }
        }

        const result = await k8sService.applyResource(getContext(req), manifest);

        const user = getUserFromReq(req);
        const targetKind = manifest?.kind || 'Resource';
        const targetName = manifest?.metadata?.name || 'unknown';
        const targetNs = manifest?.metadata?.namespace || 'default';

        auditLogService.log({
            user,
            action: 'MANIFEST_APPLY',
            target: `${targetKind}/${targetNs}/${targetName}`,
            details: `Applied manifest for ${targetKind}/${targetName}`,
            ip: req.ip
        });

        res.json(result);
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});


router.get('/namespaces/:ns/yaml/:type/:name', async (req, res) => {
    try {
        if (!k8sService.available) return res.status(503).json({ message: 'K8s not available' });
        const raw = await k8sService.getResourceRaw(getContext(req), (req.params.ns as string), (req.params.type as string), (req.params.name as string));
        if (!raw) return res.status(404).json({ message: 'Not found' });
        res.json(raw);
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});

// GET /api/kubernetes/yaml/:type/:name (for cluster-scoped resources)
router.get('/yaml/:type/:name', async (req, res) => {
    try {
        if (!k8sService.available) return res.status(503).json({ message: 'K8s not available' });
        const raw = await k8sService.getResourceRaw(getContext(req), '', (req.params.type as string), (req.params.name as string));
        if (!raw) return res.status(404).json({ message: 'Not found' });
        res.json(raw);
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});

// GET /api/kubernetes/namespaces/:ns/autoscalers/:type/:name
router.get('/namespaces/:ns/autoscalers/:type/:name', async (req, res) => {
    try {
        if (!k8sService.available) return res.json({ hpa: [], vpa: [] });
        res.json(await k8sService.getAutoscalersForResource(getContext(req), (req.params.ns as string), (req.params.type as string), (req.params.name as string)));
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});

// GET /api/kubernetes/namespaces/:ns/quotas
router.get('/namespaces/:ns/quotas', checkNamespaceAccess, async (req, res) => {
    try {
        if (!k8sService.available) return res.json({ quotas: [], limitRanges: [], rbacForbidden: false });
        const ctx = getContext(req);
        const ns = req.params.ns as string;
        const [quotas, limitRanges] = await Promise.all([
            k8sService.getResourceQuotas(ctx, ns),
            k8sService.getLimitRanges(ctx, ns)
        ]);
        res.json({ quotas, limitRanges, rbacForbidden: false });
    } catch (e: any) {
        // Return 200 with empty arrays + rbacForbidden flag so UI displays clean RBAC banner without breaking
        res.json({ 
            quotas: [], 
            limitRanges: [], 
            rbacForbidden: true, 
            message: e.message || 'ServiceAccount forbidden to list resourcequotas' 
        });
    }
});

// POST /api/kubernetes/namespaces/:ns/pods/:name/ai-diagnose
router.post('/namespaces/:ns/pods/:name/ai-diagnose', checkNamespaceAccess, async (req, res) => {
    try {
        if (!k8sService.available) return res.status(503).json({ message: 'K8s service not available' });
        const ns = String(req.params.ns);
        const name = String(req.params.name);
        const ctx = getContext(req);

        auditLogService.log({
            user: getUserFromReq(req),
            action: 'AI_POD_DIAGNOSE',
            target: `pod/${ns}/${name}`,
            details: `Triggered SRE AI pod diagnosis for pod '${name}' in namespace '${ns}'`,
            ip: req.ip
        });

        const pods = await k8sService.getPods(ctx, ns);
        const pod = pods.find(p => p.name === name);

        let logs = '';
        try {
            logs = await k8sService.getPodLogs(ctx, ns, name, pod?.containers?.[0]?.name, 60);
        } catch (err: any) {
            logs = `(Logs unavailable: ${err.message})`;
        }

        const podContext = {
            name,
            namespace: ns,
            status: pod?.status || 'Unknown',
            restarts: pod?.restarts || 0,
            lastTerminationReason: pod?.lastTerminationReason || 'None',
            containers: pod?.containers || [],
            conditions: pod?.conditions || []
        };

        const apiKey = process.env.AI_API_KEY;
        const aiProvider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();

        if (!apiKey) {
            const fallbackMarkdown = `### 🤖 SRE Automated Diagnostic Report
**Target**: Pod \`${name}\` (Namespace: \`${ns}\`)
**Current Status**: \`${podContext.status}\` | **Total Restarts**: \`${podContext.restarts}\`

#### 🔍 Identified Conditions & Signals
- **Last Termination Reason**: \`${podContext.lastTerminationReason}\`
${podContext.containers.map(c => `- Container \`${c.name}\`: State = \`${c.state}\` (${c.stateReason || 'No reason'}), Restarts = ${c.restartCount}`).join('\n')}

#### 📜 Recent Log Tail
\`\`\`text
${logs.split('\n').slice(-15).join('\n') || 'No logs recorded.'}
\`\`\`

> [!TIP]
> *Configure \`AI_API_KEY\` in your \`.env\` file for full LLM generative SRE analysis.*`;
            return res.json({ diagnosis: fallbackMarkdown });
        }

        const prompt = `You are a Principal Kubernetes Site Reliability Engineer (SRE).
Analyze this failing pod issue in Kubernetes namespace "${ns}":

Pod Details:
- Name: ${name}
- Status: ${podContext.status}
- Restarts: ${podContext.restarts}
- Last Termination Reason: ${podContext.lastTerminationReason}
- Containers: ${JSON.stringify(podContext.containers, null, 2)}
- Conditions: ${JSON.stringify(podContext.conditions, null, 2)}

Recent Pod Logs (last 60 lines):
${logs.slice(-3000)}

Provide a concise markdown response:
### 1. 🚨 Root Cause Diagnosis
(Concise summary of why the pod is failing)

### 2. ⚡ Impact & Urgency
(Operational impact)

### 3. 🛠️ Recommended Actionable Fix
(Exact kubectl command or YAML edit to resolve this issue)`;

        let diagnosis = '';
        if (aiProvider === 'openai') {
            const url = 'https://api.openai.com/v1/chat/completions';
            const response = await axios.post(url, {
                model: 'gpt-4o',
                messages: [{ role: 'user', content: prompt }]
            }, { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' } });
            diagnosis = response.data.choices[0].message.content;
        } else if (aiProvider === 'anthropic') {
            const url = 'https://api.anthropic.com/v1/messages';
            const response = await axios.post(url, {
                model: 'claude-3-5-sonnet-latest',
                max_tokens: 1024,
                messages: [{ role: 'user', content: prompt }]
            }, { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' } });
            diagnosis = response.data.content[0].text;
        } else {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
            const response = await axios.post(url, {
                contents: [{ parts: [{ text: prompt }] }]
            }, { headers: { 'Content-Type': 'application/json' } });
            if (response.data?.candidates?.[0]) {
                diagnosis = response.data.candidates[0].content.parts[0].text;
            } else {
                throw new Error('Invalid response from Gemini API');
            }
        }

        diagnosis = diagnosis.replace(/^```(?:markdown)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        res.json({ diagnosis });
    } catch (e: any) {
        handleK8sError(res, e);
    }
});

// POST /api/kubernetes/namespaces/:ns/events/ai-diagnose
router.post('/namespaces/:ns/events/ai-diagnose', async (req, res) => {
    try {
        const { event } = req.body;
        const ns = req.params.ns as string;
        if (!event) return res.status(400).json({ message: 'Event details required' });

        auditLogService.log({
            user: getUserFromReq(req),
            action: 'AI_EVENT_DIAGNOSE',
            target: `event/${ns}/${event.involvedObject || event.reason}`,
            details: `Triggered SRE AI diagnosis for warning event '${event.reason}' in namespace '${ns}'`,
            ip: req.ip
        });

        const apiKey = process.env.AI_API_KEY;
        const aiProvider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();

        if (!apiKey) {
            const fallbackMarkdown = `### 🤖 SRE Warning Event Analysis
**Namespace**: \`${ns}\`
**Reason**: \`${event.reason}\`
**Involved Object**: \`${event.involvedKind}/${event.involvedObject}\`
**Occurrences**: ${event.count} times

#### 📜 Message Digest
\`\`\`text
${event.message}
\`\`\`

> [!TIP]
> *Configure \`AI_API_KEY\` in your \`.env\` file for full LLM generative SRE analysis.*`;
            return res.json({ diagnosis: fallbackMarkdown });
        }

        const prompt = `You are a Principal SRE engineer. Analyze this Kubernetes Warning Event in namespace "${ns}":
Reason: ${event.reason}
Involved Object: ${event.involvedKind}/${event.involvedObject}
Message: ${event.message}
Occurrences: ${event.count}

Provide a concise markdown breakdown:
### 1. 🚨 Diagnostic Summary
### 2. ⚡ Risk & Impact
### 3. 🛠️ Resolution Commands`;

        let diagnosis = '';
        if (aiProvider === 'openai') {
            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o',
                messages: [{ role: 'user', content: prompt }]
            }, { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' } });
            diagnosis = response.data.choices[0].message.content;
        } else if (aiProvider === 'anthropic') {
            const response = await axios.post('https://api.anthropic.com/v1/messages', {
                model: 'claude-3-5-sonnet-latest',
                max_tokens: 1024,
                messages: [{ role: 'user', content: prompt }]
            }, { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' } });
            diagnosis = response.data.content[0].text;
        } else {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
            const response = await axios.post(url, {
                contents: [{ parts: [{ text: prompt }] }]
            }, { headers: { 'Content-Type': 'application/json' } });
            diagnosis = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
        }

        diagnosis = diagnosis.replace(/^```(?:markdown)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        res.json({ diagnosis });
    } catch (e: any) {
        handleK8sError(res, e);
    }
});

export const kubernetesRouter = router;

