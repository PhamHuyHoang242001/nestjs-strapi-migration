import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import * as path from 'path';
import { DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME } from './env.config';
const rootDir = path.join(__dirname, '..', '..');

const ormConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  host: DB_HOST,
  port: DB_PORT,
  username: DB_USERNAME,
  password: DB_PASSWORD,
  database: DB_NAME,
  synchronize: ['production', 'prod'].includes(process.env.NODE_ENV) ? false : true,
  logging: false,
  entities: [rootDir + '/dist/**/*.entity.js'],
  migrations: [rootDir + '/dist/migration/**/*.js'],
  subscribers: [rootDir + '/dist/subscriber/**/*.js'],

  cli: {
    entitiesDir: '**/*.entity{.ts,.js}',
    migrationsDir: ['src/migration'],
    subscribersDir: 'subscriber',
  },
} as any;

export default ormConfig;
