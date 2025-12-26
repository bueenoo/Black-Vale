import { ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel } from "discord.js";

export async function publishWhitelistPanel(channel: TextChannel) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("whitelist:start")
      .setLabel("📜 Iniciar Whitelist")
      .setStyle(ButtonStyle.Primary),
  );

  const message = await channel.send({
    content:
      "📜 **Whitelist — Início**\n\n" +
      "Clique no botão abaixo para iniciar o interrogatório.\n" +
      "Responda com atenção — o Vale não perdoa mentiras.",
    components: [row],
  });

  return message;
}
