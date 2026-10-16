import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Long-form text has no length cap. The API no longer limits any prose field
 * (review bodies, game summaries and descriptions, stream and category
 * descriptions), so every column that holds one is `mediumtext` (16 MiB) —
 * past anything a request can carry — and the database never refuses what
 * the API accepted. `reviews.body` and `games.description` already were.
 *
 * `down` truncates to the old widths first, since a longer value cannot go
 * back into the narrower column.
 */
export class UncapProse1791400000000 implements MigrationInterface {
  name = 'UncapProse1791400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `categories` MODIFY `description` mediumtext NULL');
    await queryRunner.query('ALTER TABLE `games` MODIFY `summary` mediumtext NULL');
    await queryRunner.query('ALTER TABLE `stream_events` MODIFY `description` mediumtext NULL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('UPDATE `categories` SET `description` = LEFT(`description`, 500)');
    await queryRunner.query('ALTER TABLE `categories` MODIFY `description` varchar(500) NULL');
    await queryRunner.query('UPDATE `games` SET `summary` = LEFT(`summary`, 600)');
    await queryRunner.query('ALTER TABLE `games` MODIFY `summary` varchar(600) NULL');
    await queryRunner.query('ALTER TABLE `stream_events` MODIFY `description` text NULL');
  }
}
