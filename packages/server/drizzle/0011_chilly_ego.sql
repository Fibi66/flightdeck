CREATE TABLE `task_cost_records` (
`agent_id` text NOT NULL,
`dag_task_id` text NOT NULL,
`lead_id` text NOT NULL,
`input_tokens` integer DEFAULT 0,
`output_tokens` integer DEFAULT 0,
`created_at` text DEFAULT (datetime('now')),
`updated_at` text DEFAULT (datetime('now')),
PRIMARY KEY(`agent_id`, `dag_task_id`, `lead_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_task_cost_agent` ON `task_cost_records` (`agent_id`);--> statement-breakpoint
CREATE INDEX `idx_task_cost_task` ON `task_cost_records` (`dag_task_id`,`lead_id`);
