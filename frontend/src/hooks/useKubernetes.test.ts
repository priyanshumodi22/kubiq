// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKubernetes } from './useKubernetes';

const api = vi.hoisted(() => ({ getKubernetesStatus: vi.fn(), getKubernetesNamespaces: vi.fn(), getKubernetesContexts: vi.fn(), switchKubernetesContext: vi.fn(), getKubernetesPods: vi.fn(), getKubernetesMetrics: vi.fn(), getKubernetesEvents: vi.fn(), getKubernetesDeployments: vi.fn() }));
vi.mock('../services/api', () => ({ apiClient: api }));
beforeEach(() => {
  vi.resetAllMocks();
  api.getKubernetesStatus.mockResolvedValue({ available: true, context: 'cluster-a' });
  api.getKubernetesNamespaces.mockResolvedValue(['apps']);
  api.getKubernetesContexts.mockResolvedValue({ contexts: [{ name: 'cluster-a', cluster: 'cluster-a', user: 'fixture' }] });
  for (const request of [api.getKubernetesPods, api.getKubernetesMetrics, api.getKubernetesEvents, api.getKubernetesDeployments]) request.mockResolvedValue([]);
});
afterEach(cleanup);
const settle = async () => { await act(async () => {}); };

describe('Kubernetes discovery and explicit refresh', () => {
  it('discovers context and namespace without starting duplicate workload polling', async () => {
    const { result } = renderHook(useKubernetes);
    await settle();
    expect(result.current.context).toBe('cluster-a');
    expect(result.current.selectedNamespace).toBe('apps');
    expect(result.current.contexts[0].user).toBe('fixture');
    expect(api.getKubernetesPods).not.toHaveBeenCalled();
    act(() => result.current.refresh());
    await settle();
    for (const request of [api.getKubernetesPods, api.getKubernetesMetrics, api.getKubernetesEvents, api.getKubernetesDeployments]) expect(request).toHaveBeenCalledWith('apps');
    expect(result.current.loading).toBe(false);
  });

  it('clears resource state when switching to an unavailable context', async () => {
    api.getKubernetesPods.mockResolvedValue([{ name: 'api' }]);
    const { result } = renderHook(useKubernetes);
    await settle();
    act(() => result.current.refresh()); await settle();
    expect(result.current.pods).toHaveLength(1);
    api.switchKubernetesContext.mockResolvedValue({ available: false });
    await act(async () => { await result.current.switchContext('offline'); });
    expect(result.current.available).toBe(false);
    expect(result.current.selectedNamespace).toBe('');
    expect(result.current.pods).toEqual([]);
    expect(result.current.namespaces).toEqual([]);
    act(() => result.current.refresh());
    expect(api.getKubernetesPods).toHaveBeenCalledTimes(1);
  });

  it('selects the new namespace and reloads context metadata after switching', async () => {
    const { result } = renderHook(useKubernetes); await settle();
    api.switchKubernetesContext.mockResolvedValue({ available: true, context: 'cluster-b' });
    api.getKubernetesNamespaces.mockResolvedValueOnce([]);
    await act(async () => { await result.current.switchContext('cluster-b'); });
    expect(result.current.context).toBe('cluster-b');
    expect(result.current.selectedNamespace).toBe('');
    expect(api.getKubernetesContexts).toHaveBeenCalledTimes(2);
  });

  it('preserves explicit request messages and bounds malformed failures', async () => {
    api.getKubernetesNamespaces.mockRejectedValueOnce({ message: 'Namespaces forbidden' });
    const { result } = renderHook(useKubernetes); await settle();
    expect(result.current.error).toBe('Namespaces forbidden');
    api.switchKubernetesContext.mockRejectedValueOnce(null);
    await act(async () => { await result.current.switchContext('cluster-b'); });
    expect(result.current.error).toBe('Failed to switch context');
    act(() => result.current.setSelectedNamespace('apps'));
    api.getKubernetesPods.mockRejectedValueOnce(new Error('Pods unavailable'));
    act(() => result.current.refresh()); await settle();
    expect(result.current.error).toBe('Pods unavailable');
    expect(result.current.loading).toBe(false);
  });

  it('does not discover namespaces after an unavailable status response', async () => {
    api.getKubernetesStatus.mockRejectedValueOnce(new Error('Offline'));
    const { result } = renderHook(useKubernetes); await settle();
    expect(result.current.available).toBe(false);
    expect(api.getKubernetesNamespaces).not.toHaveBeenCalled();
  });
});
