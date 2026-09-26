import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { answerKeys, exerciseItems, exerciseRevisions, exercises, reviewMaterials, users } from "@/db/schema";
import { betaDrafts } from "./beta-drafts";
import { revisionSchema, validatePublication } from "./schemas";

// Editorial import only. No draft is approved or published by this command.
export async function importBetaDrafts(editorEmail: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(105310)`);
    const [editor] = await tx.select({ id: users.id, emailVerified: users.emailVerified, role: users.role })
      .from(users).where(eq(users.email, editorEmail.toLowerCase())).limit(1);
    if (!editor?.emailVerified || !["editor", "admin"].includes(editor.role)) throw new Error("A verified editor or admin is required to import beta drafts");

    const created: string[] = [];
    const existing: string[] = [];
    for (const draft of betaDrafts) {
      const revision = revisionSchema.parse(draft.revision);
      const errors = validatePublication(draft.typeCode, revision);
      if (errors.length && !(draft.typeCode === "L2" && errors.length === 1 && errors[0].startsWith("Falta audio L2:"))) {
        throw new Error(`Invalid beta draft ${draft.slug}: ${errors.join("; ")}`);
      }
      const topic = `Beta draft: ${draft.slug}`;
      const [found] = await tx.select({ id: exercises.id }).from(exercises).where(eq(exercises.topic, topic)).limit(1);
      if (found) { existing.push(draft.slug); continue; }
      const exerciseId = crypto.randomUUID();
      const revisionId = crypto.randomUUID();
      await tx.insert(exercises).values({ id: exerciseId, topic, difficulty: draft.difficulty, typeCode: draft.typeCode,
        section: draft.typeCode.startsWith("R") ? "reading" : draft.typeCode === "L2" ? "listening" : "writing" });
      await tx.insert(exerciseRevisions).values({ id: revisionId, exerciseId, revisionNumber: 1, authorId: editor.id,
        publicContent: revision.publicContent, provenanceNote: revision.provenanceNote, rightsNote: revision.rightsNote });
      for (const item of revision.items) {
        const itemId = crypto.randomUUID();
        await tx.insert(exerciseItems).values({ id: itemId, revisionId, ordinal: item.ordinal, responseKind: item.responseKind,
          publicPrompt: item.publicPrompt, pointsPossible: String(item.pointsPossible) });
        if (item.key) await tx.insert(answerKeys).values({ revisionId, itemId, ...item.key });
      }
      if (revision.reviewContent) await tx.insert(reviewMaterials).values({ revisionId, reviewContent: revision.reviewContent });
      created.push(draft.slug);
    }
    return { created, existing };
  });
}
