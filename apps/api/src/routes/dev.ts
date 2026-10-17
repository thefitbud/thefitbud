import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { Hono } from "hono";
import { createDb } from "../db/client";
import { devMailOutbox } from "../db/schema";
import { ok } from "../lib/envelope";
import { fail } from "../lib/envelope";
import { operation } from "../openapi/document";
import type { Env, Variables } from "../types";

const devMailQuerySchema = z.object({
  to: z.string().email().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const devMailListSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      to: z.string(),
      template: z.string(),
      subject: z.string(),
      textBody: z.string(),
      createdAt: z.string(),
    }),
  ),
});

export const devRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

devRoutes.get(
  "/mail",
  operation({
    tag: "Dev",
    summary: "List dev mail outbox (local only)",
    security: "public",
    response: devMailListSchema,
  }),
  async (c) => {
    if (c.env.ENVIRONMENT !== "local") {
      return fail(c, 404, "NOT_FOUND", "Not found.");
    }
    const parsed = devMailQuerySchema.safeParse({
      to: c.req.query("to"),
      limit: c.req.query("limit"),
    });
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid query.");
    }
    const db = createDb(c.env.DB);
    const rows = parsed.data.to
      ? await db
          .select()
          .from(devMailOutbox)
          .where(eq(devMailOutbox.toAddress, parsed.data.to.toLowerCase()))
          .orderBy(desc(devMailOutbox.createdAt))
          .limit(parsed.data.limit)
      : await db
          .select()
          .from(devMailOutbox)
          .orderBy(desc(devMailOutbox.createdAt))
          .limit(parsed.data.limit);
    return ok(c, {
      items: rows.map((row) => ({
        id: row.id,
        to: row.toAddress,
        template: row.template,
        subject: row.subject,
        textBody: row.textBody,
        createdAt: row.createdAt,
      })),
    });
  },
);
