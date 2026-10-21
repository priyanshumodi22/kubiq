import express from 'express';
import { KubernetesService } from '../services/KubernetesService';
import { getUserFromReq, checkNamespaceAccess, requirePermission } from '../middleware/auth';
import { clickhouseService } from '../services/ClickhouseService';
import { AuditLogService } from '../services/AuditLogService';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { validateLicenseKey } from '../utils/licenseValidator';
import { KubiAiConfigService } from '../services/KubiAiConfigService';
import { KubiProviderService } from '../services/KubiProviderService';
import { RbacRoleService } from '../services/RbacRoleService';
import { isSecretResourceType } from '../utils/kubernetesResourceType';

const router = express.Router();
const k8sService = KubernetesService.getInstance();
const auditLogService = AuditLogService.getInstance();

// Every Kubernetes endpoint is read-only and requires an explicit telemetry permission.
router.use(requirePermission('kubernetes.read'));

const requireProLicense = async (res: express.Response): Promise<boolean> => {
    const licenseKey = process.env.KUBIQ_LICENSE_KEY || '';
    if (!licenseKey) {
        res.status(402).json({ error: 'NO_LICENSE', message: 'kubiq Pro License required for AI features.' });
        return false;
    }

    if (!(await validateLicenseKey(licenseKey))) {
        res.status(402).json({ error: 'INVALID_LICENSE', message: 'The provided kubiq Pro License is invalid or expired.' });
        return false;
    }

    return true;
};


const getContext = (req: express.Request) => { const ctx = req.headers['x-kubernetes-context']; const parsed = (Array.isArray(ctx) ? ctx[0] : ctx) || ''; return parsed || k8sService.defaultContext; };


// GET /api/kubernetes/status
router.get('/status', (_req, res) => {
    res.json({
        available: k8sService.available,
        context: k8sService.defaultContext,
        scrapeInterval: Number.parseInt(process.env.APM_SCRAPE_INTERVAL_SECONDS || '60', 10),
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
        
        const user = req.user as any;
        // Cluster-wide namespace visibility is an explicit permission.
        if (await RbacRoleService.hasPermission(user || {}, 'kubernetes.namespaces.all')) {
            return res.json(clusterNamespaces);
        }

        // Viewers are scoped to allowedNamespaces
        const userId = user.sub || user.id;
        let allowed: string[] | undefined = undefined;

        if (userId) {
            try {
                const repo = await DatabaseFactory.getUserRepository();
                const dbUser = await repo.findById(userId);
                if (dbUser && dbUser.allowedNamespaces) {
                    allowed = dbUser.allowedNamespaces;
                }
            } catch (error) {
                console.warn('Namespace scope refresh failed; using the authenticated user scope.', error);
            }
        }

        if (!allowed) allowed = user.allowedNamespaces || ['apps', 'default'];

        if (allowed && Array.isArray(allowed) && allowed.length > 0) {
            const allowedLower = allowed.map((s: string) => String(s).toLowerCase().trim());
            const filtered = clusterNamespaces.filter(ns => allowedLower.includes(ns.toLowerCase().trim()));
            return res.json(filtered.length > 0 ? filtered : allowed);
        }

        res.json([]);
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

router.get('/namespaces/:ns/secrets', requirePermission('kubernetes.secrets.read'), checkNamespaceAccess, async (req, res) => {
    try {
        if (!k8sService.available) return res.json([]);
        res.json(await k8sService.getSecrets(getContext(req), (req.params.ns as string)));
    } catch (e: any) { handleK8sError(res, e); }
});

// GET /api/kubernetes/namespaces/:ns/pods/:podName/metrics/history

router.get('/namespaces/:ns/pods/:podName/metrics/history', checkNamespaceAccess, async (req, res) => {
    try {
        if (!clickhouseService.isConfigured()) {
            return res.status(404).json({ message: 'Clickhouse not configured for APM storage' });
        }
        
        // Default to last 24 hours
        let since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        if (req.query.hours) {
            const h = Number.parseInt(req.query.hours as string);
            if (!Number.isNaN(h) && h > 0) {
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

router.get('/namespaces/:ns/yaml/:type/:name', checkNamespaceAccess, async (req, res) => {
    try {
        if (isSecretResourceType(req.params.type) && !(await RbacRoleService.hasPermission(req.user || {}, 'kubernetes.secrets.read'))) {
            return res.status(403).json({ error: 'RBAC_FORBIDDEN', message: 'Viewing Kubernetes Secret YAML requires kubernetes.secrets.read.' });
        }
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
        if (isSecretResourceType(req.params.type)) return res.status(403).json({ error: 'RBAC_FORBIDDEN', message: 'Cluster-scoped Secret access is not available.' });
        if (!k8sService.available) return res.status(503).json({ message: 'K8s not available' });
        const raw = await k8sService.getResourceRaw(getContext(req), '', (req.params.type as string), (req.params.name as string));
        if (!raw) return res.status(404).json({ message: 'Not found' });
        res.json(raw);
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});

// GET /api/kubernetes/namespaces/:ns/autoscalers/:type/:name
router.get('/namespaces/:ns/autoscalers/:type/:name', checkNamespaceAccess, async (req, res) => {
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
        if (!(await requireProLicense(res))) return;
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

        const aiConfig = await KubiAiConfigService.getResolvedConfig();

        if (!aiConfig) {
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
> Ask a kubiq administrator to configure kubi AI for full LLM-powered SRE analysis.`;
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

        let diagnosis = await new KubiProviderService().complete([{ role: 'user', content: prompt }], 1024);

        diagnosis = diagnosis.replace(/^```(?:markdown)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        res.json({ diagnosis });
    } catch (e: any) {
        handleK8sError(res, e);
    }
});

// POST /api/kubernetes/namespaces/:ns/events/ai-diagnose
router.post('/namespaces/:ns/events/ai-diagnose', checkNamespaceAccess, async (req, res) => {
    try {
        if (!(await requireProLicense(res))) return;
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

        const aiConfig = await KubiAiConfigService.getResolvedConfig();

        if (!aiConfig) {
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
> Ask a kubiq administrator to configure kubi AI for full LLM-powered SRE analysis.`;
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

        let diagnosis = await new KubiProviderService().complete([{ role: 'user', content: prompt }], 1024);

        diagnosis = diagnosis.replace(/^```(?:markdown)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        res.json({ diagnosis });
    } catch (e: any) {
        handleK8sError(res, e);
    }
});

export const kubernetesRouter = router;

