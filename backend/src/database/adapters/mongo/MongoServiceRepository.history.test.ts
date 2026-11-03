import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { MongoServiceRepository } from './MongoServiceRepository';
import { ServiceModel } from '../../schemas/ServiceSchema';
import { HealthCheck } from '../../../types';

jest.mock('../../schemas/ServiceSchema', () => ({ ServiceModel: { findOne: jest.fn(), updateOne: jest.fn(), find: jest.fn() } }));
const check = (index: number): HealthCheck => ({ timestamp: Date.UTC(2026, 10, 1) + index * 60000, status: 200, success: true, responseTime: index });
beforeEach(() => { jest.clearAllMocks(); });

describe('recent MongoDB service history', () => {
  it.each(['ascending', 'descending', 'mixed'])('returns latest checks chronologically for %s legacy storage', async order => {
    const history = Array.from({ length: 80 }, (_, index) => check(index));
    if (order === 'descending') history.reverse();
    if (order === 'mixed') history.push(...history.splice(0, 40));
    jest.mocked(ServiceModel.findOne).mockReturnValue({ lean: async () => ({ history }) } as never);
    const repository = new MongoServiceRepository();
    expect((await repository.getServiceHistory('fixture', 10)).map(item => item.responseTime)).toEqual([70,71,72,73,74,75,76,77,78,79]);
  });

  it('retains newly arriving checks when the history cap is full', async () => {
    let history = Array.from({ length: 100 }, (_, index) => check(index)).reverse();
    jest.mocked(ServiceModel.updateOne).mockImplementation((...args: unknown[]) => {
      const update = args[1] as { $push: { history: { $each: HealthCheck[]; $sort: { timestamp: number }; $slice: number } } };
      const push = update.$push.history;
      history = [...history, ...push.$each].sort((a, b) => (a.timestamp - b.timestamp) * push.$sort.timestamp).slice(push.$slice);
      return Promise.resolve({}) as never;
    });
    jest.mocked(ServiceModel.findOne).mockReturnValue({ lean: async () => ({ history }) } as never);
    const repository = new MongoServiceRepository();
    await repository.saveCheckResult('fixture', check(100));
    expect(history).toHaveLength(100);
    const recent = await repository.getServiceHistory('fixture', 10);
    expect(recent[recent.length - 1]?.responseTime).toBe(100);
    expect(history[0].responseTime).toBe(1);
  });

  it('maps the latest retained check consistently for service cards', async () => {
    jest.mocked(ServiceModel.find).mockReturnValue({ lean: async () => [{ _id: 'fixture', history: [check(3), check(1), check(2)] }] } as never);
    const [service] = await new MongoServiceRepository().getAllServices();
    expect(service.lastCheck?.responseTime).toBe(3);
    expect(service.history.map(item => item.responseTime)).toEqual([1,2,3]);
  });
});
