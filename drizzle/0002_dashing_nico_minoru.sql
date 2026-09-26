CREATE TABLE "answer_keys" (
	"revision_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"accepted_answers" jsonb NOT NULL,
	"scoring_rule" text NOT NULL,
	"explanation" text NOT NULL,
	CONSTRAINT "answer_keys_revision_id_item_id_pk" PRIMARY KEY("revision_id","item_id"),
	CONSTRAINT "answers_array" CHECK (jsonb_typeof("answer_keys"."accepted_answers") = 'array'),
	CONSTRAINT "scoring_rule_check" CHECK ("answer_keys"."scoring_rule" IN ('exact', 'case_insensitive', 'approved_variants'))
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"sha256_hex" char(64) NOT NULL,
	"byte_size" bigint NOT NULL,
	"duration_ms" integer,
	"rights_note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "asset_kind_check" CHECK ("assets"."kind" IN ('audio', 'image')),
	CONSTRAINT "asset_hash_check" CHECK ("assets"."sha256_hex" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "asset_size_check" CHECK ("assets"."byte_size" > 0),
	CONSTRAINT "audio_has_duration" CHECK (("assets"."kind" <> 'audio' OR "assets"."duration_ms" IS NOT NULL) AND ("assets"."duration_ms" IS NULL OR "assets"."duration_ms" > 0))
);
--> statement-breakpoint
CREATE TABLE "exercise_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"revision_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"response_kind" text NOT NULL,
	"public_prompt" jsonb NOT NULL,
	"points_possible" numeric(8, 2) DEFAULT '1' NOT NULL,
	CONSTRAINT "item_revision_id_unique" UNIQUE("revision_id","id"),
	CONSTRAINT "item_revision_ordinal_unique" UNIQUE("revision_id","ordinal"),
	CONSTRAINT "item_ordinal_positive" CHECK ("exercise_items"."ordinal" > 0),
	CONSTRAINT "item_prompt_object" CHECK (jsonb_typeof("exercise_items"."public_prompt") = 'object'),
	CONSTRAINT "item_response_kind_check" CHECK ("exercise_items"."response_kind" IN ('fill_word', 'single_choice', 'token_order', 'free_text')),
	CONSTRAINT "free_text_has_no_objective_points" CHECK (("exercise_items"."response_kind" = 'free_text' AND "exercise_items"."points_possible" = 0) OR ("exercise_items"."response_kind" <> 'free_text' AND "exercise_items"."points_possible" > 0))
);
--> statement-breakpoint
CREATE TABLE "exercise_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"exercise_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"public_content" jsonb NOT NULL,
	"author_id" uuid NOT NULL,
	"reviewed_by" uuid,
	"provenance_note" text NOT NULL,
	"rights_note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "exercise_revision_number_unique" UNIQUE("exercise_id","revision_number"),
	CONSTRAINT "revision_number_positive" CHECK ("exercise_revisions"."revision_number" > 0),
	CONSTRAINT "revision_status_check" CHECK ("exercise_revisions"."status" IN ('draft', 'in_review', 'published', 'retired')),
	CONSTRAINT "revision_content_object" CHECK (jsonb_typeof("exercise_revisions"."public_content") = 'object'),
	CONSTRAINT "publication_metadata" CHECK (("exercise_revisions"."status" IN ('published', 'retired') AND "exercise_revisions"."reviewed_by" IS NOT NULL AND "exercise_revisions"."published_at" IS NOT NULL) OR ("exercise_revisions"."status" IN ('draft', 'in_review') AND "exercise_revisions"."published_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY NOT NULL,
	"section" text NOT NULL,
	"type_code" text NOT NULL,
	"topic" text,
	"difficulty" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercise_section_matches_type" CHECK (("exercises"."section" = 'reading' AND "exercises"."type_code" IN ('R1', 'R3')) OR ("exercises"."section" = 'listening' AND "exercises"."type_code" = 'L2') OR ("exercises"."section" = 'writing' AND "exercises"."type_code" IN ('W1', 'W2'))),
	CONSTRAINT "exercise_difficulty_check" CHECK ("exercises"."difficulty" IN ('intro', 'intermediate', 'advanced'))
);
--> statement-breakpoint
CREATE TABLE "review_materials" (
	"revision_id" uuid PRIMARY KEY NOT NULL,
	"review_content" jsonb NOT NULL,
	CONSTRAINT "review_content_object" CHECK (jsonb_typeof("review_materials"."review_content") = 'object')
);
--> statement-breakpoint
CREATE TABLE "revision_assets" (
	"revision_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"role" text NOT NULL,
	"sort_order" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "revision_assets_revision_id_asset_id_role_pk" PRIMARY KEY("revision_id","asset_id","role"),
	CONSTRAINT "revision_asset_role_check" CHECK ("revision_assets"."role" IN ('stimulus', 'illustration')),
	CONSTRAINT "revision_asset_order_check" CHECK ("revision_assets"."sort_order" > 0)
);
--> statement-breakpoint
ALTER TABLE "answer_keys" ADD CONSTRAINT "answer_key_item_fk" FOREIGN KEY ("revision_id","item_id") REFERENCES "public"."exercise_items"("revision_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_items" ADD CONSTRAINT "exercise_items_revision_id_exercise_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."exercise_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_revisions" ADD CONSTRAINT "exercise_revisions_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_revisions" ADD CONSTRAINT "exercise_revisions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_revisions" ADD CONSTRAINT "exercise_revisions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_materials" ADD CONSTRAINT "review_materials_revision_id_exercise_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."exercise_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_assets" ADD CONSTRAINT "revision_assets_revision_id_exercise_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."exercise_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_assets" ADD CONSTRAINT "revision_assets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "published_revisions_idx" ON "exercise_revisions" USING btree ("exercise_id","revision_number") WHERE "exercise_revisions"."status" = 'published';--> statement-breakpoint
CREATE INDEX "exercise_catalog_idx" ON "exercises" USING btree ("section","type_code","difficulty");--> statement-breakpoint
CREATE INDEX "revision_assets_asset_idx" ON "revision_assets" USING btree ("asset_id");
--> statement-breakpoint
CREATE FUNCTION editorial_revision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'in_review' AND OLD.reviewed_by IS NOT NULL AND
    NOT (NEW.status = 'published' AND NEW.reviewed_by = OLD.reviewed_by AND
      (to_jsonb(NEW) - 'status' - 'published_at') = (to_jsonb(OLD) - 'status' - 'published_at')) THEN
    RAISE EXCEPTION 'Approved revision % is immutable', OLD.id;
  END IF;
  IF OLD.status IN ('published', 'retired') THEN
    IF NOT (OLD.status = 'published' AND NEW.status = 'retired' AND
      (to_jsonb(NEW) - 'status') = (to_jsonb(OLD) - 'status')) THEN
      RAISE EXCEPTION 'Published revision % is immutable', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER exercise_revision_immutable BEFORE UPDATE OR DELETE ON exercise_revisions
FOR EACH ROW EXECUTE FUNCTION editorial_revision_guard();
--> statement-breakpoint
CREATE FUNCTION editorial_child_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE revision_state text; reviewer uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT status, reviewed_by INTO revision_state, reviewer FROM exercise_revisions WHERE id = OLD.revision_id FOR SHARE;
    IF revision_state IN ('published', 'retired') OR reviewer IS NOT NULL THEN
      RAISE EXCEPTION 'Revision % is immutable', OLD.revision_id;
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT status, reviewed_by INTO revision_state, reviewer FROM exercise_revisions WHERE id = NEW.revision_id FOR SHARE;
    IF revision_state IN ('published', 'retired') OR reviewer IS NOT NULL THEN
      RAISE EXCEPTION 'Revision % is immutable', NEW.revision_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER exercise_items_immutable BEFORE INSERT OR UPDATE OR DELETE ON exercise_items FOR EACH ROW EXECUTE FUNCTION editorial_child_guard();
--> statement-breakpoint
CREATE TRIGGER answer_keys_immutable BEFORE INSERT OR UPDATE OR DELETE ON answer_keys FOR EACH ROW EXECUTE FUNCTION editorial_child_guard();
--> statement-breakpoint
CREATE TRIGGER review_materials_immutable BEFORE INSERT OR UPDATE OR DELETE ON review_materials FOR EACH ROW EXECUTE FUNCTION editorial_child_guard();
--> statement-breakpoint
CREATE TRIGGER revision_assets_immutable BEFORE INSERT OR UPDATE OR DELETE ON revision_assets FOR EACH ROW EXECUTE FUNCTION editorial_child_guard();
--> statement-breakpoint
CREATE FUNCTION editorial_asset_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Asset metadata is immutable; create another asset';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER asset_metadata_immutable BEFORE UPDATE ON assets FOR EACH ROW EXECUTE FUNCTION editorial_asset_guard();
--> statement-breakpoint
CREATE FUNCTION editorial_exercise_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM exercise_revisions WHERE exercise_id = OLD.id AND status IN ('published', 'retired')) THEN
    RAISE EXCEPTION 'Published exercise identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER exercise_identity_immutable BEFORE UPDATE ON exercises FOR EACH ROW EXECUTE FUNCTION editorial_exercise_guard();
--> statement-breakpoint
CREATE FUNCTION editorial_publication_gate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE kind text; expected text;
BEGIN
  IF NEW.status = 'published' AND OLD.status <> 'published' THEN
    IF OLD.status <> 'in_review' OR NEW.reviewed_by IS NULL OR NEW.reviewed_by = NEW.author_id OR NEW.published_at IS NULL
      OR btrim(NEW.provenance_note) = '' OR btrim(NEW.rights_note) = '' THEN
      RAISE EXCEPTION 'Revision requires independent review and provenance before publication';
    END IF;
    SELECT type_code INTO kind FROM exercises WHERE id = NEW.exercise_id;
    expected := CASE kind WHEN 'R1' THEN 'fill_word' WHEN 'W1' THEN 'token_order' WHEN 'W2' THEN 'free_text' ELSE 'single_choice' END;
    IF NOT EXISTS (SELECT 1 FROM exercise_items WHERE revision_id = NEW.id)
      OR EXISTS (SELECT 1 FROM exercise_items WHERE revision_id = NEW.id AND response_kind <> expected)
      OR (expected = 'free_text' AND EXISTS (SELECT 1 FROM answer_keys WHERE revision_id = NEW.id))
      OR (expected <> 'free_text' AND EXISTS (
        SELECT 1 FROM exercise_items i LEFT JOIN answer_keys k ON k.revision_id = i.revision_id AND k.item_id = i.id
        WHERE i.revision_id = NEW.id AND k.item_id IS NULL)) THEN
      RAISE EXCEPTION 'Revision has incomplete items or answer keys';
    END IF;
    IF kind = 'L2' AND NOT EXISTS (
      SELECT 1 FROM revision_assets ra JOIN assets a ON a.id = ra.asset_id
      WHERE ra.revision_id = NEW.id AND ra.role = 'stimulus' AND a.kind = 'audio') THEN
      RAISE EXCEPTION 'Listening revision needs an audio stimulus';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER revision_publication_gate BEFORE UPDATE OF status ON exercise_revisions
FOR EACH ROW EXECUTE FUNCTION editorial_publication_gate();
