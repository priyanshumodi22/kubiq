import { IServiceRepository } from './interfaces/IServiceRepository';
import { INotificationRepository } from './interfaces/INotificationRepository';
import { IUserRepository } from './interfaces/IUserRepository';
import { IPasskeyRepository } from './interfaces/IPasskeyRepository';
import { ISystemRepository } from './interfaces/ISystemRepository';
import { ITraceRepository } from './interfaces/ITraceRepository';

export class DatabaseFactory {
  private static serviceRepository: IServiceRepository;
  private static notificationRepository: INotificationRepository;
  private static userRepository: IUserRepository;
  private static passkeyRepository: IPasskeyRepository;
  private static systemRepository: ISystemRepository;
  private static traceRepository: ITraceRepository;

  public static async getServiceRepository(): Promise<IServiceRepository> {
    if (this.serviceRepository) {
      return this.serviceRepository;
    }

    const startArgs = process.env.DB_TYPE || 'json';
    console.log(`🔌 Initializing Database Adapter: ${startArgs}`);

    switch (startArgs.toLowerCase()) {
      case 'mysql':
      case 'mariadb':
        const { MysqlServiceRepository } = await import('./adapters/mysql/MysqlServiceRepository');
        this.serviceRepository = new MysqlServiceRepository();
        break;
      case 'mongo':
      case 'mongodb':
        const { MongoServiceRepository } = await import('./adapters/mongo/MongoServiceRepository');
        this.serviceRepository = new MongoServiceRepository();
        break;
      case 'json':
      default:
        const { JsonServiceRepository } = await import('./adapters/json/JsonServiceRepository');
        this.serviceRepository = new JsonServiceRepository();
        break;
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
      case 'mariadb':
        const { MysqlNotificationRepository } = await import('./adapters/mysql/MysqlNotificationRepository');
        this.notificationRepository = new MysqlNotificationRepository();
        break;
      case 'mongo':
      case 'mongodb':
        const { MongoNotificationRepository } = await import('./adapters/mongo/MongoNotificationRepository');
        this.notificationRepository = new MongoNotificationRepository();
        break;
      case 'json':
      default:
        const { JsonNotificationRepository } = await import('./adapters/json/JsonNotificationRepository');
        this.notificationRepository = new JsonNotificationRepository();
        break;
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
      case 'mariadb':
        const { MysqlUserRepository } = await import('./adapters/mysql/MysqlUserRepository');
        this.userRepository = new MysqlUserRepository();
        break;
      case 'mongo':
      case 'mongodb':
        const { MongoUserRepository } = await import('./adapters/mongo/MongoUserRepository');
        this.userRepository = new MongoUserRepository();
        break;
      case 'json':
      default:
        const { JsonUserRepository } = await import('./adapters/json/JsonUserRepository');
        this.userRepository = new JsonUserRepository();
        break;
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
      case 'mariadb':
        const { MysqlPasskeyRepository } = await import('./adapters/mysql/MysqlPasskeyRepository');
        this.passkeyRepository = new MysqlPasskeyRepository();
        break;
      case 'mongo':
      case 'mongodb':
        const { MongoPasskeyRepository } = await import('./adapters/mongo/MongoPasskeyRepository');
        this.passkeyRepository = new MongoPasskeyRepository();
        break;
      case 'json':
      default:
        const { JsonPasskeyRepository } = await import('./adapters/json/JsonPasskeyRepository');
        this.passkeyRepository = new JsonPasskeyRepository();
        break;
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
      case 'mariadb':
        const { MysqlSystemRepository } = await import('./adapters/mysql/MysqlSystemRepository');
        this.systemRepository = new MysqlSystemRepository();
        break;
      case 'mongo':
      case 'mongodb':
        const { MongoSystemRepository } = await import('./adapters/mongo/MongoSystemRepository');
        this.systemRepository = new MongoSystemRepository();
        break;
      case 'json':
      default:
        const { JsonSystemRepository } = await import('./adapters/json/JsonSystemRepository');
        this.systemRepository = new JsonSystemRepository();
        break;
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

    switch (startArgs.toLowerCase()) {
      case 'mysql':
      case 'mariadb':
        const { MysqlTraceRepository } = await import('./adapters/mysql/MysqlTraceRepository');
        this.traceRepository = new MysqlTraceRepository();
        break;
      case 'mongo':
      case 'mongodb':
        const { MongoTraceRepository } = await import('./adapters/mongo/MongoTraceRepository');
        this.traceRepository = new MongoTraceRepository();
        break;
      case 'json':
      default:
        // Fallback to MySQL or Mongo if json not specifically handled for APM
        console.warn('⚠️ APM telemetry requires a robust database. Falling back to MongoDB for APM.');
        const { MongoTraceRepository: FallbackMongoTraceRepository } = await import('./adapters/mongo/MongoTraceRepository');
        this.traceRepository = new FallbackMongoTraceRepository();
        break;
    }

    await this.traceRepository.initialize();
    return this.traceRepository;
  }
}
