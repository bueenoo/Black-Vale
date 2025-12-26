import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CategoryChannel,
  ChannelType,
  PermissionFlagsBits,
  TextChannel,
} from "discord.js";
import { prisma } from "../../core/prisma.js";
import { buildTranscriptHTML } from "./transcript.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { TicketStatus, TicketType } from "@prisma/client";

function ticketTypeFromCustomId(customId: string): TicketType {
  const t = customId.split(":")[2];
  if (t === "support") return TicketType.SUPPORT;
  if (t === "report") return TicketType.REPORT;
  return TicketType.DONATION;
}

function niceType(t: TicketType) {
  if (t === TicketType.SUPPORT) return "suporte";
  if (t === TicketType.REPORT) return "denúncia";
  return "doações";
}

export async function createTicketFromButton(interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  if (!guild) return interaction.editReply("❌ Use em um servidor.");

  const cfg = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });
  if (!cfg?.ticketCategoryId || !cfg.staffRoleId) {
    await interaction.editReply("❌ Tickets não configurados (ticketCategoryId/staffRoleId).");
    return;
  }

  const existing = await prisma.ticket.findFirst({
    where: { guildId: guild.id, userId: interaction.user.id, status: TicketStatus.OPEN },
  });
  if (existing) {
    await interaction.editReply("⚠️ Você já tem um ticket aberto.");
    return;
  }

  const type = ticketTypeFromCustomId(interaction.customId);
  const category = guild.channels.cache.get(cfg.ticketCategoryId) as CategoryChannel | undefined;
  if (!category || category.type !== ChannelType.GuildCategory) {
    await interaction.editReply("❌ Categoria de tickets inválida.");
    return;
  }

  const channelName = `ticket-${niceType(type)}-${interaction.user.username}`
    .toLowerCase()
    .replace(/[^a-z0-9\-]/g, "-")
    .slice(0, 90);

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      {
        id: cfg.staffRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
        ],
      },
    ],
  });

  const ticket = await prisma.ticket.create({
    data: { guildId: guild.id, userId: interaction.user.id, channelId: channel.id, type },
  });

  const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ticket:close:${ticket.id}`).setStyle(ButtonStyle.Secondary).setLabel("🔒 Fechar Ticket")
  );

  await (channel as TextChannel).send({
    content: `🎫 Ticket de **${niceType(type)}** criado por <@${interaction.user.id}>.\nExplique seu caso e a staff irá responder.`,
    components: [closeRow],
  });

  await interaction.editReply(`✅ Ticket criado: <#${channel.id}>`);
}

export async function closeTicketFromButton(interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  if (!guild) return interaction.editReply("❌ Use em um servidor.");

  const ticketId = interaction.customId.split(":")[2];
  if (!ticketId) return interaction.editReply("❌ Ticket inválido.");

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket || ticket.guildId !== guild.id) return interaction.editReply("❌ Ticket não encontrado.");
  if (ticket.status === TicketStatus.CLOSED) return interaction.editReply("⚠️ Este ticket já foi fechado.");

  const cfg = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });
  const channel = guild.channels.cache.get(ticket.channelId) as TextChannel | undefined;
  if (!channel) return interaction.editReply("⚠️ Canal já não existe.");

  const isStaff =
    !!cfg?.staffRoleId &&
    interaction.member?.roles &&
    "cache" in interaction.member.roles &&
    interaction.member.roles.cache.has(cfg.staffRoleId);
  const isOwner = interaction.user.id === ticket.userId;
  if (!isOwner && !isStaff) return interaction.editReply("❌ Você não tem permissão para fechar este ticket.");

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { status: TicketStatus.CLOSED, closedAt: new Date(), closedById: interaction.user.id },
  });

  const html = await buildTranscriptHTML(channel, 200);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "blackbot-"));
  const filePath = path.join(tmpDir, `transcript-${channel.name}.html`);
  await fs.writeFile(filePath, html, "utf8");

  const user = await guild.members.fetch(ticket.userId).then((m) => m.user).catch(() => null);
  if (user) {
    try {
      await user.send({ content: "📄 Aqui está a transcript do seu ticket.", files: [filePath] });
    } catch {
      await channel.send("⚠️ Não consegui enviar DM com a transcript (DM fechada).");
    }
  }

  if (cfg?.ticketLogChannelId) {
    const logCh = guild.channels.cache.get(cfg.ticketLogChannelId) as TextChannel | undefined;
    if (logCh) {
      await logCh.send({
        content: `📄 Transcript do ticket <#${channel.id}> (fechado por <@${interaction.user.id}>)`,
        files: [filePath],
      });
    }
  }

  const delaySec = cfg?.ticketDeleteDelaySec ?? 10;
  await channel.send(`🔒 Ticket fechado por <@${interaction.user.id}>. Este canal será deletado em ${delaySec}s.`);
  await interaction.editReply("✅ Ticket fechado. Transcript gerada.");

  setTimeout(async () => {
    try {
      await channel.delete("Ticket closed");
    } catch {}
  }, delaySec * 1000);
}
