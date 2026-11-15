import { z } from "zod";

/** Discogs usernames: letters, digits, dot, dash, underscore. */
export const discogsUsernameSchema = z
  .string()
  .trim()
  .min(1, "Enter your Discogs username.")
  .max(64, "That username is too long.")
  .regex(/^[A-Za-z0-9._-]+$/, "Discogs usernames only use letters, numbers, dots, dashes, and underscores.");

export const startImportSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("discogs"), username: discogsUsernameSchema }),
  z.object({ source: z.literal("demo") }),
]);

export const importStepSchema = z.object({ jobId: z.uuid() });

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2, "Type at least 2 characters.").max(120),
});
