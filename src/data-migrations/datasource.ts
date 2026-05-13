import { NODE_ENV } from '@configuration/env.config';
import { DataSourceOptions } from 'typeorm';

const ssl =
  NODE_ENV !== 'production' && NODE_ENV !== 'localhost'
    ? {
        ssl: {
          rejectUnauthorized: false,
        },
      }
    : {};

export const getOrmConfig = (data: {
  host: string;
  port: number;
  username: string;
  password: string;
  db_name: string;
}): DataSourceOptions => {
  const { host, port, username, password, db_name } = data;
  return {
    type: 'postgres',
    host,
    port,
    username,
    password,
    database: db_name,
    synchronize: false,
    ...ssl,
    logging: false,
    entities: [],
    migrations: [],
    subscribers: [],
  };
};
