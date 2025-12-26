export type Env = {
  DISCORD_TOKEN: string;
  DISCORD_APP_ID: string;
  DISCORD_GUILD_ID?: string;
  LOG_LEVEL?: string;
};

export function loadEnv(): Env {
  const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
  const DISCORD_APP_ID = process.env.DISCORD_APP_ID;
  const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;
  const LOG_LEVEL = process.env.LOG_LEVEL;

  if (!DISCORD_TOKEN) throw new Error("Missing DISCORD_TOKEN");
  if (!DISCORD_APP_ID) throw new Error("Missing DISCORD_APP_ID");

  return { DISCORD_TOKEN, DISCORD_APP_ID, DISCORD_GUILD_ID, LOG_LEVEL };
}
