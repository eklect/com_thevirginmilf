import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `map_optouts.removed` — which mirrored opt-outs are App Directory REMOVALS
 * (the feed's `removed` list) rather than brand unsubscribes. A removal stops
 * mail and push; an unsubscribe stops opt-out-able email only, so the push
 * vetoes read `removed = 1` and the mail vetoes read every row.
 *
 * Rows already in the table are marked removed: that is how they were treated
 * until now (every row vetoed push), and the next sync — one runs at boot —
 * sets each row's real flag from the feed.
 */
export class MapOptoutsRemoved1791300000000 implements MigrationInterface {
  name = 'MapOptoutsRemoved1791300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `map_optouts` ADD `removed` tinyint(1) NOT NULL DEFAULT 0',
    );
    await queryRunner.query('UPDATE `map_optouts` SET `removed` = 1');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `map_optouts` DROP COLUMN `removed`');
  }
}
