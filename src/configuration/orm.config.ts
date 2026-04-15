import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import * as path from 'path';
import { DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME } from './env.config';

// process.cwd() is always the project root regardless of where the compiled file lives.
// __dirname-based paths are unreliable because NestJS CLI outputs to dist/src/ (not dist/).
const projectRoot = process.cwd();

const ormConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  host: DB_HOST,
  port: DB_PORT,
  username: DB_USERNAME,
  password: DB_PASSWORD,
  database: DB_NAME,
  synchronize: !['production', 'prod'].includes(process.env.NODE_ENV ?? ''),
  logging: false,
  // Use dist/src/ to only pick up entities compiled from the current src/ tree.
  // dist/ may also contain stale or migrated entities from other build passes.
  entities: [path.join(projectRoot, 'dist', 'src', '**', '*.entity.js')],
  migrations: [path.join(projectRoot, 'dist', 'src', 'migration', '**', '*.js')],
  subscribers: [path.join(projectRoot, 'dist', 'src', 'subscriber', '**', '*.js')],
} as any;

export default ormConfig;
