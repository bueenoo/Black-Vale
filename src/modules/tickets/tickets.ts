import {
  ButtonInteraction,
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextChannel,
  EmbedBuilder,
  AttachmentBuilder,
} from "discord.js";

import { prisma } from "../../core/prisma.js";
import { TicketType } from "@prisma/client";

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

function labelForType(t: TicketType) {
  if (t === "SUPPORT") return "Suporte Técnico";
  if (t === "REPORT") return "Denúncia";
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

async function fetchAllMessages(channel: TextChannel) {
  const all = [] as any[];
  let lastId: string | undefined;

  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
    if (!batch || batch.size === 0) break;
    const arr = Array.from(batch.values());
    all.push(...arr);
    lastId = arr[arr.length - 1]?.id;
    if (batch.size < 100) break;
  }

  all.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  return all;
}

// ✅ transcript em .TXT (todas as mensagens + links de anexos/imagens)
async function buildTxtTranscript(channel: TextChannel) {
  const msgs = await fetchAllMessages(channel);

  const lines: string[] = [];
  lines.push("=== BLACKBOT | TRANSCRIPT DE TICKET ===");
  lines.push(`Canal: #${channel.name}`);
  lines.push(`ID: ${channel.id}`);
  lines.push(`Gerado em: ${new Date().toISOString()}`);
  lines.push("======================================");
  lines.push("");

  for (const m of msgs) {
    const ts = new Date(m.createdTimestamp).toISOString();
    lines.push(`[${ts}] ${m.author.tag} (${m.author.id})`);

    if (m.content?.trim()) {
      lines.push(m.content);
    }

    if (m.attachments?.size) {
      for (const a of m.attachments.values()) {
        lines.push(`(ANEXO) ${a.name ?? "arquivo"} -> ${a.url}`);
      }
    }

    if (m.embeds?.length) {
      for (const e of m.embeds) {
        if (e.title) lines.push(`(EMBED) ${e.title}`);
        if (e.description) lines.push(`(EMBED) ${e.description}`);
      }
    }

    lines.push("");
  }

  const content = lines.join("\n");
  return new AttachmentBuilder(Buffer.from(content, "utf-8"), {
    name: `transcript-${channel.id}.txt`,
  });
}

function parseTypeFromCustomId(customId: string): TicketType | null {
  // esperado: ticket:create:support|report|donation
  if (!customId.startsWith("ticket:create:")) return null;
  const raw = customId.split(":")[2];
  if (raw === "support") return "SUPPORT";
  if (raw === "report") return "REPORT";
  if (raw === "donation") return "DONATION";
  return null;
}

export async function handleTicketButton(i: ButtonInteraction) {
  // ✅ ESSENCIAL: evita "Esta interação falhou"
  if (!i.deferred && !i.replied) {
    await i.deferReply({ ephemeral: true });
  }

  const guild = i.guild;
  if (!guild) return replySafe(i, "⚠️ Isso só funciona dentro de um servidor.");

  const user = i.user;

  const cfg = await prisma.guildConfig.findUnique({
    where: { guildId: guild.id },
  });

  if (!cfg?.ticketCategoryId || !cfg?.staffRoleId) {
    return replySafe(
      i,
      "⚠️ Tickets não configurados. Use /setup e configure: categoria + cargo staff (+ canal de logs opcional)."
    );
  }

  const staffRoleId = cfg.staffRoleId;
  const categoryId = cfg.ticketCategoryId;
  const logChannelId = cfg.ticketLogChannelId ?? null;
  const deleteDelaySec = cfg.ticketDeleteDelaySec ?? 10;

  // ===== CREATE =====
  if (i.customId.startsWith("ticket:create:")) {
    const type = parseTypeFromCustomId(i.customId);
    if (!type) return replySafe(i, "⚠️ Tipo de ticket inválido.");

    const base = `ticket-${type.toLowerCase()}-${safeName(user.username)}-${user.id.slice(-4)}`;

    const channel = await guild.channels.create({
      name: base,
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
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

    const created = await prisma.ticket.create({
      data: {
        guildId: guild.id,
        channelId: channel.id,
        userId: user.id,
        type,
        status: "OPEN",
      },
    });

    const embed = new EmbedBuilder()
      .setTitle(`🎫 Ticket — ${labelForType(type)}`)
      .setDescription(
        [
          `Olá <@${user.id}>! Seu ticket foi criado.`,
          "",
          `**Tipo:** ${labelForType(type)}`,
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

  // ===== CLOSE =====
  if (i.customId.startsWith("ticket:close:")) {
    const ticketId = i.customId.split(":")[2];

    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) return replySafe(i, "⚠️ Ticket não encontrado.");

    if (ticket.status === "CLOSED") {
      return replySafe(i, "✅ Esse ticket já foi fechado.");
    }

    const ch = await guild.channels.fetch(ticket.channelId).catch(() => null);
    if (!ch || ch.type !== ChannelType.GuildText) {
      return replySafe(i, "⚠️ Canal do ticket não encontrado.");
    }

    const channel = ch as TextChannel;

    // transcript TXT (todas as mensagens + links de anexos)
    const transcript = await buildTxtTranscript(channel);

    // envia no canal de log
    if (logChannelId) {
      const logCh = await guild.channels.fetch(logChannelId).catch(() => null);
      if (logCh && logCh.isTextBased()) {
        await logCh.send({
          content: `📄 Transcript do ticket **${ticketId}** | <@${ticket.userId}> | <#${ticket.channelId}>`,
          files: [transcript],
        });
      }
    }

    // envia no DM da pessoa que abriu o ticket
    try {
      const opener = await i.client.users.fetch(ticket.userId);
      await opener.send({
        content: "📄 Aqui está o transcript do seu ticket (mensagens + anexos) para referência futura:",
        files: [transcript],
      });
    } catch {
      // DM fechada/bloqueada
    }

    // atualiza ticket
    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        closedById: i.user.id,
      },
    });

    await channel.send("🔒 Ticket fechado. Este canal será removido em instantes.");

    // remove visibilidade do usuário
    await channel.permissionOverwrites.edit(ticket.userId, { ViewChannel: false });

    setTimeout(async () => {
      try {
        await channel.delete("Ticket fechado");
      } catch {
        // ignore
      }
    }, Math.max(5, deleteDelaySec) * 1000);

    return replySafe(i, "✅ Ticket fechado e transcript enviado.");
  }

  return replySafe(i, "⚠️ Ação de ticket inválida.");
}
