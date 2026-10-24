// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ServiceDetail from './ServiceDetail';
import type { ServiceStatus } from '../types';
import { serviceStatusPresentation, statColorClass } from './serviceDetailPresentation';

const mocks = vi.hoisted(() => ({ custom: vi.fn(), check: vi.fn(), refresh: vi.fn() }));
vi.mock('../hooks/useServices', () => ({ useServiceHistory: () => ({ history: [], loading: false, refresh: mocks.refresh }) }));
vi.mock('../services/api', () => ({ apiClient: { customCheck: mocks.custom, checkService: mocks.check } }));
const service: ServiceStatus = { name: 'fixture', endpoint: 'https://example.test', currentStatus: 'healthy', history: [], type: 'http' };
beforeEach(() => { vi.resetAllMocks(); mocks.custom.mockResolvedValue({ status: 200 }); });
afterEach(cleanup);

describe('service details compatibility', () => {
  it('preserves status labels, colors and unknown fallbacks', () => {
    expect(serviceStatusPresentation('healthy')).toEqual({ label: 'Healthy', color: 'success' });
    expect(serviceStatusPresentation('unhealthy')).toEqual({ label: 'Unhealthy', color: 'error' });
    expect(serviceStatusPresentation('unexpected')).toEqual({ label: 'Unknown', color: 'warning' });
    expect(['success', 'error', 'warning', undefined, 'unexpected'].map(statColorClass)).toEqual(['text-success', 'text-error', 'text-warning', 'text-primary', 'text-primary']);
  });

  it('keeps remaining header inputs mounted when a preceding row is removed', () => {
    const view = render(<ServiceDetail service={service} onClose={vi.fn()} />);
    fireEvent.click(view.getByRole('button', { name: 'Advanced Options (Headers & Body)' }));
    fireEvent.click(view.getByRole('button', { name: 'Add Header' }));
    fireEvent.click(view.getByRole('button', { name: 'Add Header' }));
    const second = view.getAllByPlaceholderText('Key')[1];
    fireEvent.change(second, { target: { value: 'X-Fixture' } });
    fireEvent.click(view.getByRole('button', { name: 'Remove request header 1' }));
    expect(view.getByPlaceholderText('Key')).toBe(second);
    expect((second as HTMLInputElement).value).toBe('X-Fixture');
  });

  it('preserves custom check parameters and rejects invalid JSON before making a request', async () => {
    const view = render(<ServiceDetail service={service} onClose={vi.fn()} />);
    fireEvent.change(view.getByPlaceholderText('/custom-endpoint'), { target: { value: '/fixture' } });
    fireEvent.change(view.getByRole('combobox', { name: 'Custom check method' }), { target: { value: 'POST' } });
    fireEvent.click(view.getByRole('button', { name: 'Advanced Options (Headers & Body)' }));
    const body = view.getByPlaceholderText('{"key": "value"}');
    fireEvent.change(body, { target: { value: 'invalid' } });
    fireEvent.click(view.getByRole('button', { name: /^Check$/ }));
    expect(view.getByText(/Invalid JSON in request body/)).toBeTruthy();
    expect(mocks.custom).not.toHaveBeenCalled();
    fireEvent.change(body, { target: { value: '{"fixture":true}' } });
    fireEvent.click(view.getByRole('button', { name: /^Check$/ }));
    await waitFor(() => expect(mocks.custom).toHaveBeenCalledWith('fixture', '/fixture', 'POST', {}, { fixture: true }));
  });
});
