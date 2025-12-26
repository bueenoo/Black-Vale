import { ButtonInteraction } from "discord.js";

export async function whitelistStartButton(interaction: ButtonInteraction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
  }

  await interaction.editReply({
    content:
      "✅ Whitelist iniciada.\n\n" +
      "⚠️ (Handler OK) Agora falta plugar o interrogatório/perguntas.\n" +
      "Se você quiser, eu te envio o fluxo completo com perguntas em cadeia + envio pro staff.",
  });
}
