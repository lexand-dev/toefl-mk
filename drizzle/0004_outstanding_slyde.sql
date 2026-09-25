CREATE TABLE "attempt_activity" (
	"attempt_id" uuid PRIMARY KEY NOT NULL,
	"last_visible_at" timestamp with time zone,
	"active_milliseconds" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "activity_nonnegative" CHECK ("attempt_activity"."active_milliseconds" >= 0)
);
--> statement-breakpoint
ALTER TABLE "attempt_activity" ADD CONSTRAINT "attempt_activity_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE restrict ON UPDATE no action;