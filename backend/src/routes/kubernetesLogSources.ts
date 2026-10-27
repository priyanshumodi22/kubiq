import { Router } from 'express';
import { requirePermission } from '../middleware/auth';
import { KubernetesLogSourceController as controller } from '../controllers/KubernetesLogSourceController';

export const kubernetesLogSourceRouter = Router();
kubernetesLogSourceRouter.use(requirePermission('kubernetes.read'));
kubernetesLogSourceRouter.get('/namespaces', requirePermission('logs.raw.read'), controller.namespaces);
kubernetesLogSourceRouter.get('/targets', requirePermission('logs.raw.read'), controller.targets);
kubernetesLogSourceRouter.get('/containers', requirePermission('logs.raw.read'), controller.containers);
kubernetesLogSourceRouter.get('/sources', controller.list);
const manage = [requirePermission('services.manage'), requirePermission('logs.raw.read')];
kubernetesLogSourceRouter.post('/sources', ...manage, controller.save);
kubernetesLogSourceRouter.put('/sources/:id', ...manage, controller.save);
kubernetesLogSourceRouter.delete('/sources/:id', ...manage, controller.remove);
