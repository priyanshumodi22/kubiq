import express from 'express';
import { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { authRouter } from './auth';

describe('Native account provisioning boundary', () => {
  const app = express();
  let server: ReturnType<typeof app.listen>;
  let origin = '';

  beforeAll(async () => {
    app.use(express.json());
    app.use('/auth', authRouter);
    server = app.listen(0);
    await new Promise<void>(resolve => server.once('listening', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  it('does not expose self-registration outside audited administrator provisioning', async () => {
    const response = await fetch(`${origin}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'crafted-user', password: 'CorrectHorseBatteryStaple!' }),
    });
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ message: expect.stringContaining('Self-registration is unavailable') }));
  });
});
