CREATE TABLE "attempt_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"attempt_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	CONSTRAINT "attempt_group_order_unique" UNIQUE("attempt_id","ordinal"),
	CONSTRAINT "attempt_group_revision_unique" UNIQUE("attempt_id","revision_id"),
	CONSTRAINT "attempt_group_composite_unique" UNIQUE("id","attempt_id","revision_id"),
	CONSTRAINT "attempt_group_ordinal_positive" CHECK ("attempt_groups"."ordinal" > 0)
);
--> statement-breakpoint
CREATE TABLE "attempt_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"attempt_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"global_position" integer NOT NULL,
	"response_json" jsonb,
	"response_version" integer DEFAULT 0 NOT NULL,
	"saved_at" timestamp with time zone,
	"outcome" text,
	"points_possible" numeric(8, 2) NOT NULL,
	"points_awarded" numeric(8, 2),
	CONSTRAINT "attempt_item_position_unique" UNIQUE("attempt_id","global_position"),
	CONSTRAINT "attempt_group_item_unique" UNIQUE("group_id","item_id"),
	CONSTRAINT "attempt_item_position_positive" CHECK ("attempt_items"."global_position" > 0),
	CONSTRAINT "attempt_response_version_nonnegative" CHECK ("attempt_items"."response_version" >= 0),
	CONSTRAINT "attempt_outcome_check" CHECK ("attempt_items"."outcome" IN ('correct', 'incorrect', 'omitted', 'ungraded')),
	CONSTRAINT "attempt_item_score_valid" CHECK ("attempt_items"."points_awarded" IS NULL OR ("attempt_items"."points_awarded" >= 0 AND "attempt_items"."points_awarded" <= "attempt_items"."points_possible"))
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type_code" text NOT NULL,
	"requested_groups" integer NOT NULL,
	"timer_mode" text NOT NULL,
	"rules_snapshot" jsonb NOT NULL,
	"status" text DEFAULT 'prepared' NOT NULL,
	"current_position" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"deadline_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"points_awarded" numeric(10, 2),
	"points_possible" numeric(10, 2),
	CONSTRAINT "attempt_type_check" CHECK ("attempts"."type_code" IN ('R1', 'R3', 'L2', 'W1', 'W2')),
	CONSTRAINT "attempt_groups_positive" CHECK ("attempts"."requested_groups" > 0),
	CONSTRAINT "attempt_timer_check" CHECK ("attempts"."timer_mode" IN ('count_up', 'count_down')),
	CONSTRAINT "attempt_rules_object" CHECK (jsonb_typeof("attempts"."rules_snapshot") = 'object'),
	CONSTRAINT "attempt_status_check" CHECK ("attempts"."status" IN ('prepared', 'in_progress', 'submitted')),
	CONSTRAINT "attempt_position_positive" CHECK ("attempts"."current_position" > 0),
	CONSTRAINT "attempt_lifecycle" CHECK (("attempts"."status" = 'prepared' AND "attempts"."started_at" IS NULL AND "attempts"."submitted_at" IS NULL) OR ("attempts"."status" = 'in_progress' AND "attempts"."started_at" IS NOT NULL AND "attempts"."submitted_at" IS NULL) OR ("attempts"."status" = 'submitted' AND "attempts"."started_at" IS NOT NULL AND "attempts"."submitted_at" IS NOT NULL)),
	CONSTRAINT "attempt_totals" CHECK (("attempts"."points_awarded" IS NULL AND "attempts"."points_possible" IS NULL) OR ("attempts"."points_awarded" IS NOT NULL AND "attempts"."points_possible" IS NOT NULL AND "attempts"."points_awarded" >= 0 AND "attempts"."points_possible" > 0 AND "attempts"."points_awarded" <= "attempts"."points_possible"))
);
--> statement-breakpoint
ALTER TABLE "attempt_groups" ADD CONSTRAINT "attempt_groups_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_groups" ADD CONSTRAINT "attempt_groups_revision_id_exercise_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."exercise_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_items" ADD CONSTRAINT "attempt_item_group_fk" FOREIGN KEY ("group_id","attempt_id","revision_id") REFERENCES "public"."attempt_groups"("id","attempt_id","revision_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_items" ADD CONSTRAINT "attempt_item_source_fk" FOREIGN KEY ("revision_id","item_id") REFERENCES "public"."exercise_items"("revision_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempt_groups_revision_idx" ON "attempt_groups" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "attempt_items_item_idx" ON "attempt_items" USING btree ("revision_id","item_id");--> statement-breakpoint
CREATE INDEX "attempt_history_idx" ON "attempts" USING btree ("user_id","created_at");