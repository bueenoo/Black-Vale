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
    /* =========================
       SLASH COMMANDS
    ========================= */
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "setup") {
        await setupCommand(interaction);
        return;
      }
    }

    /* =========================
       SELECT MENUS
    ========================= */
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith("setup:")) {
        await setupValueSelect(interaction);
        return;
      }
    }

    /* =========================
       BUTTONS
    ========================= */
    if (interaction.isButton()) {
      if (interaction.customId.startsWith("setup:page:")) {
        await setupPageButton(interaction);
        return;
      }

      if (interaction.customId.startsWith("setup:publish")) {
        await setupPublishButton(interaction);
        return;
      }
    }
  } catch (error) {
    console.error("Interaction error:", error);

    if (
      interaction.isRepliable() &&
      !interaction.replied &&
      !interaction.deferred
    ) {
      await interaction.reply({
        content: "❌ Ocorreu um erro ao processar esta interação.",
        ephemeral: true,
      }).catch(() => {});
    }
  }
}
