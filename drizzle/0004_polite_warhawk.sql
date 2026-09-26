CREATE TABLE "writing_self_reviews" (
	"attempt_id" uuid PRIMARY KEY NOT NULL,
	"checklist" jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "writing_self_review_version_nonnegative" CHECK ("writing_self_reviews"."version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "writing_task_times" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"deadline_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "writing_self_reviews" ADD CONSTRAINT "writing_self_reviews_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_task_times" ADD CONSTRAINT "writing_task_times_item_id_attempt_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."attempt_items"("id") ON DELETE restrict ON UPDATE no action;