import type { Client } from "discord.js";
import type { loadEnv } from "../core/env.js";
import { radioCommandData } from "../modules/radio/command.js";

type Env = ReturnType<typeof loadEnv>;

export async function registerCommands(client: Client, env: Env) {
  if (!client.application) throw new Error("client.application indisponível (chame após clientReady).");
  if (!env.DISCORD_GUILD_ID) throw new Error("DISCORD_GUILD_ID ausente no .env");

  const guildId = env.DISCORD_GUILD_ID;

  // Fetch comandos atuais do guild (NÃO sobrescreve /ping, /setup, /painel)
  const existing = await client.application.commands.fetch({ guildId });

  const desired = radioCommandData.toJSON();
  const found = existing.find((c) => c.name === "radio");

  if (!found) {
    await client.application.commands.create(desired as any, guildId);
    console.log("✅ /radio criado (guild)");
    return;
  }

  await client.application.commands.edit(found.id, desired as any, guildId);
  console.log("✅ /radio atualizado (guild)");
}
