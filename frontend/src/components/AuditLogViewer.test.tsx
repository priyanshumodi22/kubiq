// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuditLogViewer } from './AuditLogViewer';

const mocks = vi.hoisted(() => ({ allowed: false, getAuditLogs: vi.fn() }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => mocks.allowed }) }));
vi.mock('../services/api', () => ({ apiClient: { getAuditLogs: mocks.getAuditLogs } }));
vi.mock('react-router-dom', () => ({ Navigate: () => <div>Redirected</div> }));
afterEach(() => { cleanup(); mocks.allowed = false; vi.clearAllMocks(); });

describe('audit viewer permission transitions', () => {
  it('renders loading and empty results as distinct states', async () => {
    mocks.allowed = true;
    mocks.getAuditLogs.mockResolvedValue({ records: [], total: 0 });
    const view = render(<AuditLogViewer />);
    expect(view.getByText('Loading audit logs...')).toBeTruthy();
    await waitFor(() => expect(view.getByText('No administrative audit events recorded yet.')).toBeTruthy());
    expect(view.queryByText('Loading audit logs...')).toBeNull();
    expect(view.queryByRole('table')).toBeNull();
  });

  it('renders audit records and pagination instead of the empty state', async () => {
    mocks.allowed = true;
    mocks.getAuditLogs.mockResolvedValue({ records: [{ id: 'audit-1', timestamp: '2026-10-23T00:00:00Z', user: 'operator', action: 'AUTH_LOGIN', target: 'session' }], total: 1 });
    const view = render(<AuditLogViewer />);
    await waitFor(() => expect(view.getByRole('table')).toBeTruthy());
    expect(view.getByText('operator')).toBeTruthy();
    expect(view.getByText('1 event · page 1 of 1')).toBeTruthy();
    expect(view.queryByText('No administrative audit events recorded yet.')).toBeNull();
    expect(view.queryByText('Loading audit logs...')).toBeNull();
  });

  it('does not request audit data without permission and preserves hook order when permission changes', async () => {
    mocks.getAuditLogs.mockResolvedValue({ records: [], total: 0 });
    const view = render(<AuditLogViewer />);
    expect(mocks.getAuditLogs).not.toHaveBeenCalled();
    mocks.allowed = true;
    view.rerender(<AuditLogViewer />);
    await waitFor(() => expect(mocks.getAuditLogs).toHaveBeenCalledTimes(1));
    mocks.allowed = false;
    view.rerender(<AuditLogViewer />);
    expect(view.getByText('Redirected')).toBeTruthy();
  });
});
