UPDATE `discord_links` SET `kind_settings` = json_object(
	'cancellation', json_object('destination', `destination`, 'mention', json('false')),
	'makeup', json_object('destination', `destination`, 'mention', json('false')),
	'roomChange', json_object('destination', `destination`, 'mention', json('false')),
	'integration', json_object('destination', `destination`, 'mention', json('false'))
) WHERE `destination` IS NOT NULL;--> statement-breakpoint
UPDATE `discord_links` SET `thread_channel_id` = `channel_id` WHERE `destination` = 'thread' AND `channel_id` IS NOT NULL;--> statement-breakpoint
UPDATE `discord_links` SET `dm_channel_id` = `channel_id` WHERE `destination` = 'dm' AND `channel_id` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `discord_links` DROP COLUMN `destination`;--> statement-breakpoint
ALTER TABLE `discord_links` DROP COLUMN `channel_id`;