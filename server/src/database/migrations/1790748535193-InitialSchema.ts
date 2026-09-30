import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1790748535193 implements MigrationInterface {
    name = 'InitialSchema1790748535193'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`uploads\` (\`id\` char(36) NOT NULL, \`storage_key\` varchar(255) NOT NULL, \`mime_type\` varchar(64) NOT NULL, \`byte_size\` int NOT NULL, \`original_filename\` varchar(255) NOT NULL, \`sha256\` char(64) NOT NULL, \`created_by\` varchar(64) NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`ux_uploads_storage_key\` (\`storage_key\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`subscribers\` (\`id\` char(36) NOT NULL, \`user_id\` varchar(64) NULL, \`email\` varchar(320) NOT NULL, \`is_subscribed\` tinyint NOT NULL DEFAULT 1, \`unsubscribe_token\` varchar(64) NOT NULL, \`unsubscribed_at\` datetime NULL, \`confirmed_at\` datetime NULL, \`bounce_count\` smallint NOT NULL DEFAULT '0', \`last_bounce_at\` datetime NULL, \`suppressed_at\` datetime NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`ux_subscribers_user\` (\`user_id\`), UNIQUE INDEX \`ux_subscribers_email\` (\`email\`), UNIQUE INDEX \`ux_subscribers_token\` (\`unsubscribe_token\`), INDEX \`ix_subscribers_active\` (\`is_subscribed\`, \`suppressed_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`games\` (\`id\` char(36) NOT NULL, \`slug\` varchar(120) NOT NULL, \`source\` varchar(16) NOT NULL, \`steam_app_id\` int UNSIGNED NULL, \`platform_label\` varchar(60) NULL, \`title\` varchar(200) NULL, \`summary\` varchar(600) NULL, \`description\` mediumtext NULL, \`developer\` varchar(200) NULL, \`publisher\` varchar(200) NULL, \`release_text\` varchar(60) NULL, \`cover_upload_id\` char(36) NULL, \`is_hidden\` tinyint NOT NULL DEFAULT 0, \`is_favorite\` tinyint NOT NULL DEFAULT 0, \`favorites_excluded\` tinyint NOT NULL DEFAULT 0, \`rating\` tinyint UNSIGNED NULL, \`steam_name\` varchar(200) NULL, \`steam_summary\` varchar(1000) NULL, \`steam_header_url\` varchar(500) NULL, \`steam_capsule_url\` varchar(500) NULL, \`steam_developers\` varchar(300) NULL, \`steam_publishers\` varchar(300) NULL, \`steam_genres\` json NULL, \`steam_release_text\` varchar(60) NULL, \`steam_type\` varchar(24) NULL, \`playtime_minutes\` int UNSIGNED NOT NULL DEFAULT '0', \`playtime_recent_minutes\` int UNSIGNED NOT NULL DEFAULT '0', \`last_played_at\` datetime NULL, \`steam_owned\` tinyint NOT NULL DEFAULT 0, \`steam_details_status\` varchar(16) NULL, \`steam_details_fetched_at\` datetime NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`ux_games_slug\` (\`slug\`), UNIQUE INDEX \`ux_games_steam_app\` (\`steam_app_id\`), INDEX \`ix_games_playtime\` (\`is_hidden\`, \`playtime_minutes\`), INDEX \`ix_games_favorites\` (\`is_hidden\`, \`is_favorite\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`channels\` (\`id\` char(36) NOT NULL, \`slug\` varchar(64) NOT NULL, \`name\` varchar(80) NOT NULL, \`platform\` varchar(24) NOT NULL, \`url\` varchar(500) NOT NULL, \`handle\` varchar(120) NULL, \`description\` varchar(200) NULL, \`is_stream_channel\` tinyint NOT NULL DEFAULT 0, \`show_on_links\` tinyint NOT NULL DEFAULT 1, \`sort_order\` int NOT NULL DEFAULT '0', \`is_published\` tinyint NOT NULL DEFAULT 1, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`ux_channels_slug\` (\`slug\`), INDEX \`ix_channels_listing\` (\`is_published\`, \`sort_order\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`stream_event_channels\` (\`event_id\` char(36) NOT NULL, \`channel_id\` char(36) NOT NULL, \`url_override\` varchar(500) NULL, \`sort_order\` int NOT NULL DEFAULT '0', INDEX \`ix_stream_event_channels_channel\` (\`channel_id\`), PRIMARY KEY (\`event_id\`, \`channel_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`stream_events\` (\`id\` char(36) NOT NULL, \`title\` varchar(200) NOT NULL, \`description\` text NULL, \`starts_at\` datetime NOT NULL, \`ends_at\` datetime NULL, \`game_id\` char(36) NULL, \`is_published\` tinyint NOT NULL DEFAULT 0, \`notify\` tinyint NOT NULL DEFAULT 1, \`announced_at\` datetime NULL, \`reminded_start_at\` datetime NULL, \`edited_at\` datetime NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`ix_stream_events_announce\` (\`is_published\`, \`announced_at\`), INDEX \`ix_stream_events_starts\` (\`is_published\`, \`starts_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`steam_connection\` (\`id\` tinyint UNSIGNED NOT NULL, \`steam_id\` varchar(20) NOT NULL, \`vanity\` varchar(64) NULL, \`api_key_sealed\` text NOT NULL, \`persona_name\` varchar(64) NULL, \`connected_at\` datetime NOT NULL, \`last_sync_at\` datetime NULL, \`last_sync_status\` varchar(16) NULL, \`last_sync_error\` varchar(500) NULL, \`last_sync_game_count\` int NULL, \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`reviews\` (\`id\` char(36) NOT NULL, \`game_id\` char(36) NOT NULL, \`title\` varchar(200) NOT NULL, \`body\` mediumtext NOT NULL, \`is_published\` tinyint NOT NULL DEFAULT 0, \`published_at\` datetime NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`ix_reviews_game\` (\`game_id\`, \`is_published\`, \`published_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`site_settings\` (\`key\` varchar(64) NOT NULL, \`value\` longtext NULL, \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`key\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`outbound_emails\` (\`id\` char(36) NOT NULL, \`kind\` varchar(32) NOT NULL, \`dedupe_key\` varchar(191) NOT NULL, \`user_id\` varchar(36) NULL, \`to_email\` varchar(320) NOT NULL, \`from_address\` varchar(320) NULL, \`subject\` varchar(255) NOT NULL, \`body_text\` mediumtext NOT NULL, \`body_html\` mediumtext NULL, \`headers\` json NULL, \`status\` varchar(16) NOT NULL DEFAULT 'pending', \`claim_id\` char(36) NULL, \`claimed_at\` datetime NULL, \`attempts\` smallint NOT NULL DEFAULT '0', \`max_attempts\` smallint NOT NULL DEFAULT '5', \`next_attempt_at\` datetime NOT NULL, \`last_error\` varchar(500) NULL, \`sent_at\` datetime NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`ux_outbound_dedupe\` (\`dedupe_key\`), INDEX \`ix_outbound_due\` (\`status\`, \`next_attempt_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`push_subscriptions\` (\`id\` char(36) NOT NULL, \`user_id\` varchar(64) NOT NULL, \`endpoint\` varchar(1024) NOT NULL, \`endpoint_hash\` char(64) NOT NULL, \`p256dh\` varchar(255) NOT NULL, \`auth\` varchar(255) NOT NULL, \`user_agent\` varchar(255) NULL, \`failure_count\` smallint NOT NULL DEFAULT '0', \`last_success_at\` datetime NULL, \`last_failure_at\` datetime NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`ix_push_subscriptions_user\` (\`user_id\`), UNIQUE INDEX \`ux_push_subscriptions_endpoint\` (\`endpoint_hash\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`outbound_pushes\` (\`id\` char(36) NOT NULL, \`kind\` varchar(32) NOT NULL, \`dedupe_key\` varchar(191) NOT NULL, \`user_id\` varchar(64) NOT NULL, \`subscription_id\` char(36) NOT NULL, \`payload\` json NOT NULL, \`expires_at\` datetime NOT NULL, \`status\` varchar(16) NOT NULL DEFAULT 'pending', \`claim_id\` char(36) NULL, \`claimed_at\` datetime NULL, \`attempts\` smallint NOT NULL DEFAULT '0', \`max_attempts\` smallint NOT NULL DEFAULT '4', \`next_attempt_at\` datetime NOT NULL, \`last_error\` varchar(500) NULL, \`sent_at\` datetime NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`ux_outbound_pushes_dedupe\` (\`dedupe_key\`), INDEX \`ix_outbound_pushes_due\` (\`status\`, \`next_attempt_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`page_settings\` (\`key\` varchar(32) NOT NULL, \`enabled\` tinyint NOT NULL DEFAULT 1, \`nav_label\` varchar(64) NOT NULL, \`parent_key\` varchar(32) NULL, \`sort_order\` int NOT NULL DEFAULT '0', \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`key\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`auth_sessions\` (\`id\` varchar(64) NOT NULL, \`token_hash\` varchar(64) NOT NULL, \`user_id\` varchar(64) NOT NULL, \`map_session_id\` varchar(64) NOT NULL, \`access_token\` text NOT NULL, \`refresh_token\` text NOT NULL, \`access_expires_at\` varchar(30) NOT NULL, \`created_at\` varchar(30) NOT NULL, \`last_seen_at\` varchar(30) NOT NULL, \`revoked_at\` varchar(30) NULL, \`ip\` varchar(45) NULL, \`user_agent\` varchar(512) NULL, UNIQUE INDEX \`ux_auth_sessions_token\` (\`token_hash\`), INDEX \`ix_auth_sessions_user\` (\`user_id\`), INDEX \`ix_auth_sessions_map_session\` (\`map_session_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`categories\` (\`id\` char(36) NOT NULL, \`slug\` varchar(96) NOT NULL, \`name\` varchar(80) NOT NULL, \`description\` varchar(500) NULL, \`sort_order\` int NOT NULL DEFAULT '0', \`is_published\` tinyint NOT NULL DEFAULT 1, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`ux_categories_slug\` (\`slug\`), INDEX \`ix_categories_listing\` (\`is_published\`, \`sort_order\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`game_categories\` (\`game_id\` char(36) NOT NULL, \`category_id\` char(36) NOT NULL, INDEX \`ix_game_categories_category\` (\`category_id\`), PRIMARY KEY (\`game_id\`, \`category_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`game_screenshots\` (\`id\` char(36) NOT NULL, \`game_id\` char(36) NOT NULL, \`source\` varchar(16) NOT NULL, \`steam_shot_id\` int NULL, \`url_thumb\` varchar(500) NULL, \`url_full\` varchar(500) NULL, \`upload_id\` char(36) NULL, \`sort_order\` int NOT NULL DEFAULT '0', \`is_hidden\` tinyint NOT NULL DEFAULT 0, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`ux_game_screenshots_steam\` (\`game_id\`, \`steam_shot_id\`), INDEX \`ix_game_screenshots_order\` (\`game_id\`, \`sort_order\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`games\` ADD CONSTRAINT \`FK_e280327f1f9da149f770b51c4fb\` FOREIGN KEY (\`cover_upload_id\`) REFERENCES \`uploads\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`stream_event_channels\` ADD CONSTRAINT \`FK_07be5d30b8676333ed921544317\` FOREIGN KEY (\`event_id\`) REFERENCES \`stream_events\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`stream_event_channels\` ADD CONSTRAINT \`FK_69906b2578961b920849eaae595\` FOREIGN KEY (\`channel_id\`) REFERENCES \`channels\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`stream_events\` ADD CONSTRAINT \`FK_6f95b56a3941673ae6a917b02aa\` FOREIGN KEY (\`game_id\`) REFERENCES \`games\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`reviews\` ADD CONSTRAINT \`FK_98c034c1b44b843c9c4641b1dbe\` FOREIGN KEY (\`game_id\`) REFERENCES \`games\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`outbound_pushes\` ADD CONSTRAINT \`FK_642cbcc04410defe05752b16d64\` FOREIGN KEY (\`subscription_id\`) REFERENCES \`push_subscriptions\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`game_categories\` ADD CONSTRAINT \`FK_674dc07479ee0fb150689d7b5ef\` FOREIGN KEY (\`game_id\`) REFERENCES \`games\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`game_categories\` ADD CONSTRAINT \`FK_9d561ef48697736212f5b7bc435\` FOREIGN KEY (\`category_id\`) REFERENCES \`categories\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`game_screenshots\` ADD CONSTRAINT \`FK_705dd7b1f0a37207cef49f2f201\` FOREIGN KEY (\`game_id\`) REFERENCES \`games\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`game_screenshots\` ADD CONSTRAINT \`FK_38290c9009abe8d16a3f1da7172\` FOREIGN KEY (\`upload_id\`) REFERENCES \`uploads\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`game_screenshots\` DROP FOREIGN KEY \`FK_38290c9009abe8d16a3f1da7172\``);
        await queryRunner.query(`ALTER TABLE \`game_screenshots\` DROP FOREIGN KEY \`FK_705dd7b1f0a37207cef49f2f201\``);
        await queryRunner.query(`ALTER TABLE \`game_categories\` DROP FOREIGN KEY \`FK_9d561ef48697736212f5b7bc435\``);
        await queryRunner.query(`ALTER TABLE \`game_categories\` DROP FOREIGN KEY \`FK_674dc07479ee0fb150689d7b5ef\``);
        await queryRunner.query(`ALTER TABLE \`outbound_pushes\` DROP FOREIGN KEY \`FK_642cbcc04410defe05752b16d64\``);
        await queryRunner.query(`ALTER TABLE \`reviews\` DROP FOREIGN KEY \`FK_98c034c1b44b843c9c4641b1dbe\``);
        await queryRunner.query(`ALTER TABLE \`stream_events\` DROP FOREIGN KEY \`FK_6f95b56a3941673ae6a917b02aa\``);
        await queryRunner.query(`ALTER TABLE \`stream_event_channels\` DROP FOREIGN KEY \`FK_69906b2578961b920849eaae595\``);
        await queryRunner.query(`ALTER TABLE \`stream_event_channels\` DROP FOREIGN KEY \`FK_07be5d30b8676333ed921544317\``);
        await queryRunner.query(`ALTER TABLE \`games\` DROP FOREIGN KEY \`FK_e280327f1f9da149f770b51c4fb\``);
        await queryRunner.query(`DROP INDEX \`ix_game_screenshots_order\` ON \`game_screenshots\``);
        await queryRunner.query(`DROP INDEX \`ux_game_screenshots_steam\` ON \`game_screenshots\``);
        await queryRunner.query(`DROP TABLE \`game_screenshots\``);
        await queryRunner.query(`DROP INDEX \`ix_game_categories_category\` ON \`game_categories\``);
        await queryRunner.query(`DROP TABLE \`game_categories\``);
        await queryRunner.query(`DROP INDEX \`ix_categories_listing\` ON \`categories\``);
        await queryRunner.query(`DROP INDEX \`ux_categories_slug\` ON \`categories\``);
        await queryRunner.query(`DROP TABLE \`categories\``);
        await queryRunner.query(`DROP INDEX \`ix_auth_sessions_map_session\` ON \`auth_sessions\``);
        await queryRunner.query(`DROP INDEX \`ix_auth_sessions_user\` ON \`auth_sessions\``);
        await queryRunner.query(`DROP INDEX \`ux_auth_sessions_token\` ON \`auth_sessions\``);
        await queryRunner.query(`DROP TABLE \`auth_sessions\``);
        await queryRunner.query(`DROP TABLE \`page_settings\``);
        await queryRunner.query(`DROP INDEX \`ix_outbound_pushes_due\` ON \`outbound_pushes\``);
        await queryRunner.query(`DROP INDEX \`ux_outbound_pushes_dedupe\` ON \`outbound_pushes\``);
        await queryRunner.query(`DROP TABLE \`outbound_pushes\``);
        await queryRunner.query(`DROP INDEX \`ux_push_subscriptions_endpoint\` ON \`push_subscriptions\``);
        await queryRunner.query(`DROP INDEX \`ix_push_subscriptions_user\` ON \`push_subscriptions\``);
        await queryRunner.query(`DROP TABLE \`push_subscriptions\``);
        await queryRunner.query(`DROP INDEX \`ix_outbound_due\` ON \`outbound_emails\``);
        await queryRunner.query(`DROP INDEX \`ux_outbound_dedupe\` ON \`outbound_emails\``);
        await queryRunner.query(`DROP TABLE \`outbound_emails\``);
        await queryRunner.query(`DROP TABLE \`site_settings\``);
        await queryRunner.query(`DROP INDEX \`ix_reviews_game\` ON \`reviews\``);
        await queryRunner.query(`DROP TABLE \`reviews\``);
        await queryRunner.query(`DROP TABLE \`steam_connection\``);
        await queryRunner.query(`DROP INDEX \`ix_stream_events_starts\` ON \`stream_events\``);
        await queryRunner.query(`DROP INDEX \`ix_stream_events_announce\` ON \`stream_events\``);
        await queryRunner.query(`DROP TABLE \`stream_events\``);
        await queryRunner.query(`DROP INDEX \`ix_stream_event_channels_channel\` ON \`stream_event_channels\``);
        await queryRunner.query(`DROP TABLE \`stream_event_channels\``);
        await queryRunner.query(`DROP INDEX \`ix_channels_listing\` ON \`channels\``);
        await queryRunner.query(`DROP INDEX \`ux_channels_slug\` ON \`channels\``);
        await queryRunner.query(`DROP TABLE \`channels\``);
        await queryRunner.query(`DROP INDEX \`ix_games_favorites\` ON \`games\``);
        await queryRunner.query(`DROP INDEX \`ix_games_playtime\` ON \`games\``);
        await queryRunner.query(`DROP INDEX \`ux_games_steam_app\` ON \`games\``);
        await queryRunner.query(`DROP INDEX \`ux_games_slug\` ON \`games\``);
        await queryRunner.query(`DROP TABLE \`games\``);
        await queryRunner.query(`DROP INDEX \`ix_subscribers_active\` ON \`subscribers\``);
        await queryRunner.query(`DROP INDEX \`ux_subscribers_token\` ON \`subscribers\``);
        await queryRunner.query(`DROP INDEX \`ux_subscribers_email\` ON \`subscribers\``);
        await queryRunner.query(`DROP INDEX \`ux_subscribers_user\` ON \`subscribers\``);
        await queryRunner.query(`DROP TABLE \`subscribers\``);
        await queryRunner.query(`DROP INDEX \`ux_uploads_storage_key\` ON \`uploads\``);
        await queryRunner.query(`DROP TABLE \`uploads\``);
    }

}
