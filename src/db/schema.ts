import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, timestamp, uniqueIndex, unique, primaryKey, foreignKey, uuid, boolean, integer, jsonb, numeric, char } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role").notNull().default("learner"),
  timezone: text("timezone").notNull().default("UTC"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("users_email_unique").on(table.email),
  check("users_role_check", sql`${table.role} in ('learner', 'editor', 'admin')`),
]);

export const session = pgTable("session", {
  id: uuid("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (table) => [index("session_user_id_idx").on(table.userId)]);

export const account = pgTable("account", {
  id: uuid("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("account_user_id_idx").on(table.userId)]);

export const verification = pgTable("verification", {
  id: uuid("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("verification_identifier_idx").on(table.identifier)]);

export const rateLimit = pgTable("rate_limit", {
  id: uuid("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

export const exercises = pgTable("exercises", {
  id: uuid("id").primaryKey(),
  section: text("section").notNull(),
  typeCode: text("type_code").notNull(),
  topic: text("topic"),
  difficulty: text("difficulty"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("exercise_section_matches_type", sql`(${t.section} = 'reading' AND ${t.typeCode} IN ('R1', 'R3')) OR (${t.section} = 'listening' AND ${t.typeCode} = 'L2') OR (${t.section} = 'writing' AND ${t.typeCode} IN ('W1', 'W2'))`),
  check("exercise_difficulty_check", sql`${t.difficulty} IN ('intro', 'intermediate', 'advanced')`),
  index("exercise_catalog_idx").on(t.section, t.typeCode, t.difficulty),
]);

export const exerciseRevisions = pgTable("exercise_revisions", {
  id: uuid("id").primaryKey(),
  exerciseId: uuid("exercise_id").notNull().references(() => exercises.id, { onDelete: "restrict" }),
  revisionNumber: integer("revision_number").notNull(),
  status: text("status").notNull().default("draft"),
  publicContent: jsonb("public_content").notNull(),
  authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "restrict" }),
  provenanceNote: text("provenance_note").notNull(),
  rightsNote: text("rights_note").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, (t) => [
  unique("exercise_revision_number_unique").on(t.exerciseId, t.revisionNumber),
  check("revision_number_positive", sql`${t.revisionNumber} > 0`),
  check("revision_status_check", sql`${t.status} IN ('draft', 'in_review', 'published', 'retired')`),
  check("revision_content_object", sql`jsonb_typeof(${t.publicContent}) = 'object'`),
  check("publication_metadata", sql`(${t.status} IN ('published', 'retired') AND ${t.reviewedBy} IS NOT NULL AND ${t.publishedAt} IS NOT NULL) OR (${t.status} IN ('draft', 'in_review') AND ${t.publishedAt} IS NULL)`),
  index("published_revisions_idx").on(t.exerciseId, t.revisionNumber).where(sql`${t.status} = 'published'`),
]);

export const assets = pgTable("assets", {
  id: uuid("id").primaryKey(),
  kind: text("kind").notNull(),
  storageKey: text("storage_key").notNull().unique(),
  mimeType: text("mime_type").notNull(),
  sha256Hex: char("sha256_hex", { length: 64 }).notNull(),
  byteSize: bigint("byte_size", { mode: "number" }).notNull(),
  durationMs: integer("duration_ms"),
  rightsNote: text("rights_note").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("asset_kind_check", sql`${t.kind} IN ('audio', 'image')`),
  check("asset_hash_check", sql`${t.sha256Hex} ~ '^[0-9a-f]{64}$'`),
  check("asset_size_check", sql`${t.byteSize} > 0`),
  check("audio_has_duration", sql`(${t.kind} <> 'audio' OR ${t.durationMs} IS NOT NULL) AND (${t.durationMs} IS NULL OR ${t.durationMs} > 0)`),
]);

export const revisionAssets = pgTable("revision_assets", {
  revisionId: uuid("revision_id").notNull().references(() => exerciseRevisions.id, { onDelete: "restrict" }),
  assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "restrict" }),
  role: text("role").notNull(),
  sortOrder: integer("sort_order").notNull().default(1),
}, (t) => [
  primaryKey({ columns: [t.revisionId, t.assetId, t.role] }),
  check("revision_asset_role_check", sql`${t.role} IN ('stimulus', 'illustration')`),
  check("revision_asset_order_check", sql`${t.sortOrder} > 0`),
  index("revision_assets_asset_idx").on(t.assetId),
]);

export const exerciseItems = pgTable("exercise_items", {
  id: uuid("id").primaryKey(),
  revisionId: uuid("revision_id").notNull().references(() => exerciseRevisions.id, { onDelete: "restrict" }),
  ordinal: integer("ordinal").notNull(),
  responseKind: text("response_kind").notNull(),
  publicPrompt: jsonb("public_prompt").notNull(),
  pointsPossible: numeric("points_possible", { precision: 8, scale: 2 }).notNull().default("1"),
}, (t) => [
  unique("item_revision_id_unique").on(t.revisionId, t.id),
  unique("item_revision_ordinal_unique").on(t.revisionId, t.ordinal),
  check("item_ordinal_positive", sql`${t.ordinal} > 0`),
  check("item_prompt_object", sql`jsonb_typeof(${t.publicPrompt}) = 'object'`),
  check("item_response_kind_check", sql`${t.responseKind} IN ('fill_word', 'single_choice', 'token_order', 'free_text')`),
  check("free_text_has_no_objective_points", sql`(${t.responseKind} = 'free_text' AND ${t.pointsPossible} = 0) OR (${t.responseKind} <> 'free_text' AND ${t.pointsPossible} > 0)`),
]);

export const answerKeys = pgTable("answer_keys", {
  revisionId: uuid("revision_id").notNull(),
  itemId: uuid("item_id").notNull(),
  acceptedAnswers: jsonb("accepted_answers").notNull(),
  scoringRule: text("scoring_rule").notNull(),
  explanation: text("explanation").notNull(),
}, (t) => [
  primaryKey({ columns: [t.revisionId, t.itemId] }),
  // The compound reference prevents a key from pointing at an item in another revision.
  foreignKey({ columns: [t.revisionId, t.itemId], foreignColumns: [exerciseItems.revisionId, exerciseItems.id], name: "answer_key_item_fk" }).onDelete("restrict"),
  check("answers_array", sql`jsonb_typeof(${t.acceptedAnswers}) = 'array'`),
  check("scoring_rule_check", sql`${t.scoringRule} IN ('exact', 'case_insensitive', 'approved_variants')`),
]);

export const reviewMaterials = pgTable("review_materials", {
  revisionId: uuid("revision_id").primaryKey().references(() => exerciseRevisions.id, { onDelete: "restrict" }),
  reviewContent: jsonb("review_content").notNull(),
}, (t) => [check("review_content_object", sql`jsonb_typeof(${t.reviewContent}) = 'object'`)]);
