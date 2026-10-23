import axios from 'axios';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { NotificationManager } from './NotificationManager';

const manager = NotificationManager.getInstance();
beforeEach(async () => {
  for (const channel of manager.getChannels()) await manager.deleteChannel(channel.id);
  manager.clearHistory();
  manager.setMaintenanceConfig({ maintenanceMode: false, mutedNamespaces: [], mutedServices: [] });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
const add = (url = 'https://hooks.example.test') => manager.addChannel({ name: 'Operations', type: 'webhook', enabled: true, events: { up: true, down: true }, config: { webhookUrl: url } });

describe('notification identities and delivery lifecycle', () => {
  test.each([
    ['ERROR and warning', 'unhealthy', 'error', 'trigger'],
    ['Deployment degraded', 'warning', 'warning', 'resolve'],
    ['Warning threshold', 'warning', 'warning', 'resolve'],
    ['Deployment complete', 'info', 'info', 'resolve'],
  ])('preserves classification and PagerDuty mapping for %s', async (title, status, severity, action) => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ status: 200 });
    await add('https://events.pagerduty.example.test');
    await manager.notifyCustomAlert(title, 'State: Example');
    expect(manager.getHistory()[0].status).toBe(status);
    expect(post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ payload: expect.objectContaining({ severity }), event_action: action }), expect.any(Object));
  });

  test('same-millisecond channels and history entries have independent opaque identities', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(100);
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ status: 200 });
    const first = await add();
    const second = await add();
    expect(first.id).not.toBe(second.id);
    await manager.sendTest(first.id);
    await manager.sendTest(second.id);
    const history = manager.getHistory();
    expect(history).toHaveLength(2);
    expect(new Set(history.map(entry => entry.id)).size).toBe(2);
    expect(history.every(entry => entry.delivered)).toBe(true);
    expect(post).toHaveBeenCalledTimes(2);
    await manager.updateChannel(first.id, { name: 'Renamed' });
    expect(manager.getChannel(first.id)?.id).toBe(first.id);
  });
  test('maintenance suppression records history without sending traffic', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ status: 200 });
    await add();
    manager.setMaintenanceConfig({ maintenanceMode: true });
    await manager.notifyStatusChange('api', 'unhealthy');
    expect(post).not.toHaveBeenCalled();
    expect(manager.getHistory()[0]).toEqual(expect.objectContaining({ delivered: false, error: 'Suppressed by Maintenance Silence Mode', target: 'api' }));
  });
  test('delivery failure retries three times and produces a failed-history record', async () => {
    jest.useFakeTimers();
    const post = jest.spyOn(axios, 'post').mockRejectedValue(new Error('offline'));
    const channel = await add();
    const delivery = manager.sendTest(channel.id);
    await jest.advanceTimersByTimeAsync(3000);
    await delivery;
    expect(post).toHaveBeenCalledTimes(3);
    expect(manager.getHistory()[0]).toEqual(expect.objectContaining({ delivered: false, error: 'offline' }));
  });
  test('Teams schema URI is metadata while transport targets the configured HTTPS webhook', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ status: 200 });
    const channel = await add('https://teams.example.test/webhook');
    await manager.sendTest(channel.id);
    expect(post).toHaveBeenCalledWith('https://teams.example.test/webhook', expect.objectContaining({ '@context': 'http://schema.org/extensions' }), expect.any(Object));
  });
  test('removes the same emoji ranges without changing ordinary title or detail text', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ status: 200 });
    await add();
    await manager.notifyCustomAlert('🚀 Deployment degraded', '⚠ State: Not ready\nTarget: apps/api');
    expect(post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ title: 'Deployment degraded', fields: expect.arrayContaining([expect.objectContaining({ name: 'State', value: 'Not ready' })]) }), expect.any(Object));
  });
});
