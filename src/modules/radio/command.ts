import {
  ChatInputCommandInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  SlashCommandBuilder,
  GuildMember,
} from "discord.js";
import { RADIO_TYPES } from "./templates.js";
import { RADIO_CHANNEL_ID, RADIO_PUBLISH_ROLE_ID } from "./handler.js";

export const radioCommandData = new SlashCommandBuilder()
  .setName("radio")
  .setDescription("Enviar uma transmissão imersiva no rádio (formato padrão).");

function hasRadioRole(member: GuildMember | null) {
  if (!member) return false;
  return member.roles.cache.has(RADIO_PUBLISH_ROLE_ID);
}

export async function radioCommand(i: ChatInputCommandInteraction) {
  if (i.channelId !== RADIO_CHANNEL_ID) {
    await i.reply({ ephemeral: true, content: "📻 Use o comando **apenas** no canal do rádio." });
    return;
  }

  const member = i.member instanceof GuildMember ? i.member : null;
  if (!hasRadioRole(member)) {
    await i.reply({ ephemeral: true, content: "⛔ Você não tem permissão para transmitir no rádio." });
    return;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId("radio:type_select")
    .setPlaceholder("Selecione o tipo de transmissão…")
    .addOptions(
      RADIO_TYPES.map((t) => ({
        label: t.label,
        value: t.value,
        description: t.desc,
      }))
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

  await i.reply({
    ephemeral: true,
    content:
      "📻 **RÁDIO DE BITTERROOT**\nSelecione o tipo de transmissão. Depois você escreve a mensagem e eu formato.",
    components: [row],
  });
}
