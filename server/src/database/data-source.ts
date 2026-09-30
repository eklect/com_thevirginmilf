// Loaded here rather than via `node -r dotenv/config`, because the TypeORM CLI
// wrapper (`typeorm-ts-node-commonjs`) parses its own arguments and rejects
// node flags. The CLI is the only consumer of this file, so it has to bring its
// own configuration.
import 'dotenv/config';
import { DataSource } from 'typeorm';

/**
 * DataSource for the TypeORM **CLI only** — `migration:generate`,
 * `migration:run`, `migration:revert`, `schema:log`.
 *
 * The running application does NOT use this file — it builds its options
 * through `buildTypeOrmOptions` in `typeorm.options.ts`. The two read the same
 * environment variables; keep them in step.
 *
 * Migrations are how the schema is created, in every environment. The seed
 * lives in a migration too, so a fresh database comes up with the page
 * toggles, the channels and the starter copy already there.
 */
export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.MYSQL_HOST ?? '127.0.0.1',
  port: Number(process.env.MYSQL_PORT ?? '3306'),
  username: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  // Must match `typeorm.options.ts` — see the note there.
  timezone: 'Z',
  // Globs, not imports: the CLI runs against TypeScript sources via ts-node,
  // and every entity should be picked up without a central list to update.
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});

// Deliberately no default export: the TypeORM CLI refuses a data-source file
// that exports more than one DataSource, and a named export plus a default
// export of the same instance counts as two.
