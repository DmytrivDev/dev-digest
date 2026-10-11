ALTER TABLE "ci_installations" ADD COLUMN "repo_id" uuid;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "workflow_path" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "agent_slug" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "generator_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "agent_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "triggers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "post_as" text DEFAULT 'github_review' NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "pr_url" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "files" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "agent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "github_run_id" bigint;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "run_attempt" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "repository_id" bigint;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "commit_sha" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "pr_title" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "verdict" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "critical" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "warning" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "suggestion" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD CONSTRAINT "ci_installations_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ci_installations_agent_repo_uq" ON "ci_installations" USING btree ("agent_id","repo_id");--> statement-breakpoint
CREATE INDEX "ci_installations_repo_idx" ON "ci_installations" USING btree ("repo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ci_runs_agent_run_uq" ON "ci_runs" USING btree ("agent_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ci_runs_installation_github_run_uq" ON "ci_runs" USING btree ("ci_installation_id","github_run_id");