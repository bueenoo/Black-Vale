import { REST, Routes } from "discord.js";
import type { Env } from "../core/env.js";
import { commands } from "./commands.js";

type JsonableCommand = { toJSON: () => unknown };

export async function registerCommands(env: Env) {
  const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);
  const body = (commands as unknown as JsonableCommand[]).map((c) => c.toJSON());

  if (env.DISCORD_GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(env.DISCORD_APP_ID, env.DISCORD_GUILD_ID), { body });
    console.log(`✅ Registered GUILD commands for ${env.DISCORD_GUILD_ID}`);
    return;
  }

  await rest.put(Routes.applicationCommands(env.DISCORD_APP_ID), { body });
  console.log("✅ Registered GLOBAL commands");
}
