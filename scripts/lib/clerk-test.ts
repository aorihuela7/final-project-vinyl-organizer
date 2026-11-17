/** Helpers for scripts that act as Clerk test users (development instance only). Never print tokens. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const CLERK_API = "https://api.clerk.com/v1";

export async function clerkApi<T>(path: string, init?: RequestInit): Promise<T> {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error("CLERK_SECRET_KEY is missing.");
  const res = await fetch(`${CLERK_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Clerk ${init?.method ?? "GET"} ${path} → ${res.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body) as T;
}

export async function ensureTestUser(email: string): Promise<string> {
  const found = await clerkApi<Array<{ id: string }>>(`/users?email_address=${encodeURIComponent(email)}`);
  if (found[0]) return found[0].id;
  const created = await clerkApi<{ id: string }>("/users", {
    method: "POST",
    body: JSON.stringify({ email_address: [email], skip_password_requirement: true }),
  });
  return created.id;
}

/** A session whose short-lived token can be refreshed before each call. */
export async function openSession(userId: string) {
  const session = await clerkApi<{ id: string }>("/sessions", { method: "POST", body: JSON.stringify({ user_id: userId }) });
  return {
    async token(): Promise<string> {
      const t = await clerkApi<{ jwt: string }>(`/sessions/${session.id}/tokens`, { method: "POST", body: "{}" });
      return t.jwt;
    },
  };
}

export function supabaseAs(getToken: () => Promise<string | null>): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    accessToken: getToken,
    auth: { persistSession: false },
  } as Parameters<typeof createClient>[2]);
}
