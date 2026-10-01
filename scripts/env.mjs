// Loads .env.local, then .env. Existing process env wins. Never prints values.
import { existsSync } from "node:fs";
for (const f of [".env.local", ".env"]) if (existsSync(f)) process.loadEnvFile(f);
