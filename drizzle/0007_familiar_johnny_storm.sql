CREATE TABLE "deadline_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"attempt_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"target_id" uuid,
	"deadline_at" timestamp with time zone NOT NULL,
	"deadline_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"schedule_attempts" integer DEFAULT 0 NOT NULL,
	"trigger_run_id" text,
	"last_error" text,
	"scheduled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deadline_jobs_kind_check" CHECK ("deadline_jobs"."kind" IN ('attempt', 'w2_task', 'l2_listening', 'l2_question')),
	CONSTRAINT "deadline_jobs_status_check" CHECK ("deadline_jobs"."status" IN ('pending', 'scheduled', 'failed', 'completed')),
	CONSTRAINT "deadline_jobs_schedule_attempts_nonnegative" CHECK ("deadline_jobs"."schedule_attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "deadline_jobs" ADD CONSTRAINT "deadline_jobs_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deadline_jobs_key_unique" ON "deadline_jobs" USING btree ("deadline_key");--> statement-breakpoint
CREATE INDEX "deadline_jobs_recovery_idx" ON "deadline_jobs" USING btree ("status","deadline_at");--> statement-breakpoint
CREATE INDEX "deadline_jobs_attempt_idx" ON "deadline_jobs" USING btree ("attempt_id");