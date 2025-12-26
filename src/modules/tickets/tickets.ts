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

// ✅ transcript simples (HTML) sem depender de outro arquivo
async function buildHtmlTranscript(channel: TextChannel) {
  const msgs = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  const arr = msgs ? Array.from(msgs.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp) : [];

  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const rows = arr
    .map((m) => {
      const time = new Date(m.createdTimestamp).toISOString();
      const author = `${m.author.username}#${m.author.discriminator}`;
      const content = m.content ? escape(m.content) : "";
      const attachments = m.attachments.size
        ? `<div class="att">📎 ${Array.from(m.attachments.values())
            .map((a) => `<a href="${escape(a.url)}">${escape(a.name ?? "file")}</a>`)
            .join(" | ")}</div>`
        : "";
      return `<div class="msg"><div class="meta"><b>${escape(author)}</b> <span>${escape(time)}</span></div><div class="txt">${content || "<i>(sem texto)</i>"}</div>${attachments}</div>`;
    })
    .join("\n");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Transcript ${escape(channel.name)}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;background:#0b0f17;color:#e6e6e6;padding:20px}
h1{font-size:18px}
.msg{padding:10px;border:1px solid #222b3a;border-radius:10px;margin:10px 0;background:#0f1626}
.meta{font-size:12px;opacity:.9;margin-bottom:6px;display:flex;gap:10px;align-items:center}
.meta span{opacity:.7}
.txt{white-space:pre-wrap;font-size:14px}
.att{margin-top:6px;font-size:12px;opacity:.9}
a{color:#7dd3fc}
</style>
</head>
<body>
<h1>Transcript: #${escape(channel.name)} (${escape(channel.id)})</h1>
${rows || "<i>Nenhuma mensagem encontrada.</i>"}
</body>
</html>`;
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

    // transcript html
    const html = await buildHtmlTranscript(channel);

    // envia no canal de log
    if (logChannelId) {
      const logCh = await guild.channels.fetch(logChannelId).catch(() => null);
      if (logCh && logCh.isTextBased()) {
        await logCh.send({
          content: `📄 Transcript do ticket **${ticketId}** | <@${ticket.userId}> | <#${ticket.channelId}>`,
          files: [{ attachment: Buffer.from(html, "utf-8"), name: `ticket-${ticketId}.html` }],
        });
      }
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
