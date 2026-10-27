import { instrumentMysqlRepository } from '../telemetry/mysqlQueryTracing';
import { databaseDetailsEnabled } from '../telemetry/databaseSpan';
import { mysqlTraceContext } from './mysqlTraceContext';
import { mongoTraceContext } from './mongoTraceContext';
import { traceDependency } from 'kubiq-apm/runtime';
import { traceRepository } from './traceRepository';
import { IServiceRepository } from './interfaces/IServiceRepository';
import { INotificationRepository } from './interfaces/INotificationRepository';
import { IUserRepository } from './interfaces/IUserRepository';
import { IPasskeyRepository } from './interfaces/IPasskeyRepository';
import { ISystemRepository } from './interfaces/ISystemRepository';
import { ITraceRepository } from './interfaces/ITraceRepository';
import { ILogRepository } from './interfaces/ILogRepository';
import { IAuditLogRepository } from './interfaces/IAuditLogRepository';
import { IKubiConversationRepository } from './interfaces/IKubiConversationRepository';
import { clickhouseService } from '../services/ClickhouseService';

export class DatabaseFactory {
  private static traced<T extends object>(repository: T, collection: string): T {
    return process.env.KUBIQ_TRACING_ENABLED === 'true' ? traceRepository(repository, collection, traceDependency, operation => mongoTraceContext(collection, operation)) : repository;
  }

  private static tracedMysql<T extends object>(repository: T, collection: string): T {
    const system = process.env.DB_TYPE?.toLowerCase() === 'mariadb' ? 'mariadb' : 'mysql';
    if (databaseDetailsEnabled()) instrumentMysqlRepository(repository, () => ({ ...mysqlTraceContext(repository, collection, 'query', system), 'db.system': system }));
    return process.env.KUBIQ_TRACING_ENABLED === 'true' ? traceRepository(repository, collection, traceDependency, operation => mysqlTraceContext(repository, collection, operation, system), system) : repository;
  }

  private static serviceRepository: IServiceRepository;
  private static notificationRepository: INotificationRepository;
  private static userRepository: IUserRepository;
  private static passkeyRepository: IPasskeyRepository;
  private static systemRepository: ISystemRepository;
  private static traceRepository: ITraceRepository;
  private static logRepository: ILogRepository;
  private static auditLogRepository: IAuditLogRepository;
  private static auditLogRepoPromise: Promise<IAuditLogRepository> | null = null;
  private static kubiConversationRepository: IKubiConversationRepository;
  private static kubiConversationRepoPromise: Promise<IKubiConversationRepository> | null = null;

  // False when DB_TYPE=json — APM requires MySQL or MongoDB
  private static _apmSupported: boolean | null = null;

  /** Returns true only when DB_TYPE is mysql or mongodb. */
  public static isApmSupported(): boolean {
    if (this._apmSupported === null) {
      const db = (process.env.DB_TYPE || 'json').toLowerCase();
      this._apmSupported = db === 'mysql' || db === 'mariadb' || db === 'mongo' || db === 'mongodb';
    }
    return this._apmSupported;
  }

  public static async getServiceRepository(): Promise<IServiceRepository> {
    if (this.serviceRepository) {
      return this.serviceRepository;
    }

    const startArgs = process.env.DB_TYPE || 'json';
    console.log(`🔌 Initializing Database Adapter: ${startArgs}`);

    switch (startArgs.toLowerCase()) {
      case 'mysql':
      case 'mariadb': {
        const { MysqlServiceRepository } = await import('./adapters/mysql/MysqlServiceRepository');
        this.serviceRepository = this.tracedMysql(new MysqlServiceRepository(), 'services');
        break;
      }
      case 'mongo':
      case 'mongodb': {
        const { MongoServiceRepository } = await import('./adapters/mongo/MongoServiceRepository');
        this.serviceRepository = this.traced(new MongoServiceRepository(), 'services');
        break;
      }
      case 'json':
      default: {
        const { JsonServiceRepository } = await import('./adapters/json/JsonServiceRepository');
        this.serviceRepository = new JsonServiceRepository();
        break;
      }
    }

    await this.serviceRepository.initialize();
    return this.serviceRepository;
  }

  public static async getNotificationRepository(): Promise<INotificationRepository> {
    if (this.notificationRepository) {
      return this.notificationRepository;
    }

    const startArgs = process.env.DB_TYPE || 'json';
    console.log(`🔌 Initializing Notification Adapter: ${startArgs}`);

    switch (startArgs.toLowerCase()) {
      case 'mysql':
      case 'mariadb': {
        const { MysqlNotificationRepository } = await import('./adapters/mysql/MysqlNotificationRepository');
        this.notificationRepository = this.tracedMysql(new MysqlNotificationRepository(), 'notifications');
        break;
      }
      case 'mongo':
      case 'mongodb': {
        const { MongoNotificationRepository } = await import('./adapters/mongo/MongoNotificationRepository');
        this.notificationRepository = this.traced(new MongoNotificationRepository(), 'notifications');
        break;
      }
      case 'json':
      default: {
        const { JsonNotificationRepository } = await import('./adapters/json/JsonNotificationRepository');
        this.notificationRepository = new JsonNotificationRepository();
        break;
      }
    }

    await this.notificationRepository.initialize();
    return this.notificationRepository;
  }

  public static async getUserRepository(): Promise<IUserRepository> {
    if (this.userRepository) {
      return this.userRepository;
    }

    const startArgs = process.env.DB_TYPE || 'json';
    console.log(`🔌 Initializing User Repository: ${startArgs}`);

    switch (startArgs.toLowerCase()) {
      case 'mysql':
      case 'mariadb': {
        const { MysqlUserRepository } = await import('./adapters/mysql/MysqlUserRepository');
        this.userRepository = this.tracedMysql(new MysqlUserRepository(), 'users');
        break;
      }
      case 'mongo':
      case 'mongodb': {
        const { MongoUserRepository } = await import('./adapters/mongo/MongoUserRepository');
        this.userRepository = this.traced(new MongoUserRepository(), 'users');
        break;
      }
      case 'json':
      default: {
        const { JsonUserRepository } = await import('./adapters/json/JsonUserRepository');
        this.userRepository = new JsonUserRepository();
        break;
      }
    }

    await this.userRepository.initialize();
    return this.userRepository;
  }

  public static async getPasskeyRepository(): Promise<IPasskeyRepository> {
    if (this.passkeyRepository) {
      return this.passkeyRepository;
    }

    const startArgs = process.env.DB_TYPE || 'json';
    console.log(`🔌 Initializing Passkey Repository: ${startArgs}`);

    switch (startArgs.toLowerCase()) {
      case 'mysql':
      case 'mariadb': {
        const { MysqlPasskeyRepository } = await import('./adapters/mysql/MysqlPasskeyRepository');
        this.passkeyRepository = this.tracedMysql(new MysqlPasskeyRepository(), 'passkeys');
        break;
      }
      case 'mongo':
      case 'mongodb': {
        const { MongoPasskeyRepository } = await import('./adapters/mongo/MongoPasskeyRepository');
        this.passkeyRepository = this.traced(new MongoPasskeyRepository(), 'passkeys');
        break;
      }
      case 'json':
      default: {
        const { JsonPasskeyRepository } = await import('./adapters/json/JsonPasskeyRepository');
        this.passkeyRepository = new JsonPasskeyRepository();
        break;
      }
    }

    await this.passkeyRepository.initialize();
    return this.passkeyRepository;

  }

  public static async getSystemRepository(): Promise<ISystemRepository> {
    if (this.systemRepository) {
      return this.systemRepository;
    }

    const startArgs = process.env.DB_TYPE || 'json';
    console.log(`🔌 Initializing System Repository: ${startArgs}`);

    switch (startArgs.toLowerCase()) {
      case 'mysql':
      case 'mariadb': {
        const { MysqlSystemRepository } = await import('./adapters/mysql/MysqlSystemRepository');
        this.systemRepository = this.tracedMysql(new MysqlSystemRepository(), 'system');
        break;
      }
      case 'mongo':
      case 'mongodb': {
        const { MongoSystemRepository } = await import('./adapters/mongo/MongoSystemRepository');
        this.systemRepository = this.traced(new MongoSystemRepository(), 'system');
        break;
      }
      case 'json':
      default: {
        const { JsonSystemRepository } = await import('./adapters/json/JsonSystemRepository');
        this.systemRepository = new JsonSystemRepository();
        break;
      }
    }

    await this.systemRepository.initialize();
    return this.systemRepository;
  }

  public static async getTraceRepository(): Promise<ITraceRepository> {
    if (this.traceRepository) {
      return this.traceRepository;
    }

    const startArgs = process.env.DB_TYPE || 'json';
    console.log(`🔌 Initializing Trace (APM) Repository: ${startArgs}`);

    if (clickhouseService.isConfigured()) {
        const { ClickhouseTraceRepository } = await import('./adapters/clickhouse/ClickhouseTraceRepository');
        this.traceRepository = new ClickhouseTraceRepository();
        await this.traceRepository.initialize();
        return this.traceRepository;
    }

    switch (startArgs.toLowerCase()) {
      case 'mysql':
      case 'mariadb': {
        const { MysqlTraceRepository } = await import('./adapters/mysql/MysqlTraceRepository');
        this.traceRepository = this.tracedMysql(new MysqlTraceRepository(), 'traces');
        break;
      }
      case 'mongo':
      case 'mongodb': {
        const { MongoTraceRepository } = await import('./adapters/mongo/MongoTraceRepository');
        this.traceRepository = this.traced(new MongoTraceRepository(), 'traces');
        break;
      }
      case 'json':
      default:
        // APM is not supported with the JSON adapter.
        // Callers must check DatabaseFactory.isApmSupported() before calling this.
        throw new Error(
          'APM_NOT_SUPPORTED: APM & Traces require DB_TYPE=mysql or DB_TYPE=mongodb. ' +
          'Update your DB_TYPE environment variable and restart kubiq to enable APM.'
        );
    }

    await this.traceRepository.initialize();
    return this.traceRepository;
  }

  public static async getLogRepository(): Promise<ILogRepository> {
    if (this.logRepository) {
      return this.logRepository;
    }

    const startArgs = process.env.DB_TYPE || 'json';
    console.log(`🔌 Initializing Log Repository: ${startArgs}`);

    if (clickhouseService.isConfigured()) {
        const { ClickhouseLogRepository } = await import('./adapters/clickhouse/ClickhouseLogRepository');
        this.logRepository = new ClickhouseLogRepository();
        await this.logRepository.initialize();
        return this.logRepository;
    }

    switch (startArgs.toLowerCase()) {
      case 'mongo':
      case 'mongodb': {
        const { MongoLogRepository } = await import('./adapters/mongo/MongoLogRepository');
        this.logRepository = this.traced(new MongoLogRepository(), 'logs');
        break;
      }
      case 'mysql':
      case 'mariadb':
      case 'json':
      default:
        throw new Error(
          'LOG_RETENTION_NOT_SUPPORTED: Log Retention & Search require DB_TYPE=mongodb. ' +
          'Update your DB_TYPE environment variable to enable this feature.'
        );
    }

    await this.logRepository.initialize();
    return this.logRepository;
  }

  public static async getAuditLogRepository(): Promise<IAuditLogRepository> {
    if (this.auditLogRepository) {
      return this.auditLogRepository;
    }
    if (this.auditLogRepoPromise) {
      return this.auditLogRepoPromise;
    }

    this.auditLogRepoPromise = (async () => {
      const startArgs = process.env.DB_TYPE || 'json';
      console.log(`🔌 Initializing Audit Log Repository: ${startArgs}`);
      let repo: IAuditLogRepository;

      switch (startArgs.toLowerCase()) {
        case 'mysql':
        case 'mariadb': {
          const { MysqlAuditLogRepository } = await import('./adapters/mysql/MysqlAuditLogRepository');
          repo = this.tracedMysql(new MysqlAuditLogRepository(), 'audit');
          break;
        }
        case 'mongo':
        case 'mongodb': {
          const { MongoAuditLogRepository } = await import('./adapters/mongo/MongoAuditLogRepository');
          repo = this.traced(new MongoAuditLogRepository(), 'audit');
          break;
        }
        case 'json':
        default: {
          const { JsonAuditLogRepository } = await import('./adapters/json/JsonAuditLogRepository');
          repo = new JsonAuditLogRepository();
          break;
        }
      }

      await repo.initialize();
      this.auditLogRepository = repo;
      return repo;
    })();

    return this.auditLogRepoPromise;
  }

  public static async getKubiConversationRepository(): Promise<IKubiConversationRepository> {
    if (this.kubiConversationRepository) return this.kubiConversationRepository;
    if (this.kubiConversationRepoPromise) return this.kubiConversationRepoPromise;

    this.kubiConversationRepoPromise = (async () => {
      const dbType = (process.env.DB_TYPE || 'json').toLowerCase();
      let repository: IKubiConversationRepository;
      switch (dbType) {
        case 'mysql':
        case 'mariadb': {
          const { MysqlKubiConversationRepository } = await import('./adapters/mysql/MysqlKubiConversationRepository');
          repository = this.tracedMysql(new MysqlKubiConversationRepository(), 'conversations');
          break;
        }
        case 'mongo':
        case 'mongodb': {
          const { MongoKubiConversationRepository } = await import('./adapters/mongo/MongoKubiConversationRepository');
          repository = this.traced(new MongoKubiConversationRepository(), 'conversations');
          break;
        }
        default: {
          const { JsonKubiConversationRepository } = await import('./adapters/json/JsonKubiConversationRepository');
          repository = new JsonKubiConversationRepository();
        }
      }
      await repository.initialize();
      this.kubiConversationRepository = repository;
      return repository;
    })();
    return this.kubiConversationRepoPromise;
  }
}
