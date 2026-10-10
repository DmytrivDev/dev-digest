ALTER TABLE "eval_suite_runs" ADD COLUMN "scope" text DEFAULT 'suite' NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_suite_runs" ADD COLUMN "case_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_suite_runs" ADD CONSTRAINT "eval_suite_runs_scope_case_ck" CHECK (("eval_suite_runs"."scope" = 'case') = ("eval_suite_runs"."case_id" IS NOT NULL));