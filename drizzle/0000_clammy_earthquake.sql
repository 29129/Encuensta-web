CREATE TABLE `answers` (
	`id` text PRIMARY KEY NOT NULL,
	`response_id` text NOT NULL,
	`question_id` text NOT NULL,
	`value_json` text NOT NULL,
	FOREIGN KEY (`response_id`) REFERENCES `responses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `answers_response_idx` ON `answers` (`response_id`);--> statement-breakpoint
CREATE INDEX `answers_question_idx` ON `answers` (`question_id`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`survey_id` text NOT NULL,
	`prompt` text NOT NULL,
	`type` text NOT NULL,
	`required` integer DEFAULT false NOT NULL,
	`position` integer NOT NULL,
	`options_json` text DEFAULT '[]' NOT NULL,
	`config_json` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`survey_id`) REFERENCES `surveys`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `questions_survey_position_idx` ON `questions` (`survey_id`,`position`);--> statement-breakpoint
CREATE TABLE `responses` (
	`id` text PRIMARY KEY NOT NULL,
	`survey_id` text NOT NULL,
	`respondent_name` text,
	`respondent_email` text,
	`respondent_token` text,
	`submitted_at` text NOT NULL,
	FOREIGN KEY (`survey_id`) REFERENCES `surveys`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `responses_survey_submitted_idx` ON `responses` (`survey_id`,`submitted_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `responses_device_idx` ON `responses` (`survey_id`,`respondent_token`);--> statement-breakpoint
CREATE TABLE `surveys` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`slug` text NOT NULL,
	`is_anonymous` integer DEFAULT true NOT NULL,
	`collect_name` integer DEFAULT false NOT NULL,
	`collect_email` integer DEFAULT false NOT NULL,
	`one_response_per_device` integer DEFAULT true NOT NULL,
	`start_at` text,
	`end_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `surveys_slug_unique` ON `surveys` (`slug`);--> statement-breakpoint
CREATE INDEX `surveys_owner_idx` ON `surveys` (`owner_email`);