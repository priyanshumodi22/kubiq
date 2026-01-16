import { IServiceRepository } from './interfaces/IServiceRepository';
import { INotificationRepository } from './interfaces/INotificationRepository';
import { IUserRepository } from './interfaces/IUserRepository';
import { JsonServiceRepository } from './adapters/json/JsonServiceRepository';
import { MysqlServiceRepository } from './adapters/mysql/MysqlServiceRepository';
import { MongoServiceRepository } from './adapters/mongo/MongoServiceRepository';
import { JsonNotificationRepository } from './adapters/json/JsonNotificationRepository';
import { MysqlNotificationRepository } from './adapters/mysql/MysqlNotificationRepository';
import { MongoNotificationRepository } from './adapters/mongo/MongoNotificationRepository';
import { JsonUserRepository } from './adapters/json/JsonUserRepository';
import { MysqlUserRepository } from './adapters/mysql/MysqlUserRepository';
import { MongoUserRepository } from './adapters/mongo/MongoUserRepository';

import { IPasskeyRepository } from './interfaces/IPasskeyRepository';
import { JsonPasskeyRepository } from './adapters/json/JsonPasskeyRepository';
import { MongoPasskeyRepository } from './adapters/mongo/MongoPasskeyRepository';
import { MysqlPasskeyRepository } from './adapters/mysql/MysqlPasskeyRepository';

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
        this.serviceRepository = new MysqlServiceRepository();
        break;
      case 'mongo':
      case 'mongodb':
        this.serviceRepository = new MongoServiceRepository();
        break;
      case 'json':
      default:
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
        this.notificationRepository = new MysqlNotificationRepository();
        break;
      case 'mongo':
      case 'mongodb':
        this.notificationRepository = new MongoNotificationRepository();
        break;
      case 'json':
      default:
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
        this.userRepository = new MysqlUserRepository();
        break;
      case 'mongo':
      case 'mongodb':
        this.userRepository = new MongoUserRepository();
        break;
      case 'json':
      default:
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
        this.passkeyRepository = new MysqlPasskeyRepository();
        break;
      case 'mongo':
      case 'mongodb':
        this.passkeyRepository = new MongoPasskeyRepository();
        break;
      case 'json':
      default:
        this.passkeyRepository = new JsonPasskeyRepository();
        break;
    }
    
    await this.passkeyRepository.initialize();
    return this.passkeyRepository;
  }
}
