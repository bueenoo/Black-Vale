import {
  ChatInputCommandInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  SlashCommandBuilder,
  GuildMember,
} from "discord.js";

import { RADIO_TYPES } from "./templates.js";
import { RADIO_CHANNEL_ID, RADIO_PUBLISH_ROLE_ID } from "./handler.js";

import {
  setRadioEvent,
  clearRadioEvent,
  addRadioBulletin,
  clearRadioBulletins,
  triggerManualBroadcast,
} from "./ghost.js";

export const radioCommandData = new SlashCommandBuilder()
  .setName("radio")
  .setDescription("Rádio: transmissão padrão + eventos + alertas + boletins.")
  .addSubcommand((s) =>
    s
      .setName("alert")
      .setDescription("🚨 Envia um alerta dinâmico imediato no rádio.")
      .addStringOption((o) =>
        o
          .setName("severity")
          .setDescription("Nível do alerta")
          .setRequired(true)
          .addChoices(
            { name: "INFO", value: "INFO" },
            { name: "WARN", value: "WARN" },
            { name: "CRITICAL", value: "CRITICAL" }
          )
      )
      .addStringOption((o) =>
        o.setName("title").setDescription("Título curto do alerta").setRequired(true)
      )
      .addStringOption((o) =>
        o
          .setName("body")
          .setDescription("Texto do alerta (o que aconteceu / onde / o que fazer)")
          .setRequired(true)
      )
  )
  .addSubcommandGroup((g) =>
    g
      .setName("event")
      .setDescription("📡 Controla a edição especial do rádio.")
      .addSubcommand((s) =>
        s
          .setName("on")
          .setDescription("Ativa edição especial do rádio.")
          .addStringOption((o) =>
            o.setName("title").setDescription("Nome do evento (ex.: Neblina Fúnebre)").setRequired(true)
          )
          .addIntegerOption((o) =>
            o
              .setName("hours")
              .setDescription("Duração do evento em horas")
              .setRequired(true)
              .setMinValue(1)
              .setMaxValue(72)
          )
          .addBooleanOption((o) =>
            o
              .setName("cult_boost")
              .setDescription("Aumenta chances de transmissões do culto (Faith’s Gate)")
              .setRequired(false)
          )
          .addIntegerOption((o) =>
            o
              .setName("extra_minutes")
              .setDescription("Transmissões extras (em minutos). Ex.: 90 = mais rádio durante evento")
              .setRequired(false)
              .setMinValue(30)
              .setMaxValue(240)
          )
      )
      .addSubcommand((s) =>
        s.setName("off").setDescription("Desativa edição especial do rádio.")
      )
  )
  .addSubcommandGroup((g) =>
    g
      .setName("bulletin")
      .setDescription("📌 Quadro de avisos (clima/tráfego/desaparecidos/facções).")
      .addSubcommand((s) =>
        s
          .setName("add")
          .setDescription("Adiciona um aviso ao quadro.")
          .addStringOption((o) =>
            o
              .setName("kind")
              .setDescription("Categoria")
              .setRequired(true)
              .addChoices(
                { name: "TRAFEGO", value: "TRAFEGO" },
                { name: "CLIMA", value: "CLIMA" },
                { name: "DESAPARECIDO", value: "DESAPARECIDO" },
                { name: "FACCAO", value: "FACCAO" }
              )
          )
          .addStringOption((o) =>
            o
              .setName("text")
              .setDescription("Texto curto do aviso (imersivo e direto)")
              .setRequired(true)
          )
      )
      .addSubcommand((s) =>
        s.setName("clear").setDescription("Limpa os avisos adicionados pela staff.")
      )
  );

function hasRadioRole(member: GuildMember | null) {
  if (!member) return false;
  return member.roles.cache.has(RADIO_PUBLISH_ROLE_ID);
}

async function requireRadioContext(i: ChatInputCommandInteraction) {
  if (i.channelId !== RADIO_CHANNEL_ID) {
    await i.reply({
      ephemeral: true,
      content: "📻 Use o comando **apenas** no canal do rádio.",
    });
    return false;
  }

  const member = i.member instanceof GuildMember ? i.member : null;
  if (!hasRadioRole(member)) {
    await i.reply({
      ephemeral: true,
      content: "⛔ Você não tem permissão para transmitir/gerenciar o rádio.",
    });
    return false;
  }

  return true;
}

export async function radioCommand(i: ChatInputCommandInteraction) {
  if (!(await requireRadioContext(i))) return;

  const sub = i.options.getSubcommand(false);
  const group = i.options.getSubcommandGroup(false);

  if (!sub && !group) {
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
    return;
  }

  if (sub === "alert") {
    const severity = i.options.getString("severity", true) as "INFO" | "WARN" | "CRITICAL";
    const title = i.options.getString("title", true);
    const body = i.options.getString("body", true);

    await i.reply({ ephemeral: true, content: "📡 Enviando alerta no rádio..." });

    await triggerManualBroadcast(i.client, i.guildId!, { title, body, severity });

    await i.editReply("✅ Alerta enviado.");
    return;
  }

  if (group === "event") {
    if (sub === "on") {
      const title = i.options.getString("title", true);
      const hours = i.options.getInteger("hours", true);
      const cultBoost = i.options.getBoolean("cult_boost") ?? false;
      const extraMinutes = i.options.getInteger("extra_minutes") ?? 0;

      const until = Date.now() + hours * 60 * 60 * 1000;

      setRadioEvent(i.guildId!, {
        active: true,
        title,
        until,
        cultBoost,
        extraFrequencyMinutes: extraMinutes > 0 ? extraMinutes : undefined,
      });

      await i.reply({
        ephemeral: true,
        content: `✅ **Edição especial ativada**: **${title}**\n⏳ Duração: **${hours}h**\n🩸 Culto boost: **${cultBoost ? "ON" : "OFF"}**\n📡 Extra rádio: **${extraMinutes ? `${extraMinutes} min` : "OFF"}**`,
      });
      return;
    }

    if (sub === "off") {
      clearRadioEvent(i.guildId!);
      await i.reply({ ephemeral: true, content: "✅ Edição especial desativada." });
      return;
    }
  }

  if (group === "bulletin") {
    if (sub === "add") {
      const kind = i.options.getString("kind", true) as "TRAFEGO" | "CLIMA" | "DESAPARECIDO" | "FACCAO";
      const text = i.options.getString("text", true);

      addRadioBulletin(i.guildId!, { kind, text });

      await i.reply({
        ephemeral: true,
        content: `✅ Aviso adicionado ao quadro.\n**${kind}:** ${text}`,
      });
      return;
    }

    if (sub === "clear") {
      clearRadioBulletins(i.guildId!);
      await i.reply({ ephemeral: true, content: "✅ Avisos do quadro (staff) limpos." });
      return;
    }
  }

  await i.reply({ ephemeral: true, content: "⚠️ Subcomando não reconhecido." });
}
