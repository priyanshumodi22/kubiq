import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    })),
  },
}));

let apiClient: typeof import('./api').apiClient;

beforeAll(async () => {
  vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } });
  ({ apiClient } = await import('./api'));
});

describe('kubi SSE client', () => {
  it('awaits asynchronous completion and propagates handler failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('event: done\ndata: {}\n\n')));
    await expect(apiClient.streamKubiMessage('c-1', 'test', async () => {
      await Promise.resolve();
      throw new Error('history reload failed');
    })).rejects.toThrow('history reload failed');
  });
  it('parses incremental answer, evidence, and completion events', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: answer_delta\ndata: {"text":"Healthy "}\n\n'));
        controller.enqueue(encoder.encode('event: evidence\ndata: {"type":"service","label":"Service health"}\n\nevent: done\ndata: {"conversationId":"c-1"}\n\n'));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    apiClient.setToken('test-token');
    const events: Array<{ event: string; data: any }> = [];

    await apiClient.streamKubiMessage('c-1', 'Which services are unhealthy?', (event, data) => events.push({ event, data }));

    expect(events).toEqual([
      { event: 'answer_delta', data: { text: 'Healthy ' } },
      { event: 'evidence', data: { type: 'service', label: 'Service health' } },
      { event: 'done', data: { conversationId: 'c-1' } },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/kubi/conversations/c-1/messages'), expect.objectContaining({ method: 'POST' }));
  });
});
