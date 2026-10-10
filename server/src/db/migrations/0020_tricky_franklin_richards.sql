DROP TABLE "eval_runs" CASCADE;--> statement-breakpoint
ALTER TABLE "eval_cases" DROP COLUMN "owner_kind";--> statement-breakpoint
ALTER TABLE "eval_cases" DROP COLUMN "owner_id";--> statement-breakpoint
ALTER TABLE "eval_cases" DROP COLUMN "input_files";