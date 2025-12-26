import { ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel } from "discord.js";

export async function publishTicketPanel(channel: TextChannel) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("ticket:create:support").setLabel("🛠 Suporte Técnico").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ticket:create:report").setLabel("🚨 Denúncia").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("ticket:create:donation").setLabel("💰 Doações").setStyle(ButtonStyle.Success),
  );

  const message = await channel.send({
    content: "🎫 **Central de Atendimento**\n\nSelecione abaixo o tipo de ticket que deseja abrir:",
    components: [row],
  });

  return message;
}
