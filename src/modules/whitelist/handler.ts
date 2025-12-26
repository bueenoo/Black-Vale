import { ButtonInteraction } from "discord.js";

export async function whitelistStartButton(interaction: ButtonInteraction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
  }

  await interaction.editReply({
    content:
      "✅ Whitelist iniciada!\n\n" +
      "Agora a gente pluga o interrogatório (perguntas em cadeia) + envio pro staff.",
  });
}
