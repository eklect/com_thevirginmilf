import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The image library is now read a page at a time, newest first, so the order
 * it pages by gets an index: `(created_at, id)` is both the sort and the
 * keyset cursor.
 */
export class AddUploadsCreatedIndex1794300000000 implements MigrationInterface {
  name = 'AddUploadsCreatedIndex1794300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX `ix_uploads_created` ON `uploads` (`created_at`, `id`)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX `ix_uploads_created` ON `uploads`');
  }
}
