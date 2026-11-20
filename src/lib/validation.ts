import { z } from "zod";
import { DEMO } from "@/lib/config";

/** Discogs usernames: letters, digits, dot, dash, underscore. */
export const discogsUsernameSchema = z
  .string()
  .trim()
  .min(1, "Enter your Discogs username.")
  .max(64, "That username is too long.")
  .regex(/^[A-Za-z0-9._-]+$/, "Discogs usernames only use letters, numbers, dots, dashes, and underscores.")
  .refine((v) => !/^\.+$/.test(v), "Discogs usernames only use letters, numbers, dots, dashes, and underscores.");

export const startImportSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("discogs"), username: discogsUsernameSchema }),
  z.object({ source: z.literal("demo") }),
]);

export const importStepSchema = z.object({ jobId: z.uuid() });

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2, "Type at least 2 characters.").max(120),
});

export type UsernameIssue = "usernameEmpty" | "usernameLong" | "usernameChars";

/** The same checks as discogsUsernameSchema, as a dictionary key for the forms (validation.*). */
export function usernameIssue(value: string): UsernameIssue | null {
  const v = value.trim();
  if (!v) return "usernameEmpty";
  if (v.length > 64) return "usernameLong";
  if (!/^[A-Za-z0-9._-]+$/.test(v) || /^\.+$/.test(v)) return "usernameChars";
  return null;
}

/**
 * An import job as stored. Users can write their own job rows through the Data
 * API, so a step checks the row again before using it to call Discogs.
 */
export const storedJobSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("discogs"),
    discogs_username: discogsUsernameSchema,
    sort: z.literal("added"),
    sort_order: z.enum(["asc", "desc"]),
    max_pages: z.null(),
    next_page: z.number().int().positive().max(1000),
  }),
  z.object({
    source: z.literal("demo"),
    discogs_username: z.literal(DEMO.username),
    sort: z.literal(DEMO.sort),
    sort_order: z.literal(DEMO.sortOrder),
    max_pages: z.literal(DEMO.maxPages),
    next_page: z.number().int().positive().max(DEMO.maxPages + 1),
  }),
]);
