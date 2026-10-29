import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Every uploaded image moves to the object store (DigitalOcean Spaces in
 * production, RustFS on the dev box). Two consequences for the schema:
 *
 *   - `uploads.storage_key` holds an object key now, laid out as
 *     `uploads/<sub>/<venture>/<app>/<module>/<action>/<stem>--<id>.<ext>`,
 *     which reaches ~270 characters, so it widens from 255 to 512. Existing
 *     rows keep their old disk-relative key (`images/<id>.png`) until
 *     storage_migrate.py (muccico_devops) rewrites them; the app serves those
 *     from LEGACY_STORAGE_ROOT meanwhile.
 *   - `uploads.scope`: whether `GET /uploads/:id` may redirect to the object
 *     (`public`) or must 404 (`restricted`). Every existing image is public.
 */
export class ObjectStorage1791500000000 implements MigrationInterface {
  name = 'ObjectStorage1791500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `uploads` MODIFY `storage_key` varchar(512) NOT NULL');
    await queryRunner.query(
      "ALTER TABLE `uploads` ADD `scope` varchar(16) NOT NULL DEFAULT 'public' AFTER `storage_key`",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `uploads` DROP COLUMN `scope`');
    await queryRunner.query('ALTER TABLE `uploads` MODIFY `storage_key` varchar(255) NOT NULL');
  }
}
