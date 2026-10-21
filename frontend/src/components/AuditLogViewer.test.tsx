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
