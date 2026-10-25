// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KubiPanel } from './KubiPanel';

const mocks = vi.hoisted(() => ({ status: vi.fn(), history: vi.fn(), conversation: vi.fn(), create: vi.fn(), stream: vi.fn(), clear: vi.fn() }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock('../services/api', () => ({ apiClient: {
  getKubiStatus: mocks.status, getKubiConversations: mocks.history, getKubiConversation: mocks.conversation,
  createKubiConversation: mocks.create, streamKubiMessage: mocks.stream, clearKubiConversations: mocks.clear,
} }));
vi.mock('./KubiAvatar', () => ({ KubiAvatar: () => <span aria-hidden="true" /> }));
vi.mock('./KubiActivity', () => ({ KubiActivity: () => <output>Investigation</output> }));
vi.mock('./ProUpgradeModal', () => ({ ProUpgradeModal: () => null }));
const conversation = { id: 'persisted-conversation', title: 'Fixture history', updatedAt: '2026-10-24T10:00:00Z', messages: [] };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.status.mockResolvedValue({ enabled: true, proActive: true, providerConfigured: true });
  mocks.history.mockResolvedValue([conversation]);
  mocks.create.mockResolvedValue(conversation);
  mocks.conversation.mockResolvedValue({ ...conversation, messages: [{ id: 'answer', role: 'assistant', content: 'Completed fixture', createdAt: '' }] });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 0; });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function openPanel() {
  const view = render(<KubiPanel />);
  await act(async () => { await Promise.resolve(); });
  fireEvent.click(view.getByRole('button', { name: 'Ask kubi' }));
  return view;
}

describe('kubi panel completion and history', () => {
  it('loads history, selects the persisted conversation and focuses the composer', async () => {
    const view = await openPanel();
    expect(document.activeElement).toBe(view.getByRole('textbox', { name: 'Ask kubi' }));
    fireEvent.click(view.getByRole('button', { name: 'kubi conversation history' }));
    fireEvent.click(await view.findByRole('button', { name: /Fixture history/ }));
    await waitFor(() => expect(mocks.conversation).toHaveBeenCalledWith('persisted-conversation'));
    expect(await view.findByText('Completed fixture')).toBeTruthy();
  });

  it('awaits stream completion, reloads persisted messages and enables follow-up questions', async () => {
    mocks.stream.mockImplementation(async (_id, _question, onEvent) => {
      await onEvent('answer_delta', { text: 'Draft fixture' });
      await onEvent('done', {});
    });
    const view = await openPanel();
    fireEvent.change(view.getByRole('textbox', { name: 'Ask kubi' }), { target: { value: 'Fixture question' } });
    fireEvent.click(view.getByRole('button', { name: 'Send kubi question' }));
    expect(await view.findByText('Completed fixture')).toBeTruthy();
    expect(view.queryByText('Draft fixture')).toBeNull();
    expect(mocks.create).toHaveBeenCalledWith('Fixture question');
    fireEvent.change(view.getByRole('textbox', { name: 'Ask kubi' }), { target: { value: 'Follow-up' } });
    expect((view.getByRole('button', { name: 'Send kubi question' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('restores the question after a failed completion reload and clears busy state', async () => {
    mocks.conversation.mockRejectedValue(new Error('Fixture reload failure'));
    mocks.stream.mockImplementation(async (_id, _question, onEvent) => { await onEvent('done', {}); });
    const view = await openPanel();
    fireEvent.change(view.getByRole('textbox', { name: 'Ask kubi' }), { target: { value: 'Retry me' } });
    fireEvent.click(view.getByRole('button', { name: 'Send kubi question' }));
    expect(await view.findByRole('alert')).toHaveProperty('textContent', 'kubi could not reach the server. Check your connection and try again.');
    expect((view.getByRole('textbox', { name: 'Ask kubi' }) as HTMLTextAreaElement).value).toBe('Retry me');
    expect((view.getByRole('button', { name: 'Send kubi question' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('announces history loading and distinguishes empty history from an unavailable history', async () => {
    let finish: (value: unknown[]) => void = () => undefined;
    mocks.history.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const view = await openPanel();
    fireEvent.click(view.getByRole('button', { name: 'kubi conversation history' }));
    expect(await view.findByRole('status')).toHaveProperty('textContent', 'Loading conversations…');
    await act(async () => { finish([]); });
    expect(view.getByText('Your conversations will appear here.')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'kubi conversation history' }));
    mocks.history.mockRejectedValue(new Error('Fixture history failure'));
    fireEvent.click(view.getByRole('button', { name: 'kubi conversation history' }));
    expect(await view.findByRole('alert')).toHaveProperty('textContent', 'Could not load history. Close and reopen it to retry.');
    expect(view.queryByText('Your conversations will appear here.')).toBeNull();
  });

  it('requires confirmation before clearing history and resets the current conversation', async () => {
    mocks.clear.mockResolvedValue(undefined);
    const view = await openPanel();
    fireEvent.click(view.getByRole('button', { name: 'kubi conversation history' }));
    await view.findByRole('button', { name: /Fixture history/ });
    fireEvent.click(view.getByRole('button', { name: 'Clear kubi history' }));
    expect(mocks.clear).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole('button', { name: 'Cancel' }));
    expect(mocks.clear).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole('button', { name: 'Clear kubi history' }));
    fireEvent.click(view.getByRole('button', { name: 'Delete history' }));
    await waitFor(() => expect(mocks.clear).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(view.queryByText('Delete all your kubi conversations? This cannot be undone.')).toBeNull());
    expect(view.getByRole('button', { name: 'New kubi conversation' })).toBeTruthy();
  });

  it('reports a stream that ends without a terminal event and permits retry', async () => {
    mocks.stream.mockResolvedValue(undefined);
    const view = await openPanel();
    fireEvent.change(view.getByRole('textbox', { name: 'Ask kubi' }), { target: { value: 'Incomplete fixture' } });
    fireEvent.keyDown(view.getByRole('textbox', { name: 'Ask kubi' }), { key: 'Enter' });
    expect(await view.findByRole('alert')).toBeTruthy();
    expect((view.getByRole('textbox', { name: 'Ask kubi' }) as HTMLTextAreaElement).value).toBe('Incomplete fixture');
    expect((view.getByRole('button', { name: 'Send kubi question' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps clarification choices available only on the latest message', async () => {
    mocks.conversation.mockResolvedValue({ ...conversation, messages: [
      { id: 'old', role: 'assistant', content: 'Earlier question', clarification: { options: ['Old choice'] } },
      { id: 'new', role: 'assistant', content: 'Latest question', clarification: { options: ['Current choice'] } },
    ] });
    const view = await openPanel();
    fireEvent.click(view.getByRole('button', { name: 'kubi conversation history' }));
    fireEvent.click(await view.findByRole('button', { name: /Fixture history/ }));
    await view.findByText('Latest question');
    expect(view.getAllByRole('group', { name: 'Clarification choices' })).toHaveLength(2);
    expect((view.getByRole('button', { name: 'Old choice' }) as HTMLButtonElement).disabled).toBe(true);
    expect((view.getByRole('button', { name: 'Current choice' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
