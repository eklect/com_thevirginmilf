import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Calendar export: each signed-in visitor's private subscription to the
 * stream calendar (`calendar_feed_tokens`, the secret kept as SHA-256). The
 * cap on how much may leave is the `calendar_export_cap` row in
 * `site_settings`, Full details when absent, so nothing is seeded.
 */
export class CalendarExport1791700000000 implements MigrationInterface {
  name = 'CalendarExport1791700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE `calendar_feed_tokens` (' +
        '`id` char(36) NOT NULL, ' +
        '`owner_user_id` varchar(64) NOT NULL, ' +
        '`name` varchar(80) NOT NULL, ' +
        '`level` varchar(8) NOT NULL, ' +
        '`token_hash` char(64) NOT NULL, ' +
        '`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`last_fetched_at` datetime NULL, ' +
        '`revoked_at` datetime NULL, ' +
        'UNIQUE INDEX `ux_calendar_feed_tokens_hash` (`token_hash`), ' +
        'INDEX `ix_calendar_feed_tokens_owner` (`owner_user_id`), ' +
        'PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `calendar_feed_tokens`');
  }
}
