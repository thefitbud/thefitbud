import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { libraryIdRedirects } from "../db/schema";

export async function resolveLibraryId(
  db: Db,
  id: string,
): Promise<{ id: string; redirectedFrom?: string }> {
  const rows = await db
    .select()
    .from(libraryIdRedirects)
    .where(eq(libraryIdRedirects.oldId, id))
    .limit(1);
  const redirect = rows[0];
  if (!redirect) {
    return { id };
  }
  return { id: redirect.newId, redirectedFrom: id };
}
