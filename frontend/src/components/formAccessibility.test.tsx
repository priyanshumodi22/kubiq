// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddServiceModal } from './AddServiceModal';
import { EditServiceModal } from './EditServiceModal';
import { NotificationConfigModal } from './NotificationConfigModal';
import Login from '../pages/Login';
import Register from '../pages/Register';

const mocks = vi.hoisted(() => ({
  createChannel: vi.fn(),
  register: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), addToast: vi.fn() },
}));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => mocks.toast }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => true, isAuthenticated: false, isLoading: false, authEnabled: false, nativeAuthEnabled: true, loginNative: vi.fn(), registerNative: mocks.register }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), Link: ({ children }: { children: import('react').ReactNode }) => <span>{children}</span> }));
vi.mock('./Footer', () => ({ default: () => null }));
vi.mock('../services/api', () => ({ apiClient: {
  getNotificationChannels: async () => [], getNotificationHistory: async () => [],
  getMaintenanceConfig: async () => ({ maintenanceMode: false, mutedNamespaces: [], mutedServices: [] }),
  createNotificationChannel: mocks.createChannel,
} }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('form control names and identities', () => {
  it('matches the backend minimum password length instead of advertising six characters', () => {
    const view = render(<Register />);
    const password = view.getByLabelText('Password', { exact: true });
    expect(password.getAttribute('minlength')).toBe('12');
    fireEvent.change(password, { target: { value: 'short123' } });
    fireEvent.change(view.getByLabelText('Confirm Password'), { target: { value: 'short123' } });
    fireEvent.submit(view.container.querySelector('form')!);
    expect(view.getByText('Password must be at least 12 characters')).toBeTruthy();
    expect(mocks.register).not.toHaveBeenCalled();
  });
  it('associates service labels and keeps IDs unique across multiple forms', () => {
    const view = render(<><AddServiceModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} /><AddServiceModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} /></>);
    expect(view.getAllByLabelText('Friendly Name')).toHaveLength(2);
    expect(view.getAllByLabelText('Check Interval')).toHaveLength(2);
    const ids = [...document.querySelectorAll('input[id],button[id]')].map(element => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    fireEvent.click(view.getAllByLabelText('Monitor Type')[0]);
    fireEvent.click(view.getByRole('button', { name: 'TCP Port' }));
    expect(view.getByLabelText('Hostname')).toBeTruthy();
    expect(view.getByLabelText('Port')).toBeTruthy();
  });
  it('names editable service fields without changing the stored service name', () => {
    const view = render(<EditServiceModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} serviceName="api" currentEndpoint="https://example.test" />);
    expect((view.getByLabelText('Service Name') as HTMLInputElement).disabled).toBe(true);
    expect((view.getByLabelText('Endpoint URL | headers (optional)') as HTMLInputElement).value).toBe('https://example.test');
    expect(view.getByLabelText('Retries before alerting')).toBeTruthy();
  });
  it('names login fields for assistive technology and password managers', () => {
    const view = render(<Login />);
    expect(view.getByLabelText('Username').getAttribute('autocomplete')).toBe('username');
    expect(view.getByLabelText('Password', { exact: true }).getAttribute('autocomplete')).toBe('current-password');
  });
  it('names registration fields independently', () => {
    const view = render(<Register />);
    expect(view.getByLabelText('Username')).toBeTruthy();
    expect(view.getByLabelText('Email (Optional)')).toBeTruthy();
    expect(view.getByLabelText('Password', { exact: true })).not.toBe(view.getByLabelText('Confirm Password'));
  });
  it('uses named SMTP fields and keyboard-operable notification event buttons', async () => {
    mocks.createChannel.mockResolvedValue({});
    const view = render(<NotificationConfigModal isOpen onClose={vi.fn()} />);
    fireEvent.click(view.getByRole('button', { name: 'Add Channel' }));
    fireEvent.change(view.getByLabelText('Friendly Name'), { target: { value: 'Operations' } });
    fireEvent.click(view.getByLabelText('Channel Type'));
    fireEvent.click(view.getByRole('button', { name: 'Email (SMTP)' }));
    fireEvent.change(view.getByLabelText('SMTP Host'), { target: { value: 'smtp.example.test' } });
    expect(view.getByLabelText('SMTP Port')).toBeTruthy();
    expect(view.getByLabelText('Recipient Email(s)')).toBeTruthy();
    const up = view.getByRole('button', { name: /Notify when UP/ });
    expect(up.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(up);
    expect(up.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(await view.findByRole('button', { name: 'Save Channel' }));
    await waitFor(() => expect(mocks.createChannel).toHaveBeenCalledWith(expect.objectContaining({ name: 'Operations', type: 'email', events: { up: false, down: true }, config: { smtpHost: 'smtp.example.test' } })));
  });
});
