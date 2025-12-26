import {
  Interaction,
  ChatInputCommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
} from "discord.js";

import {
  setupCommand,
  setupPageButton,
  setupPublishButton,
  setupValueSelect,
} from "../modules/setup/setup.js";

export async function handleInteraction(interaction: Interaction) {
  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      const cmd = interaction as ChatInputCommandInteraction;

      if (cmd.commandName === "setup") {
        return await setupCommand(cmd);
      }

      // outros comandos aqui...
      return;
    }

    // Buttons
    if (interaction.isButton()) {
      const btn = interaction as ButtonInteraction;

      if (btn.customId.startsWith("setup:page:")) return await setupPageButton(btn);
      if (btn.customId === "setup:publish") return await setupPublishButton(btn);

      // aqui entram tickets/whitelist depois
      return;
    }

    // Select menus
    if (interaction.isStringSelectMenu()) {
      const sel = interaction as StringSelectMenuInteraction;

      if (sel.customId === "setup:value") return await setupValueSelect(sel);

      return;
    }
  } catch (err) {
    console.error("Interaction error:", err);
    // não tente reply aqui se já respondeu
  }
}
