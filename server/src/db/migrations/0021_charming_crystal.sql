ALTER TABLE "eval_cases" ALTER COLUMN "source_pr_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ALTER COLUMN "source_repo" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ALTER COLUMN "labels" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "origin" text DEFAULT 'finding' NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_origin_source_ck" CHECK (("eval_cases"."origin" = 'manual') = ("eval_cases"."source_pr_number" IS NULL));