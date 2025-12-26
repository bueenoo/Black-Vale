import { REST } from "discord.js";
import { Routes } from "discord-api-types/v10";
import type { ReturnType } from "typescript";

// imports dos commands existentes
import { setupCommandData } from "../modules/setup/setup.js";

// ✅ rádio
import { radioCommandData } from "../modules/radio/command.js";

// Se você tiver /ping e /painel como slash, importe eles aqui também:
// import { pingCommandData } from "../modules/ping/command.js";
// import { panelCommandData } from "../modules/painel/command.js";

type EnvLike = {
  DISCORD_TOKEN: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_GUILD_ID?: string;
};

export async function registerCommands(env: EnvLike) {
  if (!env.DISCORD_TOKEN) throw new Error("DISCORD_TOKEN ausente");
  if (!env.DISCORD_CLIENT_ID) throw new Error("DISCORD_CLIENT_ID ausente");
  if (!env.DISCORD_GUILD_ID) throw new Error("DISCORD_GUILD_ID ausente");

  const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);

  const commands = [
    setupCommandData,
    radioCommandData,
    // pingCommandData,
    // panelCommandData,
  ].map((c) => c.toJSON());

  await rest.put(
    Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID),
    { body: commands }
  );

  console.log(`✅ Registered GUILD commands for ${env.DISCORD_GUILD_ID}`);
}
