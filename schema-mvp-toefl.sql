-- Esquema inicial para PostgreSQL. Los UUID son generados por la aplicación.
-- Ejecutar como una migración en una base vacía, después de revisión técnica.
-- Los JSON se validan además en la aplicación según type_code/response_kind.

BEGIN;

CREATE TABLE users (
    id uuid PRIMARY KEY,
    auth_subject text NOT NULL UNIQUE,
    role text NOT NULL DEFAULT 'learner'
        CHECK (role IN ('learner', 'editor', 'admin')),
    display_name text,
    timezone text NOT NULL DEFAULT 'UTC',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE exercises (
    id uuid PRIMARY KEY,
    section text NOT NULL CHECK (section IN ('reading', 'listening', 'writing')),
    type_code text NOT NULL CHECK (type_code IN
        ('R1', 'R2', 'R3', 'L1', 'L2', 'L3', 'L4', 'W1', 'W2', 'W3')),
    topic text,
    difficulty text CHECK (difficulty IN ('intro', 'intermediate', 'advanced')),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT exercise_section_matches_type CHECK (
        (section = 'reading' AND type_code IN ('R1', 'R2', 'R3')) OR
        (section = 'listening' AND type_code IN ('L1', 'L2', 'L3', 'L4')) OR
        (section = 'writing' AND type_code IN ('W1', 'W2', 'W3'))
    )
);

CREATE TABLE exercise_revisions (
    id uuid PRIMARY KEY,
    exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
    revision_number integer NOT NULL CHECK (revision_number > 0),
    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'in_review', 'published', 'retired')),
    public_content jsonb NOT NULL CHECK (jsonb_typeof(public_content) = 'object'),
    author_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reviewed_by uuid REFERENCES users(id) ON DELETE RESTRICT,
    provenance_note text NOT NULL,
    rights_note text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz,
    UNIQUE (exercise_id, revision_number),
    CONSTRAINT publication_metadata CHECK (
        (status IN ('published', 'retired') AND reviewed_by IS NOT NULL
            AND published_at IS NOT NULL) OR
        (status IN ('draft', 'in_review') AND published_at IS NULL)
    )
);

CREATE TABLE assets (
    id uuid PRIMARY KEY,
    kind text NOT NULL CHECK (kind IN ('audio', 'image')),
    storage_key text NOT NULL UNIQUE,
    mime_type text NOT NULL,
    sha256_hex char(64) NOT NULL CHECK (sha256_hex ~ '^[0-9a-f]{64}$'),
    byte_size bigint NOT NULL CHECK (byte_size > 0),
    duration_ms integer CHECK (duration_ms > 0),
    rights_note text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT audio_has_duration CHECK (kind <> 'audio' OR duration_ms IS NOT NULL)
);

CREATE TABLE revision_assets (
    revision_id uuid NOT NULL REFERENCES exercise_revisions(id) ON DELETE RESTRICT,
    asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
    role text NOT NULL CHECK (role IN ('stimulus', 'illustration')),
    sort_order integer NOT NULL DEFAULT 1 CHECK (sort_order > 0),
    PRIMARY KEY (revision_id, asset_id, role)
);

CREATE TABLE exercise_items (
    id uuid PRIMARY KEY,
    revision_id uuid NOT NULL REFERENCES exercise_revisions(id) ON DELETE RESTRICT,
    ordinal integer NOT NULL CHECK (ordinal > 0),
    response_kind text NOT NULL CHECK (response_kind IN
        ('fill_word', 'single_choice', 'token_order', 'free_text')),
    public_prompt jsonb NOT NULL CHECK (jsonb_typeof(public_prompt) = 'object'),
    points_possible numeric(8,2) NOT NULL DEFAULT 1
        CHECK (points_possible >= 0),
    UNIQUE (revision_id, id),
    UNIQUE (revision_id, ordinal),
    CONSTRAINT free_text_has_no_objective_points CHECK (
        (response_kind = 'free_text' AND points_possible = 0) OR
        (response_kind <> 'free_text' AND points_possible > 0)
    )
);

CREATE TABLE answer_keys (
    revision_id uuid NOT NULL,
    item_id uuid NOT NULL,
    accepted_answers jsonb NOT NULL
        CHECK (jsonb_typeof(accepted_answers) = 'array'),
    scoring_rule text NOT NULL
        CHECK (scoring_rule IN ('exact', 'case_insensitive', 'approved_variants')),
    explanation text NOT NULL,
    PRIMARY KEY (revision_id, item_id),
    FOREIGN KEY (revision_id, item_id)
        REFERENCES exercise_items(revision_id, id) ON DELETE RESTRICT
);

CREATE TABLE review_materials (
    revision_id uuid PRIMARY KEY
        REFERENCES exercise_revisions(id) ON DELETE RESTRICT,
    review_content jsonb NOT NULL
        CHECK (jsonb_typeof(review_content) = 'object')
);

-- Una revisión publicada se conserva. Para corregirla se crea otra revisión.
CREATE FUNCTION reject_published_revision_update()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    permitted exercise_revisions%ROWTYPE;
BEGIN
    IF OLD.status IN ('published', 'retired') THEN
        permitted := OLD;
        IF OLD.status = 'published' AND NEW.status = 'retired' THEN
            permitted.status := 'retired';
        END IF;
        IF NEW IS DISTINCT FROM permitted THEN
            RAISE EXCEPTION 'Published revision % is immutable', OLD.id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER exercise_revision_immutable
BEFORE UPDATE ON exercise_revisions
FOR EACH ROW EXECUTE FUNCTION reject_published_revision_update();

-- El bloqueo FOR SHARE serializa cambios de hijos con la publicación del padre.
CREATE FUNCTION guard_revision_child_change()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    revision_state text;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        SELECT status INTO revision_state
        FROM exercise_revisions WHERE id = OLD.revision_id FOR SHARE;
        IF revision_state IN ('published', 'retired') THEN
            RAISE EXCEPTION 'Revision % is immutable', OLD.revision_id;
        END IF;
    END IF;
    IF TG_OP <> 'DELETE' THEN
        SELECT status INTO revision_state
        FROM exercise_revisions WHERE id = NEW.revision_id FOR SHARE;
        IF revision_state IN ('published', 'retired') THEN
            RAISE EXCEPTION 'Revision % is immutable', NEW.revision_id;
        END IF;
        RETURN NEW;
    END IF;
    RETURN OLD;
END;
$$;

CREATE TRIGGER exercise_items_immutable
BEFORE INSERT OR UPDATE OR DELETE ON exercise_items
FOR EACH ROW EXECUTE FUNCTION guard_revision_child_change();

CREATE TRIGGER answer_keys_immutable
BEFORE INSERT OR UPDATE OR DELETE ON answer_keys
FOR EACH ROW EXECUTE FUNCTION guard_revision_child_change();

CREATE TRIGGER review_materials_immutable
BEFORE INSERT OR UPDATE OR DELETE ON review_materials
FOR EACH ROW EXECUTE FUNCTION guard_revision_child_change();

CREATE TRIGGER revision_assets_immutable
BEFORE INSERT OR UPDATE OR DELETE ON revision_assets
FOR EACH ROW EXECUTE FUNCTION guard_revision_child_change();

CREATE FUNCTION reject_asset_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Asset metadata is immutable; create another asset';
END;
$$;

CREATE TRIGGER asset_metadata_immutable
BEFORE UPDATE ON assets
FOR EACH ROW EXECUTE FUNCTION reject_asset_change();

-- Impide publicar una revisión incompleta. Las comprobaciones de estructura
-- interna del JSON y la revisión lingüística siguen siendo responsabilidad
-- del proceso editorial de la aplicación.
CREATE FUNCTION validate_revision_publication()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    exercise_type text;
    expected_response_kind text;
BEGIN
    IF NEW.status = 'published' AND OLD.status <> 'published' THEN
        IF OLD.status <> 'in_review' THEN
            RAISE EXCEPTION 'Revision % must be reviewed before publication', NEW.id;
        END IF;

        SELECT e.type_code INTO exercise_type
        FROM exercises AS e WHERE e.id = NEW.exercise_id;

        expected_response_kind := CASE
            WHEN exercise_type = 'R1' THEN 'fill_word'
            WHEN exercise_type = 'W1' THEN 'token_order'
            WHEN exercise_type IN ('W2', 'W3') THEN 'free_text'
            ELSE 'single_choice'
        END;

        IF NOT EXISTS (
            SELECT 1 FROM exercise_items WHERE revision_id = NEW.id
        ) THEN
            RAISE EXCEPTION 'Revision % has no items', NEW.id;
        END IF;

        IF EXISTS (
            SELECT 1 FROM exercise_items
            WHERE revision_id = NEW.id
              AND response_kind <> expected_response_kind
        ) THEN
            RAISE EXCEPTION 'Revision % has an invalid response kind', NEW.id;
        END IF;

        IF expected_response_kind = 'free_text' THEN
            IF EXISTS (SELECT 1 FROM answer_keys WHERE revision_id = NEW.id) THEN
                RAISE EXCEPTION 'Free-text revision % cannot have objective keys', NEW.id;
            END IF;
        ELSE
            IF EXISTS (
                SELECT 1 FROM exercise_items AS i
                LEFT JOIN answer_keys AS k
                  ON k.revision_id = i.revision_id AND k.item_id = i.id
                WHERE i.revision_id = NEW.id AND k.item_id IS NULL
            ) THEN
                RAISE EXCEPTION 'Revision % has items without answer keys', NEW.id;
            END IF;
        END IF;

        IF exercise_type IN ('L1', 'L2', 'L3', 'L4') AND NOT EXISTS (
            SELECT 1 FROM revision_assets AS ra
            JOIN assets AS a ON a.id = ra.asset_id
            WHERE ra.revision_id = NEW.id AND a.kind = 'audio'
              AND ra.role = 'stimulus'
        ) THEN
            RAISE EXCEPTION 'Listening revision % needs an audio stimulus', NEW.id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER revision_publication_gate
BEFORE UPDATE OF status ON exercise_revisions
FOR EACH ROW EXECUTE FUNCTION validate_revision_publication();

CREATE TABLE attempts (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    type_code text NOT NULL CHECK (type_code IN
        ('R1', 'R2', 'R3', 'L1', 'L2', 'L3', 'L4', 'W1', 'W2', 'W3')),
    requested_groups integer NOT NULL CHECK (requested_groups > 0),
    timer_mode text NOT NULL CHECK (timer_mode IN ('count_up', 'count_down')),
    rules_snapshot jsonb NOT NULL CHECK (jsonb_typeof(rules_snapshot) = 'object'),
    status text NOT NULL DEFAULT 'prepared'
        CHECK (status IN ('prepared', 'in_progress', 'submitted')),
    current_position integer NOT NULL DEFAULT 1 CHECK (current_position > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    deadline_at timestamptz,
    submitted_at timestamptz,
    points_awarded numeric(10,2),
    points_possible numeric(10,2),
    CONSTRAINT attempt_lifecycle CHECK (
        (status = 'prepared' AND started_at IS NULL AND submitted_at IS NULL) OR
        (status = 'in_progress' AND started_at IS NOT NULL AND submitted_at IS NULL) OR
        (status = 'submitted' AND started_at IS NOT NULL AND submitted_at IS NOT NULL)
    ),
    CONSTRAINT attempt_totals CHECK (
        (points_awarded IS NULL AND points_possible IS NULL) OR
        (points_awarded IS NOT NULL AND points_possible IS NOT NULL
            AND points_awarded >= 0 AND points_possible > 0
            AND points_awarded <= points_possible)
    )
);

CREATE TABLE attempt_groups (
    id uuid PRIMARY KEY,
    attempt_id uuid NOT NULL REFERENCES attempts(id) ON DELETE RESTRICT,
    revision_id uuid NOT NULL REFERENCES exercise_revisions(id) ON DELETE RESTRICT,
    ordinal integer NOT NULL CHECK (ordinal > 0),
    audio_started_at timestamptz,
    audio_finished_at timestamptz,
    UNIQUE (attempt_id, ordinal),
    UNIQUE (attempt_id, revision_id),
    UNIQUE (id, attempt_id, revision_id),
    CONSTRAINT audio_order CHECK (
        audio_finished_at IS NULL OR
        (audio_started_at IS NOT NULL AND audio_finished_at >= audio_started_at)
    )
);

CREATE TABLE attempt_items (
    id uuid PRIMARY KEY,
    attempt_id uuid NOT NULL,
    group_id uuid NOT NULL,
    revision_id uuid NOT NULL,
    item_id uuid NOT NULL,
    global_position integer NOT NULL CHECK (global_position > 0),
    visit_status text NOT NULL DEFAULT 'unseen'
        CHECK (visit_status IN ('unseen', 'seen', 'answered', 'omitted')),
    response_json jsonb,
    response_version integer NOT NULL DEFAULT 0 CHECK (response_version >= 0),
    visited_at timestamptz,
    saved_at timestamptz,
    response_started_at timestamptz,
    response_deadline_at timestamptz,
    response_closed_at timestamptz,
    outcome text CHECK (outcome IN ('correct', 'incorrect', 'omitted', 'ungraded')),
    points_possible numeric(8,2) NOT NULL CHECK (points_possible >= 0),
    points_awarded numeric(8,2),
    UNIQUE (attempt_id, global_position),
    UNIQUE (group_id, item_id),
    FOREIGN KEY (group_id, attempt_id, revision_id)
        REFERENCES attempt_groups(id, attempt_id, revision_id) ON DELETE RESTRICT,
    FOREIGN KEY (revision_id, item_id)
        REFERENCES exercise_items(revision_id, id) ON DELETE RESTRICT,
    CONSTRAINT item_score_valid CHECK (
        points_awarded IS NULL OR
        (points_awarded >= 0 AND points_awarded <= points_possible)
    ),
    CONSTRAINT free_text_not_graded CHECK (
        points_possible > 0 OR
        (points_awarded IS NULL AND (outcome IS NULL OR outcome = 'ungraded'))
    ),
    CONSTRAINT response_time_order CHECK (
        response_deadline_at IS NULL OR response_started_at IS NULL OR
        response_deadline_at >= response_started_at
    )
);

CREATE TABLE writing_self_reviews (
    attempt_item_id uuid PRIMARY KEY REFERENCES attempt_items(id) ON DELETE RESTRICT,
    rubric_version text NOT NULL,
    answers jsonb NOT NULL CHECK (jsonb_typeof(answers) = 'object'),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices de las lecturas frecuentes. Las claves UNIQUE ya tienen sus índices.
CREATE INDEX exercise_catalog_idx ON exercises(section, type_code, difficulty);
CREATE INDEX published_revisions_idx
    ON exercise_revisions(exercise_id, revision_number DESC)
    WHERE status = 'published';
CREATE INDEX attempt_history_idx ON attempts(user_id, created_at DESC);
CREATE INDEX attempt_open_idx ON attempts(user_id, created_at DESC)
    WHERE status IN ('prepared', 'in_progress');
CREATE INDEX revision_assets_asset_idx ON revision_assets(asset_id);
CREATE INDEX attempt_groups_revision_idx ON attempt_groups(revision_id);
CREATE INDEX attempt_items_item_idx ON attempt_items(revision_id, item_id);

COMMIT;
