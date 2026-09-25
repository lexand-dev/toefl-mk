CREATE TABLE "l2_sessions" (
	"attempt_id" uuid PRIMARY KEY NOT NULL,
	"playback_started_at" timestamp with time zone,
	"listening_deadline_at" timestamp with time zone,
	"response_started_at" timestamp with time zone,
	"question_deadline_at" timestamp with time zone,
	"incident_at" timestamp with time zone,
	"incident_reason" text,
	"incident_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "l2_incident_count_nonnegative" CHECK ("l2_sessions"."incident_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "l2_sessions" ADD CONSTRAINT "l2_sessions_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE restrict ON UPDATE no action;