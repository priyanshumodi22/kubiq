import express from 'express';
import yaml from 'js-yaml';
import { KubernetesService } from '../services/KubernetesService';

const router = express.Router();
const k8sService = KubernetesService.getInstance();

// GET /api/kubernetes/status
router.get('/status', (_req, res) => {
    res.json({
        available: k8sService.available,
        context: k8sService.currentContext,
    });
});

// GET /api/kubernetes/namespaces
router.get('/namespaces', async (_req, res) => {
    try {
        if (!k8sService.available) return res.json([]);
        const namespaces = await k8sService.getNamespaces();
        res.json(namespaces);
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});

// GET /api/kubernetes/namespaces/:ns/pods
router.get('/namespaces/:ns/pods', async (req, res) => {
    try {
        if (!k8sService.available) return res.json([]);
        const pods = await k8sService.getPods(req.params.ns);
        res.json(pods);
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});

// GET /api/kubernetes/namespaces/:ns/metrics
router.get('/namespaces/:ns/metrics', async (req, res) => {
    try {
        if (!k8sService.available) return res.json([]);
        const metrics = await k8sService.getPodMetrics(req.params.ns);
        res.json(metrics);
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});

// GET /api/kubernetes/namespaces/:ns/events
router.get('/namespaces/:ns/events', async (req, res) => {
    try {
        if (!k8sService.available) return res.json([]);
        const events = await k8sService.getEvents(req.params.ns);
        res.json(events);
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});

// GET /api/kubernetes/namespaces/:ns/deployments
router.get('/namespaces/:ns/deployments', async (req, res) => {
    try {
        if (!k8sService.available) return res.json([]);
        const deployments = await k8sService.getDeployments(req.params.ns);
        res.json(deployments);
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});

// --- New Resources ---

router.get('/nodes', async (_req, res) => {
    try {
        if (!k8sService.available) return res.json([]);
        res.json(await k8sService.getNodes());
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get('/namespaces/:ns/services', async (req, res) => {
    try {
        if (!k8sService.available) return res.json([]);
        res.json(await k8sService.getServices(req.params.ns));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get('/namespaces/:ns/endpoints', async (req, res) => {
    try {
        if (!k8sService.available) return res.json([]);
        res.json(await k8sService.getEndpoints(req.params.ns));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get('/namespaces/:ns/ingresses', async (req, res) => {
    try {
        if (!k8sService.available) return res.json([]);
        res.json(await k8sService.getIngresses(req.params.ns));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get('/persistentvolumes', async (_req, res) => {
    try {
        if (!k8sService.available) return res.json([]);
        res.json(await k8sService.getPersistentVolumes());
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get('/namespaces/:ns/persistentvolumeclaims', async (req, res) => {
    try {
        if (!k8sService.available) return res.json([]);
        res.json(await k8sService.getPersistentVolumeClaims(req.params.ns));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get('/storageclasses', async (_req, res) => {
    try {
        if (!k8sService.available) return res.json([]);
        res.json(await k8sService.getStorageClasses());
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get('/namespaces/:ns/configmaps', async (req, res) => {
    try {
        if (!k8sService.available) return res.json([]);
        res.json(await k8sService.getConfigMaps(req.params.ns));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get('/namespaces/:ns/secrets', async (req, res) => {
    try {
        if (!k8sService.available) return res.json([]);
        res.json(await k8sService.getSecrets(req.params.ns));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// --- Management Actions ---

// POST /api/kubernetes/namespaces/:ns/deployments/:name/scale
router.post('/namespaces/:ns/deployments/:name/scale', async (req, res) => {
    try {
        const { replicas } = req.body;
        if (typeof replicas !== 'number') return res.status(400).json({ message: 'Replicas must be a number' });
        await k8sService.scaleDeployment(req.params.ns, req.params.name, replicas);
        res.json({ message: 'Scaling initiated' });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// POST /api/kubernetes/namespaces/:ns/deployments/:name/restart
router.post('/namespaces/:ns/deployments/:name/restart', async (req, res) => {
    try {
        await k8sService.restartDeployment(req.params.ns, req.params.name);
        res.json({ message: 'Restart initiated' });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// DELETE /api/kubernetes/namespaces/:ns/:type/:name
router.delete('/namespaces/:ns/:type/:name', async (req, res) => {
    try {
        await k8sService.deleteResource(req.params.ns, req.params.type, req.params.name);
        res.json({ message: 'Deletion initiated' });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// POST /api/kubernetes/apply - Apply raw YAML/JSON manifest
router.post('/apply', async (req, res) => {
    try {
        let { manifest } = req.body;
        if (!manifest) return res.status(400).json({ message: 'Manifest is required' });

        // If manifest is a string (YAML), parse it
        if (typeof manifest === 'string') {
            try {
                manifest = yaml.load(manifest);
            } catch (yamlError: any) {
                return res.status(400).json({ message: `YAML Parsing Error: ${yamlError.message}` });
            }
        }

        const result = await k8sService.applyResource(manifest);
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});

router.get('/namespaces/:ns/yaml/:type/:name', async (req, res) => {
    try {
        if (!k8sService.available) return res.status(503).json({ message: 'K8s not available' });
        const raw = await k8sService.getResourceRaw(req.params.ns, req.params.type, req.params.name);
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
        const raw = await k8sService.getResourceRaw('', req.params.type, req.params.name);
        if (!raw) return res.status(404).json({ message: 'Not found' });
        res.json(raw);
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});

export const kubernetesRouter = router;
