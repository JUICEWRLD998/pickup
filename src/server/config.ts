export const CODE_RE = /^[a-z0-9]{10,24}$/;
export const validCode = (v: unknown): v is string => typeof v === "string" && CODE_RE.test(v);

/** One namespace per memory code. The code is the only thing a second device needs. */
export const namespaceFor = (code: string): string => `pickup-${code}`;

export class ConfigError extends Error {}

export interface ServerEnv {
  openrouterKey: string;
  memwalKey: string;
  memwalAccountId: string;
  memwalServerUrl: string;
}

/** Names the variable that is missing, never its value. */
export function serverEnv(env: Record<string, string | undefined> = process.env): ServerEnv {
  const need = (name: string): string => {
    const v = env[name];
    if (!v) throw new ConfigError(`${name} is not set on the server`);
    return v;
  };
  return {
    openrouterKey: need("OPENROUTER_API_KEY"),
    memwalKey: need("MEMWAL_KEY"),
    memwalAccountId: need("MEMWAL_ACCOUNT_ID"),
    memwalServerUrl: env.MEMWAL_SERVER_URL || "https://relayer.memory.walrus.xyz",
  };
}
