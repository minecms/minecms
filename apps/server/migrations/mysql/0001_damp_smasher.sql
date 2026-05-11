CREATE TABLE `media_assets` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`storage_key` varchar(512) NOT NULL,
	`original_filename` varchar(512) NOT NULL,
	`mime_type` varchar(128) NOT NULL,
	`size` bigint unsigned NOT NULL,
	`width` int,
	`height` int,
	`sha1` varchar(40) NOT NULL,
	`alt` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `media_assets_id` PRIMARY KEY(`id`),
	CONSTRAINT `media_assets_storage_key_unique` UNIQUE(`storage_key`)
);
