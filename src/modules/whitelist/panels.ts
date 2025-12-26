import { ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel } from "discord.js";

export async function publishWhitelistPanel(channel: TextChannel) {
  const row = new ActionRowBuilder<any>().addComponents(
    new ButtonBuilder()
      .setCustomId("whitelist:start")
      .setLabel("📜 Iniciar Whitelist")
      .setStyle(ButtonStyle.Primary),
  );

  return channel.send({
    content:
      "📜 **Whitelist**\n\n" +
      "Clique no botão abaixo para iniciar o interrogatório.\n" +
      "Responda com atenção.",
    components: [row],
  });
}


