import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The site no longer has a Privacy page of its own. The Mucci & Co Privacy
 * Policy and Terms of Service are one set for every venture, served from the
 * corporate site, and the footer links there; `/privacy` here redirects.
 *
 * So the two settings that held the local page's text and the page toggle
 * row go. The seed migration that wrote them is left as it was — migrations
 * run once, and editing a migration that has already run changes nothing.
 * `down` recreates the toggle row only; the text is not worth keeping.
 */
export class RemovePrivacyPage1791200000000 implements MigrationInterface {
  name = 'RemovePrivacyPage1791200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM \`site_settings\` WHERE \`key\` IN ('privacy_body', 'privacy_updated')`,
    );
    await queryRunner.query(`DELETE FROM \`page_settings\` WHERE \`key\` = 'privacy'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT IGNORE INTO \`page_settings\` (\`key\`, \`enabled\`, \`nav_label\`, \`sort_order\`, \`parent_key\`) ` +
        `VALUES ('privacy', 1, 'Privacy', 6, NULL)`,
    );
  }
}
