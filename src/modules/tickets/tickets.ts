import {
  ButtonInteraction,
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextChannel,
  EmbedBuilder,
} from "discord.js";

import { prisma } from "../../core/prisma.js";
import { buildHtmlTranscript } from "./transcript.js";

type TicketKind = "support" | "report" | "donation";

function safeName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

async function replySafe(i: ButtonInteraction, content: string) {
  if (i.deferred || i.replied) {
    await i.followUp({ content, ephemeral: true });
  } else {
    await i.reply({ content, ephemeral: true });
  }
}

function getKindLabel(kind: TicketKind) {
  if (kind === "support") return "Suporte Técnico";
  if (kind === "report") return "Denúncia";
  return "Doações";
}

function closeRow(ticketId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket:close:${ticketId}`)
      .setLabel("🔒 Fechar ticket")
      .setStyle(ButtonStyle.Danger)
  );
}

export async function handleTicketButton(i: ButtonInteraction) {
  // ✅ ESSENCIAL: evita "Esta interação falhou"
  if (!i.deferred && !i.replied) {
    await i.deferReply({ ephemeral: true });
  }

  const guild = i.guild;
  if (!guild) return replySafe(i, "⚠️ Isso só funciona dentro de um servidor.");

  const member = i.member;
  const user = i.user;

  // Carrega config do servidor
  const cfg = await prisma.guildConfig.findUnique({
    where: { guildId: guild.id },
  });

  if (!cfg?.ticketPanelChannelId || !cfg?.ticketCategoryId) {
    return replySafe(
      i,
      "⚠️ Tickets não configurados. Use /setup e configure: painel + categoria + staff role."
    );
  }

  if (!cfg.staffRoleId) {
    return replySafe(
      i,
      "⚠️ Cargo de staff não configurado. Use /setup e defina o cargo staff."
    );
  }

  const staffRoleId = cfg.staffRoleId;
  const categoryId = cfg.ticketCategoryId;
  const logChannelId = cfg.ticketLogChannelId ?? null;
  const deleteDelaySec = cfg.ticketDeleteDelaySec ?? 10;

  // === CREATE ===
  // customIds esperados:
  // ticket:create:support
  // ticket:create:report
  // ticket:create:donation
  if (i.customId.startsWith("ticket:create:")) {
    const kindStr = i.customId.split(":")[2] as TicketKind;
    const kind: TicketKind =
      kindStr === "support" || kindStr === "report" || kindStr === "donation"
        ? kindStr
        : "support";

    // cria canal
    const base = `ticket-${kind}-${safeName(user.username)}-${user.id.slice(-4)}`;

    // permissões privadas: @everyone deny, user allow, staff allow
    const channel = await guild.channels.create({
      name: base,
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
          ],
        },
        {
          id: staffRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageMessages,
          ],
        },
      ],
    });

    // salva no banco
    const created = await prisma.ticket.create({
      data: {
        guildId: guild.id,
        channelId: channel.id,
        userId: user.id,
        type: kind, // seu schema precisa ter Ticket.type String (ou enum) — se for diferente, me diga e eu ajusto
        status: "OPEN",
      },
    });

    const embed = new EmbedBuilder()
      .setTitle(`🎫 Ticket — ${getKindLabel(kind)}`)
      .setDescription(
        [
          `Olá <@${user.id}>! Seu ticket foi criado.`,
          "",
          `**Tipo:** ${getKindLabel(kind)}`,
          `**Staff:** <@&${staffRoleId}>`,
          "",
          "Explique seu caso aqui. Quando terminar, clique em **Fechar ticket**.",
        ].join("\n")
      );

    await (channel as TextChannel).send({
      embeds: [embed],
      components: [closeRow(created.id)],
    });

    return replySafe(i, `✅ Ticket criado: <#${channel.id}>`);
  }

  // === CLOSE ===
  // ticket:close:<ticketId>
  if (i.customId.startsWith("ticket:close:")) {
    const ticketId = i.customId.split(":")[2];

    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) return replySafe(i, "⚠️ Ticket não encontrado.");

    const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) {
      return replySafe(i, "⚠️ Canal do ticket não encontrado.");
    }

    // evita fechar repetido
    if (ticket.status === "CLOSED") {
      return replySafe(i, "✅ Esse ticket já foi fechado.");
    }

    // transcript HTML
    const html = await buildHtmlTranscript(channel as TextChannel);

    // envia transcript no canal de log (se configurado)
    if (logChannelId) {
      const logCh = await guild.channels.fetch(logChannelId).catch(() => null);
      if (logCh && logCh.isTextBased()) {
        await logCh.send({
          content: `📄 Transcript do ticket **${ticketId}** | <@${ticket.userId}> | <#${ticket.channelId}>`,
          files: [
            {
              attachment: Buffer.from(html, "utf-8"),
              name: `ticket-${ticketId}.html`,
            },
          ],
        });
      }
    }

    // marca como fechado
    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        closedById: i.user.id, // seu schema precisa ter closedById String? — se for diferente, eu ajusto
      },
    });

    // avisa e agenda delete
    await (channel as TextChannel).send("🔒 Ticket fechado. Este canal será removido em instantes.");

    // remove permissões do usuário (opcional: deixa apenas staff)
    await (channel as TextChannel).permissionOverwrites.edit(ticket.userId, {
      ViewChannel: false,
    });

    setTimeout(async () => {
      try {
        await (channel as TextChannel).delete("Ticket fechado");
      } catch {
        // ignore
      }
    }, Math.max(5, deleteDelaySec) * 1000);

    return replySafe(i, "✅ Ticket fechado e transcript enviado.");
  }

  return replySafe(i, "⚠️ Ação de ticket inválida.");
}
