import { Client, GatewayIntentBits } from "discord.js";
import { loadEnv } from "./core/env.js";
import { prisma } from "./core/prisma.js";
import { registerCommands } from "./slash/register.js";
import { handleInteraction } from "./handlers/interactionCreate.js";
import { createLogger } from "./core/logger.js";
import { ensureGuildConfig } from "./core/seed.js";

async function main() {
  const env = loadEnv();
  const log = createLogger(env.LOG_LEVEL ?? "info");

  await prisma.$connect();

  if (env.DISCORD_GUILD_ID) {
    await ensureGuildConfig(env.DISCORD_GUILD_ID);
  }

  await registerCommands(env);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  globalThis.__blackbot_client = client;

  client.once("clientReady", () => {
    log.info({ tag: client.user?.tag }, "Ready");
    console.log(`Ready as ${client.user?.tag}`);
  });

  client.on("interactionCreate", handleInteraction);

  await client.login(env.DISCORD_TOKEN);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
