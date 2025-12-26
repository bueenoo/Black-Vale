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

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  // ✅ expõe o client globalmente (compatível com o setup.ts)
  (globalThis as any).client = client;
  (globalThis as any).__blackbot_client = client;

  client.once("clientReady", async () => {
    log.info({ tag: client.user?.tag }, "Ready");
    console.log(`Ready as ${client.user?.tag}`);

    // ✅ registra/atualiza APENAS o comando /radio (sem sobrescrever os existentes)
    try {
      await registerCommands(client, env);
    } catch (err) {
      console.error("Command registration error:", err);
      log.error({ err }, "Command registration error");
    }
  });

  client.on("interactionCreate", handleInteraction);

  await client.login(env.DISCORD_TOKEN);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
