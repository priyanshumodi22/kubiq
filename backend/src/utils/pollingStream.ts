import type { EventEmitter } from 'node:events';

type StreamResponse = {
  write: (data: string) => boolean;
  end: () => void;
  readonly writableEnded: boolean;
  readonly destroyed: boolean;
};

/** One in-flight snapshot per client; cancellation never writes a late result. */
export function startPollingStream(request: EventEmitter, response: StreamResponse, snapshot: () => Promise<string>, intervalMs = 5000) {
  let closed = false;
  let pending = false;
  const stop = () => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    request.removeListener('close', stop);
    if (!response.writableEnded && !response.destroyed) response.end();
  };
  const poll = async () => {
    if (closed || pending) return;
    pending = true;
    try {
      const data = await snapshot();
      if (!closed && !response.writableEnded && !response.destroyed) response.write(data);
    } catch (error) {
      console.warn('Service event stream snapshot failed; closing the client stream.', error);
      stop();
    } finally {
      pending = false;
    }
  };
  const timer = setInterval(() => { void poll(); }, intervalMs);
  request.once('close', stop);
  void poll();
  return stop;
}
