import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

/**
 * MySQL, and only MySQL — the platform's one database. Schema changes go
 * through migrations, which run on boot; `synchronize` is never used, because
 * the previous incarnation of this server relied on it and shipped a schema
 * nobody had reviewed.
 */
export function buildTypeOrmOptions(config: ConfigService): TypeOrmModuleOptions {
  const verbose = config.get<string>('DB_LOGGING') === 'true';
  return {
    type: 'mysql',
    host: config.get<string>('MYSQL_HOST', '127.0.0.1'),
    port: Number(config.get<string>('MYSQL_PORT', '3306')),
    username: config.get<string>('MYSQL_USER'),
    password: config.get<string>('MYSQL_PASSWORD'),
    database: config.get<string>('MYSQL_DATABASE'),
    charset: 'utf8mb4',
    // Every `datetime` is written and read as UTC, whatever zone the process
    // runs in. A stream's start time is an instant, and the reminder sweep
    // compares it to `new Date()` — a driver left on local time would shift
    // both by the container's offset the day somebody sets `TZ`.
    timezone: 'Z',
    autoLoadEntities: true,
    synchronize: false,
    migrationsRun: true,
    migrations: [`${__dirname}/migrations/*.js`],
    logging: verbose ? ['query', 'error', 'warn'] : ['error'],
  };
}
