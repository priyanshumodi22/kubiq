// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KubernetesSpecialContent } from './KubernetesSpecialContent';

const mocks = vi.hoisted(() => ({ overview: vi.fn(), topology: vi.fn() }));
vi.mock('../components/K8sNamespaceOverview', () => ({ K8sNamespaceOverview: (props: unknown) => { mocks.overview(props); return <section>Fixture overview</section>; } }));
vi.mock('../components/K8sRelationshipMap', () => ({ K8sRelationshipMap: (props: unknown) => { mocks.topology(props); return <section>Fixture topology</section>; } }));
vi.mock('../components/K8sRbacPermissionBanner', () => ({ K8sRbacPermissionBanner: ({ onRetry }: { onRetry: () => void }) => <button onClick={onRetry}>Retry denied request</button> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const props = { error: null, resource: 'pods', namespace: 'fixture', data: null, onRetry: vi.fn(), onSwitchTab: vi.fn(), onSelectItem: vi.fn() };

describe('Kubernetes content selection', () => {
  it('shows an RBAC error before overview content and preserves the retry callback', () => {
    const view = render(<KubernetesSpecialContent {...props} resource="overview" error={{ resource: 'pods', namespace: 'fixture', message: 'Denied fixture' }}>Table fixture</KubernetesSpecialContent>);
    fireEvent.click(view.getByRole('button', { name: 'Retry denied request' }));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
    expect(mocks.overview).not.toHaveBeenCalled();
    expect(view.queryByText('Table fixture')).toBeNull();
  });

  it('passes overview selection callbacks and topology fallbacks unchanged', () => {
    const view = render(<KubernetesSpecialContent {...props} resource="overview">Table fixture</KubernetesSpecialContent>);
    expect(mocks.overview).toHaveBeenCalledWith(expect.objectContaining({ selectedNamespace: 'fixture', onSwitchTab: props.onSwitchTab, onSelectItem: props.onSelectItem }));
    view.rerender(<KubernetesSpecialContent {...props} resource="topology">Table fixture</KubernetesSpecialContent>);
    expect(mocks.topology).toHaveBeenCalledWith(expect.objectContaining({ namespace: 'fixture', pods: [], services: [], ingresses: [], configMaps: [], secrets: [], onSelectItem: props.onSelectItem }));
  });

  it('keeps normal table children mounted across resource changes', () => {
    const view = render(<KubernetesSpecialContent {...props}><button>Fixture row</button></KubernetesSpecialContent>);
    const row = view.getByRole('button', { name: 'Fixture row' });
    view.rerender(<KubernetesSpecialContent {...props} resource="services"><button>Fixture row</button></KubernetesSpecialContent>);
    expect(view.getByRole('button', { name: 'Fixture row' })).toBe(row);
  });
});
