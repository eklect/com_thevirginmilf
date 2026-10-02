import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * About copy, 2026-10-01: the "Why MILF" section. MILF officially stands for
 * "Mom Is Living Fabulously", and her son Vin's reading, "Mom, I Like Fun!",
 * joins it. In-place swaps of the smallest passages, built from the live text,
 * so any other admin edit to the body survives.
 */
export class AboutWhyMilf1790900000000 implements MigrationInterface {
  name = 'AboutWhyMilf1790900000000';

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
  [
    'Officially it stands for **Mom is Living Fantastically**.',
    'Officially it stands for **Mom Is Living Fabulously**.\n\n' +
      'Her son, Vin, came up with the other one: it also stands for **Mom, I Like Fun!**',
  ],
  ['Both readings are correct', 'Every reading is correct'],
];
