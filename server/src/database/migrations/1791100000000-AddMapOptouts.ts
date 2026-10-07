import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `map_optouts` — the people who removed this venture in MAP's portal, as
 * mirrored from `GET /api/service/applications/me/opt-outs` every five
 * minutes. See `src/map-optouts/map-optout.entity.ts`. `user_id` is MAP's
 * `sub`; nothing here is a foreign key, because MAP owns users.
 *
 * No change to `outbound_emails` or `outbound_pushes`: both already carry
 * `user_id`, and `status` is a varchar, so the new `skipped` status needs no
 * schema.
 */
export class AddMapOptouts1791100000000 implements MigrationInterface {
  name = 'AddMapOptouts1791100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`map_optouts\` (` +
        `\`user_id\` varchar(64) NOT NULL, ` +
        `\`opted_out_at\` datetime(6) NOT NULL, ` +
        `\`synced_at\` datetime(6) NOT NULL, ` +
        `PRIMARY KEY (\`user_id\`)` +
        `) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`map_optouts\``);
  }
}
