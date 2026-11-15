/** A Discogs username typed before signing up, kept until the import starts. */
const KEY = "ro:pending-import";

export function setPendingImport(username: string) {
  try {
    localStorage.setItem(KEY, username);
  } catch {
    // Storage can be unavailable (private mode); the user can type it again.
  }
}

export function takePendingImport(): string | null {
  try {
    const value = localStorage.getItem(KEY);
    if (value) localStorage.removeItem(KEY);
    return value;
  } catch {
    return null;
  }
}

export function peekPendingImport(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
