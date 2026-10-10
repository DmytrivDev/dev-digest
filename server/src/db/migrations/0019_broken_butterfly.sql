CREATE TABLE "eval_case_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"case_name" text NOT NULL,
	"kind" text NOT NULL,
	"expectation" jsonb NOT NULL,
	"status" text NOT NULL,
	"pass" boolean,
	"error_reason" text,
	"findings_matched" integer DEFAULT 0 NOT NULL,
	"findings_total" integer DEFAULT 0 NOT NULL,
	"grounding_kept" integer DEFAULT 0 NOT NULL,
	"grounding_total" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer NOT NULL,
	"cost_usd" double precision,
	"actual" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_suite_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_version" integer NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"error_reason" text,
	"config" jsonb NOT NULL,
	"case_ids" jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"cases_total" integer NOT NULL,
	"cases_done" integer DEFAULT 0 NOT NULL,
	"cases_passed" integer DEFAULT 0 NOT NULL,
	"cases_scored" integer DEFAULT 0 NOT NULL,
	"cases_errored" integer DEFAULT 0 NOT NULL,
	"recall" double precision,
	"precision" double precision,
	"citation_accuracy" double precision,
	"cost_usd" double precision,
	"duration_ms" integer
);
--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "agent_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "source_finding_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "source_pr_number" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "source_repo" text NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "labels" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_case_outcomes" ADD CONSTRAINT "eval_case_outcomes_run_id_eval_suite_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."eval_suite_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_suite_runs" ADD CONSTRAINT "eval_suite_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_suite_runs" ADD CONSTRAINT "eval_suite_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_case_outcomes_run_idx" ON "eval_case_outcomes" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "eval_case_outcomes_case_created_idx" ON "eval_case_outcomes" USING btree ("case_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "eval_case_outcomes_run_case_uq" ON "eval_case_outcomes" USING btree ("run_id","case_id");--> statement-breakpoint
CREATE INDEX "eval_suite_runs_agent_started_idx" ON "eval_suite_runs" USING btree ("agent_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "eval_suite_runs_one_running_uq" ON "eval_suite_runs" USING btree ("agent_id") WHERE status = 'running';--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_source_finding_id_findings_id_fk" FOREIGN KEY ("source_finding_id") REFERENCES "public"."findings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_cases_agent_idx" ON "eval_cases" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eval_cases_agent_finding_uq" ON "eval_cases" USING btree ("agent_id","source_finding_id");