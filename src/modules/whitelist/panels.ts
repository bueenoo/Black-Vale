import { ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel } from "discord.js";

export async function publishWhitelistPanels(panelChannel: TextChannel, startChannel: TextChannel) {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("wl:request").setLabel("📜 Whitelist").setStyle(ButtonStyle.Primary)
  );

  const panelMessage = await panelChannel.send({
    content: "🕯️ **Reaja abaixo para Fazer a sua Whitelist**\nClique no botão para receber acesso e iniciar.",
    components: [row1],
  });

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("wl:start").setLabel("Iniciar Whitelist").setStyle(ButtonStyle.Success)
  );

  const startMessage = await startChannel.send({
    content: "🎙️ **Interrogatório — Iniciar Whitelist**\nClique para começar as perguntas.",
    components: [row2],
  });

  return { panelMessageId: panelMessage.id, startMessageId: startMessage.id };
}
