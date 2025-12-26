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
    /* ===================== SLASH COMMANDS ===================== */
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "setup") {
        await setupCommand(interaction as ChatInputCommandInteraction);
      }
      return;
    }

    /* ===================== BOTÕES ===================== */
    if (interaction.isButton()) {
      const btn = interaction as ButtonInteraction;

      if (btn.customId.startsWith("setup:page:")) {
        await setupPageButton(btn);
        return;
      }

      if (btn.customId === "setup:publish") {
        await setupPublishButton(btn);
        return;
      }
    }

    /* ===================== SELECT MENU ===================== */
    if (interaction.isStringSelectMenu()) {
      const select = interaction as StringSelectMenuInteraction;

      if (select.customId === "setup:value") {
        await setupValueSelect(select);
        return;
      }
    }
  } catch (err) {
    console.error("Interaction error:", err);

    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({
        ephemeral: true,
        content: "❌ Ocorreu um erro ao processar esta interação.",
      });
    }
  }
}
