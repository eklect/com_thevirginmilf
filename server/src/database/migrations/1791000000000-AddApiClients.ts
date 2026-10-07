import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `api_clients` — keys this venture issues to other servers, exchanged at
 * `/service/oauth/token` for short-lived bearer tokens. See
 * `src/service-auth/api-client.entity.ts`. The secret is stored only as a
 * SHA-256; `revoked_at` is what the guard checks on every call.
 */
export class AddApiClients1791000000000 implements MigrationInterface {
  name = 'AddApiClients1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`api_clients\` (` +
        `\`id\` char(36) NOT NULL, ` +
        `\`name\` varchar(120) NOT NULL, ` +
        `\`client_id\` varchar(40) NOT NULL, ` +
        `\`secret_hash\` char(64) NOT NULL, ` +
        `\`secret_last4\` char(4) NOT NULL, ` +
        `\`scopes\` json NOT NULL, ` +
        `\`created_by\` varchar(64) NOT NULL, ` +
        `\`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ` +
        `\`last_used_at\` datetime NULL, ` +
        `\`revoked_at\` datetime NULL, ` +
        `\`revoked_by\` varchar(64) NULL, ` +
        `UNIQUE INDEX \`ux_api_clients_client_id\` (\`client_id\`), ` +
        `PRIMARY KEY (\`id\`)` +
        `) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`api_clients\``);
  }
}
