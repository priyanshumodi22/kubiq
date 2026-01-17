import { IServiceRepository } from './interfaces/IServiceRepository';
import { INotificationRepository } from './interfaces/INotificationRepository';
import { IUserRepository } from './interfaces/IUserRepository';
import { IPasskeyRepository } from './interfaces/IPasskeyRepository';

export class DatabaseFactory {
  private static serviceRepository: IServiceRepository;
  private static notificationRepository: INotificationRepository;
  private static userRepository: IUserRepository; 
  private static passkeyRepository: IPasskeyRepository; 

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
}
