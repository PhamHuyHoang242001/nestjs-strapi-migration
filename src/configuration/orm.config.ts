import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import * as path from 'path';
import { DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME } from './env.config';

// process.cwd() is always the project root regardless of where the compiled file lives.
// __dirname-based paths are unreliable because NestJS CLI outputs to dist/src/ (not dist/).
const projectRoot = process.cwd();

// Under ts-jest the app runs from TS sources, so the DataSource must load the same TS entity
// classes the repositories reference (loading dist/*.js would give a different class object and
// TypeORM would report "No metadata"). Prod/dev (no JEST_WORKER_ID) keep loading compiled dist.
const isJestRuntime = !!process.env.JEST_WORKER_ID;
const srcGlobs = {
  entities: [path.join(projectRoot, 'src', '**', '*.entity.ts')],
  migrations: [path.join(projectRoot, 'src', 'migration', '**', '*.ts')],
  subscribers: [path.join(projectRoot, 'src', 'subscriber', '**', '*.ts')],
};
const distGlobs = {
  // Use dist/src/ to only pick up entities compiled from the current src/ tree.
  // dist/ may also contain stale or migrated entities from other build passes.
  entities: [path.join(projectRoot, 'dist', 'src', '**', '*.entity.js')],
  migrations: [path.join(projectRoot, 'dist', 'src', 'migration', '**', '*.js')],
  subscribers: [path.join(projectRoot, 'dist', 'src', 'subscriber', '**', '*.js')],
};
const globs = isJestRuntime ? srcGlobs : distGlobs;

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const ormConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  host: DB_HOST,
  port: DB_PORT,
  username: DB_USERNAME,
  password: DB_PASSWORD,
  database: DB_NAME,
  synchronize: !['production', 'prod'].includes(process.env.NODE_ENV ?? ''),
  logging: false,
  entities: globs.entities,
  migrations: globs.migrations,
  subscribers: globs.subscribers,
} as any;

export default ormConfig;
