CREATE INDEX "pr_commits_pr_idx" ON "pr_commits" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX "pr_files_pr_idx" ON "pr_files" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX "findings_review_idx" ON "findings" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "reviews_pr_created_idx" ON "reviews" USING btree ("pr_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_runs_ws_pr_ran_idx" ON "agent_runs" USING btree ("workspace_id","pr_id","ran_at" DESC NULLS LAST);