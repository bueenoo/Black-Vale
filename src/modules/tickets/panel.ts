import { ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel } from "discord.js";

export async function publishTicketPanel(channel: TextChannel) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("ticket:create:support").setLabel("🛠 Suporte").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ticket:create:report").setLabel("🚨 Denúncia").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("ticket:create:donation").setLabel("💰 Doações").setStyle(ButtonStyle.Success),
  );

  return channel.send({
    content: "🎫 **Central de Atendimento**\nSelecione uma opção:",
    components: [row],
  });
}

