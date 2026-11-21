import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Past videos on the Live page: `videos` (synced from Twitch and YouTube, or
 * pasted by an admin) and `video_connection`, the one row holding the sealed
 * keys the sync reads with. The row is written here with every Twitch kind
 * switched on, so the service never has to invent it.
 */
export class Videos1791800000000 implements MigrationInterface {
  name = 'Videos1791800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE `videos` (' +
        '`id` char(36) NOT NULL, ' +
        '`source` varchar(16) NOT NULL, ' +
        '`provider` varchar(16) NOT NULL, ' +
        '`kind` varchar(16) NOT NULL, ' +
        '`external_id` varchar(120) NOT NULL, ' +
        '`url` varchar(500) NOT NULL, ' +
        '`channel_id` char(36) NULL, ' +
        '`source_title` varchar(300) NOT NULL, ' +
        '`source_description` text NULL, ' +
        '`thumbnail_url` varchar(600) NULL, ' +
        '`duration_seconds` int UNSIGNED NULL, ' +
        '`published_at` datetime NOT NULL, ' +
        '`view_count` int UNSIGNED NULL, ' +
        '`gone_at` datetime NULL, ' +
        '`title` varchar(300) NULL, ' +
        '`is_hidden` tinyint NOT NULL DEFAULT 0, ' +
        '`is_pinned` tinyint NOT NULL DEFAULT 0, ' +
        '`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
        'UNIQUE INDEX `ux_videos_external` (`provider`, `external_id`), ' +
        'INDEX `ix_videos_listing` (`is_hidden`, `gone_at`, `published_at`), ' +
        'PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await queryRunner.query(
      'CREATE TABLE `video_connection` (' +
        '`id` tinyint UNSIGNED NOT NULL, ' +
        '`twitch_client_id` varchar(64) NULL, ' +
        '`twitch_client_secret_sealed` text NULL, ' +
        '`youtube_api_key_sealed` text NULL, ' +
        '`twitch_kinds` text NOT NULL, ' +
        '`last_sync_at` datetime NULL, ' +
        '`last_sync_status` varchar(16) NULL, ' +
        '`last_sync_error` varchar(500) NULL, ' +
        '`last_sync_count` int NULL, ' +
        '`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
        'PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await queryRunner.query(
      'INSERT INTO `video_connection` (`id`, `twitch_kinds`) VALUES (1, ?)',
      [JSON.stringify(['archive', 'highlight', 'upload', 'clip'])],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `video_connection`');
    await queryRunner.query('DROP TABLE `videos`');
  }
}
