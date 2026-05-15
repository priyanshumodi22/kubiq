import express from 'express';
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

export const kubernetesRouter = router;
