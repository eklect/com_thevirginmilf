import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * About copy, 2026-10-01: with three readings of MILF now, "either one" no
 * longer agrees. Built from the live text.
 */
export class AboutWhyMilfAgreement1790910000000 implements MigrationInterface {
  name = 'AboutWhyMilfAgreement1790910000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [from, to] of SWAPS) {
      await queryRunner.query(
        'UPDATE `site_settings` SET `value` = REPLACE(`value`, ?, ?) ' +
          "WHERE `key` = 'about_body'",
        [from, to],
      );
    }
  }

  public async down(): Promise<void> {
    // Deliberately empty.
  }
}

const SWAPS: Array<[string, string]> = [
  ['not apologizing for either one', 'not apologizing for any of them'],
];
