// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Login from './Login';

const mocks = vi.hoisted(() => ({ native: vi.fn(), sso: vi.fn(), token: vi.fn(), options: vi.fn(), verify: vi.fn(), authenticate: vi.fn() }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ loginNative: mocks.native, loginKeycloak: mocks.sso, loginWithToken: mocks.token, isAuthenticated: false, isLoading: false, authEnabled: true, nativeAuthEnabled: true }) }));
vi.mock('../components/Footer', () => ({ default: () => null }));
vi.mock('../services/api', () => ({ apiClient: { loginPasskeyOptions: mocks.options, loginPasskeyVerify: mocks.verify } }));
vi.mock('@simplewebauthn/browser', () => ({ startAuthentication: mocks.authenticate }));
beforeEach(() => {
  vi.resetAllMocks(); mocks.native.mockResolvedValue(undefined); mocks.options.mockResolvedValue({ challenge: 'fixture' });
  mocks.authenticate.mockResolvedValue({ id: 'fixture-credential' });
  mocks.verify.mockResolvedValue({ verified: true, token: 'fixture-only', user: { id: 'fixture-user' } });
});
afterEach(cleanup);

describe('login compatibility', () => {
  it('toggles password visibility without changing the entered value', () => {
    const view = render(<MemoryRouter><Login /></MemoryRouter>);
    const input = view.getByLabelText('Password') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'fixture-password' } });
    expect(input.type).toBe('password');
    fireEvent.click(view.getByRole('button', { name: 'Show password' }));
    expect(input.type).toBe('text');
    expect(input.value).toBe('fixture-password');
    fireEvent.click(view.getByRole('button', { name: 'Hide password' }));
    expect(input.type).toBe('password');
    expect(input.value).toBe('fixture-password');
  });

  it.each([
    [{ name: 'NotAllowedError' }, 'Biometric login cancelled or timed out'],
    [{ response: { data: { error: 'Server error', message: 'Server message' } }, message: 'Transport error' }, 'Server error'],
    [{ response: { data: { message: 'Server message' } }, message: 'Transport error' }, 'Server message'],
    [new Error('Transport error'), 'Transport error'],
    [null, 'Biometric login failed'],
  ])('reports a passkey failure without authenticating', async (failure, message) => {
    mocks.authenticate.mockRejectedValue(failure);
    const view = render(<MemoryRouter><Login /></MemoryRouter>);
    fireEvent.change(view.getByRole('textbox', { name: 'Username' }), { target: { value: 'fixture' } });
    fireEvent.click(view.getByRole('button', { name: 'Use passkey' }));
    await waitFor(() => expect(view.getByText(message as string)).toBeTruthy());
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.token).not.toHaveBeenCalled();
  });

  it('preserves empty and nonempty username passkey styling and availability', () => {
    const view = render(<MemoryRouter><Login /></MemoryRouter>);
    const passkey = view.getByRole('button', { name: 'Use passkey' }) as HTMLButtonElement;
    expect(passkey.disabled).toBe(true);
    expect(passkey.title).toBe('Enter username first');
    expect(passkey.className).toContain('cursor-not-allowed');
    fireEvent.change(view.getByRole('textbox', { name: 'Username' }), { target: { value: 'fixture' } });
    expect(passkey.disabled).toBe(false);
    expect(passkey.title).toBe('Use your passkey');
    expect(passkey.className).toContain('border-primary/50');
  });

  it('submits native credentials and keeps SSO separate', async () => {
    const view = render(<MemoryRouter><Login /></MemoryRouter>);
    fireEvent.change(view.getByRole('textbox', { name: 'Username' }), { target: { value: 'fixture' } });
    fireEvent.change(view.getByLabelText('Password'), { target: { value: 'fixture-password' } });
    fireEvent.click(view.getByRole('button', { name: /^Sign In$/ }));
    await waitFor(() => expect(mocks.native).toHaveBeenCalledWith({ username: 'fixture', password: 'fixture-password' }));
    fireEvent.click(view.getByRole('button', { name: 'Sign In with SSO' }));
    expect(mocks.sso).toHaveBeenCalledTimes(1);
  });

  it('preserves passkey challenge and verification ordering', async () => {
    const view = render(<MemoryRouter><Login /></MemoryRouter>);
    fireEvent.change(view.getByRole('textbox', { name: 'Username' }), { target: { value: 'fixture' } });
    fireEvent.click(view.getByRole('button', { name: 'Use passkey' }));
    await waitFor(() => expect(mocks.token).toHaveBeenCalledWith('fixture-only', { id: 'fixture-user' }));
    expect(mocks.options).toHaveBeenCalledWith('fixture');
    expect(mocks.authenticate).toHaveBeenCalledWith({ optionsJSON: { challenge: 'fixture' } });
    expect(mocks.verify).toHaveBeenCalledWith('fixture', { id: 'fixture-credential' });
  });

  it('reports rejected native credentials without accepting a token', async () => {
    mocks.native.mockRejectedValue(new Error('fixture rejected'));
    const view = render(<MemoryRouter><Login /></MemoryRouter>);
    fireEvent.click(view.getByRole('button', { name: /^Sign In$/ }));
    await waitFor(() => expect(view.getByText('Login failed')).toBeTruthy());
    expect(mocks.token).not.toHaveBeenCalled();
  });
});
