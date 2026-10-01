const KEY = "pickup.code";
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
export const CODE_RE = /^[a-z0-9]{10,24}$/;

export function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function normaliseCode(v: string): string {
  return v.trim().toLowerCase();
}

export function loadCode(): string {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored && CODE_RE.test(stored)) return stored;
  } catch {
    /* storage can be blocked; fall through to a fresh code */
  }
  const code = newCode();
  saveCode(code);
  return code;
}

export function saveCode(code: string): void {
  try {
    localStorage.setItem(KEY, code);
  } catch {
    /* the code still works for this tab */
  }
}
