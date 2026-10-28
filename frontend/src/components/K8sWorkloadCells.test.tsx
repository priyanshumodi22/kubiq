// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { K8sWorkloadCells } from './K8sWorkloadCells';
import { podOwnerLabel } from './kubernetesWorkloads';
import type { KubernetesResourceDetails } from '../types/kubernetesResource';
afterEach(cleanup);
it.each([
  ['statefulsets', { desired: 1, readyReplicas: 1 }, 'Ready'], ['daemonsets', { desired: 3, readyReplicas: 2 }, 'Not ready'],
  ['replicasets', { desired: 0 }, 'Scaled to zero'], ['jobs', { completed: true }, 'Complete'],
  ['jobs', { failedCondition: true }, 'Failed'], ['jobs', { active: 1 }, 'Running'], ['jobs', {}, 'Pending'],
  ['cronjobs', { suspended: true, schedule: '0 * * * *' }, 'Suspended'], ['cronjobs', { active: 1 }, 'Scheduled'],
] as const)('reports %s state without assuming readiness', (type, item, state) => {
  const view = render(<table><tbody><tr><K8sWorkloadCells type={type} item={item as KubernetesResourceDetails} /></tr></tbody></table>);
  expect(view.getByRole('cell', { name: state })).toBeTruthy();
});
it('identifies arbitrary pod owner kinds and standalone pods', () => {
  expect(podOwnerLabel(undefined)).toBe('Standalone pod');
  expect(podOwnerLabel([{ kind: 'CustomController', name: 'app' }])).toBe('CustomController/app');
  expect(podOwnerLabel([{ kind: 'Other', name: 'other' }, { kind: 'StatefulSet', name: 'mongodb', controller: true }])).toBe('StatefulSet/mongodb');
});
