import type { Request, Response, NextFunction } from 'express';
import * as k8s from '@kubernetes/client-node';
import { KubernetesService } from '../services/KubernetesService';
import { defaultLogKubeConfig, logRequestOptions, KubernetesLogSources, parseLogSource, resolveLogPods } from '../services/KubernetesLogSources';
import { canAccessKubernetesNamespace } from '../middleware/auth';
import { AuditLogService } from '../services/AuditLogService';

export class KubernetesLogSourceController {
    static async namespaces(req: Request, res: Response, next: NextFunction) {
        try {
            const service = KubernetesService.getInstance();
            if (!service.available) return res.status(503).json({ message: 'Kubernetes is unavailable.' });
            const result = await defaultLogKubeConfig().makeApiClient(k8s.CoreV1Api).listNamespace({}, logRequestOptions());
            const namespaces = result.items.map(item => item.metadata?.name).filter((name): name is string => Boolean(name));
            const visible = await Promise.all(namespaces.map(async namespace => await canAccessKubernetesNamespace(req.user, namespace) ? namespace : null));
            res.json(visible.filter(Boolean));
        } catch (error) { next(error); }
    }
    static async list(req: Request, res: Response, next: NextFunction) {
        try {
            const sources = await KubernetesLogSources.list();
            const visible = await Promise.all(sources.map(async source => await canAccessKubernetesNamespace(req.user, source.namespace) ? source : null));
            res.json(visible.filter(Boolean));
        } catch (error) { next(error); }
    }
    static async save(req: Request, res: Response, next: NextFunction) {
        try {
            const id = typeof req.params.id === 'string' ? req.params.id : undefined;
            const existing = id ? (await KubernetesLogSources.list()).find(source => source.id === id) : undefined;
            if (id && !existing) return res.status(404).json({ message: 'Log source not found.' });
            if (existing && !(await canAccessKubernetesNamespace(req.user, existing.namespace))) return res.status(403).json({ message: 'Access denied to this log source namespace.' });
            let source;
            try { source = parseLogSource(req.body, id); }
            catch (error) { return res.status(400).json({ message: (error as Error).message }); }
            if (!(await canAccessKubernetesNamespace(req.user, source.namespace))) return res.status(403).json({ message: 'Access denied to this log source namespace.' });
            try {
                const pods = await resolveLogPods(source);
                if (source.container && pods.length && !pods.some(pod => pod.spec?.containers.some(container => container.name === source.container))) return res.status(400).json({ message: 'The selected container does not exist in the matching pods.' });
            } catch { return res.status(400).json({ message: 'Cannot resolve this Kubernetes target. Check its availability and Kubernetes permissions.' }); }
            await KubernetesLogSources.change(source.id, source);
            AuditLogService.getInstance().log({ user: req.user?.preferred_username || req.user?.sub || 'unknown', action: 'LOG_SOURCE_SAVE', target: `k8s/${source.namespace}/${source.id}`, details: `Saved ${source.kind} log source ${source.name}`, ip: req.ip });
            res.json(source);
        } catch (error) { next(error); }
    }
    static async remove(req: Request, res: Response, next: NextFunction) {
        try {
            const source = (await KubernetesLogSources.list()).find(item => item.id === req.params.id);
            if (!source) return res.status(404).json({ message: 'Log source not found.' });
            if (!(await canAccessKubernetesNamespace(req.user, source.namespace))) return res.status(403).json({ message: 'Access denied to this log source namespace.' });
            await KubernetesLogSources.change(source.id);
            AuditLogService.getInstance().log({ user: req.user?.preferred_username || req.user?.sub || 'unknown', action: 'LOG_SOURCE_DELETE', target: `k8s/${source.namespace}/${source.id}`, details: 'Removed saved configuration; retained logs are unchanged.', ip: req.ip });
            res.json({ removed: true });
        } catch (error) { next(error); }
    }
    static async targets(req: Request, res: Response, next: NextFunction) {
        try {
            const namespace = typeof req.query.namespace === 'string' ? req.query.namespace : '';
            if (!(await canAccessKubernetesNamespace(req.user, namespace))) return res.status(403).json({ message: 'Access denied to namespace.' });
            const service = KubernetesService.getInstance();
            if (!service.available) return res.status(503).json({ message: 'Kubernetes is unavailable.' });
            const config = defaultLogKubeConfig(), args = { namespace };
            const options = logRequestOptions();
            const core = config.makeApiClient(k8s.CoreV1Api), apps = config.makeApiClient(k8s.AppsV1Api), batch = config.makeApiClient(k8s.BatchV1Api);
            const kind = typeof req.query.kind === 'string' ? req.query.kind : 'deployment';
            const loaders = {
                service: () => core.listNamespacedService(args, options),
                deployment: () => apps.listNamespacedDeployment(args, options),
                statefulset: () => apps.listNamespacedStatefulSet(args, options),
                daemonset: () => apps.listNamespacedDaemonSet(args, options),
                pod: () => core.listNamespacedPod(args, options),
                replicaset: () => apps.listNamespacedReplicaSet(args, options),
                job: () => batch.listNamespacedJob(args, options),
                cronjob: () => batch.listNamespacedCronJob(args, options),
                replicationcontroller: () => core.listNamespacedReplicationController(args, options),
            };
            if (!(kind in loaders)) return res.status(400).json({ message: 'Choose a supported resource type.' });
            const result = await loaders[kind as keyof typeof loaders]();
            res.json(result.items.map(item => ({ name: item.metadata?.name })));
        } catch (error) { next(error); }
    }
    static async containers(req: Request, res: Response, next: NextFunction) {
        try {
            let source;
            try { source = parseLogSource({ ...req.query, name: 'Discovery' }); }
            catch { return res.status(400).json({ message: 'Choose a valid Kubernetes target.' }); }
            if (!(await canAccessKubernetesNamespace(req.user, source.namespace))) return res.status(403).json({ message: 'Access denied to namespace.' });
            const pods = await resolveLogPods(source);
            res.json([...new Set(pods.flatMap(pod => pod.spec?.containers.map(container => container.name) || []))].sort((left, right) => left.localeCompare(right)));
        } catch (error) { next(error); }
    }
}
