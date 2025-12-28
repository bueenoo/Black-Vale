import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  Message,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionsBitField,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

import { prisma } from "../../core/prisma.js";

/*
 BLACKBOT — WHITELIST PRIVADA E CONTÍNUA
 - Thread PRIVADA por padrão
 - DM fallback
 - Perguntas contínuas (mensagem normal)
 - Ao finalizar:
   ✅ envia submissão para staff (canal configurado ou fallback)
   ✅ fecha thread (PrivateThread: archive | PublicThread: lock+archive)
 - Staff:
   ✅ Aprovar (dá cargo aprovado se configurado, remove pré-resultado/rejeitado)
   ✅ Reprovar (pede motivo via modal, dá cargo rejeitado se configurado)
*/

const QUESTIONS = [
  {
    key: "nome",
    title: "Pergunta 1/7",
    text: "🧍 **Quem é você?**\nDiga o nome que sobrou depois que o mundo acabou.",
    max: 80,
  },
  {
    key: "origem",
    title: "Pergunta 2/7",
    text: "🌍 **De onde você veio?**\nO que aconteceu lá e por que você nunca voltou?",
    max: 800,
  },
  {
    key: "sobrevivencia",
    title: "Pergunta 3/7",
    text: "🩸 **O que você fez para sobreviver?**\nAqui ninguém está limpo. E você?",
    max: 800,
  },
  {
    key: "confianca",
    title: "Pergunta 4/7",
    text: "🤝 **Em quem você confia hoje?**\nPessoas, grupos ou só em si mesmo? Explique.",
    max: 500,
  },
  {
    key: "limite",
    title: "Pergunta 5/7",
    text: "⚖️ **Até onde você iria para viver mais um dia?**",
    max: 500,
  },
  {
    key: "medo",
    title: "Pergunta 6/7",
    text: "🕯️ **O que seu personagem mais teme perder agora?**",
    max: 300,
  },
  {
    key: "steamId",
    title: "Pergunta 7/7",
    text: "🆔 **SteamID64 (obrigatório)**\nEnvie 17 dígitos (apenas números).",
    max: 32,
  },
] as const;

// Fallback fixo (caso não haja config no banco)
const APPROVAL_CHANNEL_ID_FALLBACK = "1453867163612872824";

function isSteamId64(v: string) {
  return /^\d{17}$/.test(v.trim());
}

function questionEmbed(step: number) {
  const q = QUESTIONS[step];
  return new EmbedBuilder()
    .setTitle("Whitelist — Vale dos Ossos")
    .setDescription(
      `Responda **uma pergunta por vez**.\n\n**${q.title}**\n${q.text}`
    );
}

/**
 * ✅ Fecha a WL:
 * - PrivateThread: NÃO pode lock → só arquiva
 * - PublicThread: lock + archive
 */
async function closeWhitelistThreadIfAny(message: Message) {
  try {
    const ch = message.channel;
    if (!ch || !ch.isThread()) return;

    if (ch.type === ChannelType.PrivateThread) {
      await ch.setArchived(true, "Whitelist finalizada");
      return;
    }

    await ch.setLocked(true, "Whitelist finalizada");
    await ch.setArchived(true, "Whitelist finalizada");
  } catch (err) {
    console.error("Erro ao fechar thread da whitelist:", err);
  }
}

function buildStaffEmbed(attempt: any) {
  const answers = (attempt.answers ?? {}) as Record<string, string>;

  const order: Array<[string, string]> = [
    ["nome", "Nome"],
    ["origem", "Origem"],
    ["sobrevivencia", "Sobrevivência"],
    ["confianca", "Confiança"],
    ["limite", "Limite"],
    ["medo", "Medo"],
    ["steamId", "SteamID64"],
  ];

  const desc = order
    .map(([k, label]) => {
      const v = (answers[k] ?? "").toString().trim();
      return `**${label}:**\n${v ? v : "(vazio)"}`;
    })
    .join("\n\n");

  return new EmbedBuilder()
    .setTitle("📜 Whitelist — Nova submissão")
    .setDescription(desc)
    .addFields(
      {
        name: "Usuário",
        value: `<@${attempt.userId}> (${attempt.userTag ?? "sem tag"})`,
        inline: false,
      },
      { name: "Tentativa", value: attempt.id, inline: true },
      { name: "Status", value: attempt.status, inline: true }
    );
}

function staffDecisionRow(attemptId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`wl:approve:${attemptId}`)
      .setLabel("✅ Aprovar")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`wl:reject:${attemptId}`)
      .setLabel("❌ Reprovar")
      .setStyle(ButtonStyle.Danger)
  );
}

/* ─────────────────────────────── */
/* START WHITELIST BUTTON */
/* ─────────────────────────────── */
export async function whitelistStartButton(i: ButtonInteraction) {
  if (!i.deferred && !i.replied) await i.deferReply({ ephemeral: true });

  if (!i.guild || !i.channel) {
    await i.editReply("❌ Use este botão dentro do servidor.");
    return;
  }

  // Expira tentativas anteriores
  await prisma.whitelistApplication.updateMany({
    where: {
      guildId: i.guild.id,
      userId: i.user.id,
      status: { in: ["IN_PROGRESS", "SUBMITTED"] },
    },
    data: { status: "EXPIRED" },
  });

  const attempt = await prisma.whitelistApplication.create({
    data: {
      guildId: i.guild.id,
      userId: i.user.id,
      userTag: i.user.tag,
      status: "IN_PROGRESS",
      currentStep: 0,
      answers: {},
    },
  });

  /* ─── PRIVATE THREAD ─── */
  if (i.channel.type === ChannelType.GuildText) {
    const perms = i.channel.permissionsFor(i.guild.members.me!);

    if (
      perms?.has(PermissionsBitField.Flags.CreatePrivateThreads) &&
      perms?.has(PermissionsBitField.Flags.SendMessagesInThreads)
    ) {
      const thread = await i.channel.threads.create({
        name: `wl-${i.user.username}-${attempt.id.slice(0, 4)}`,
        type: ChannelType.PrivateThread,
        autoArchiveDuration: 1440,
        invitable: false,
      });

      await thread.members.add(i.user.id);
      await i.editReply(`✅ Whitelist iniciada em privado: <#${thread.id}>`);
      await thread.send({ embeds: [questionEmbed(0)] });
      return;
    }
  }

  /* ─── DM FALLBACK ─── */
  try {
    const dm = await i.user.createDM();
    await dm.send({ embeds: [questionEmbed(0)] });
    await i.editReply("✅ Whitelist iniciada no seu privado (DM).");
  } catch {
    await i.editReply(
      "❌ Não consegui iniciar.\nAtive DMs de membros do servidor."
    );
  }
}

/* ─────────────────────────────── */
/* MESSAGE LISTENER (AVANÇA WL) */
/* ─────────────────────────────── */
export async function handleWhitelistThreadMessage(message: Message) {
  if (message.author.bot) return;

  const isThread =
    message.channel.type === ChannelType.PrivateThread ||
    message.channel.type === ChannelType.PublicThread;

  const isDM = message.channel.type === ChannelType.DM;

  if (!isThread && !isDM) return;
  if (!message.channel.isTextBased()) return;

  const attempt = await prisma.whitelistApplication.findFirst({
    where: isDM
      ? { userId: message.author.id, status: "IN_PROGRESS" }
      : {
          guildId: message.guildId!,
          userId: message.author.id,
          status: "IN_PROGRESS",
        },
    orderBy: { createdAt: "desc" },
  });

  if (!attempt) return;

  const step = attempt.currentStep ?? 0;
  if (step >= QUESTIONS.length) return;

  const q = QUESTIONS[step];
  const content = message.content.trim();

  if (!content) return;
  if (content.length > q.max) {
    await (message.channel as any).send(`⚠️ Máx: ${q.max} caracteres.`);
    return;
  }

  if (q.key === "steamId" && !isSteamId64(content)) {
    await (message.channel as any).send("⚠️ SteamID64 inválido.");
    return;
  }

  const answers = (attempt.answers ?? {}) as any;
  answers[q.key] = content;

  const nextStep = step + 1;

  // ✅ finalizou
  if (nextStep >= QUESTIONS.length) {
    const updated = await prisma.whitelistApplication.update({
      where: { id: attempt.id },
      data: {
        answers,
        currentStep: nextStep,
        steamId: content,
        status: "SUBMITTED",
        submittedAt: new Date(),
      },
    });

    // tenta aplicar cargo pré-resultado (se configurado)
    if (!isDM && message.guildId) {
      try {
        const cfg = await prisma.guildConfig.findUnique({
          where: { guildId: message.guildId },
        });

        const preRoleId = cfg?.whitelistPreResultRoleId ?? null;
        if (preRoleId) {
          const guild = await message.client.guilds.fetch(message.guildId);
          const member = await guild.members.fetch(message.author.id).catch(() => null);
          if (member) await member.roles.add(preRoleId, "Whitelist submetida (aguardando análise)");
        }
      } catch {
        // ignore
      }
    }

    // ✅ envia para staff (config > fallback)
    try {
      const cfg = await prisma.guildConfig.findUnique({
        where: { guildId: message.guildId ?? "" },
      });

      const approvalChannelId =
        cfg?.whitelistStaffChannelId ?? APPROVAL_CHANNEL_ID_FALLBACK;

      const ch = await message.client.channels.fetch(approvalChannelId).catch(() => null);

      if (ch && ch.isTextBased()) {
        await (ch as any).send({
          content: `🧾 **Nova whitelist recebida**\n👤 <@${updated.userId}>`,
          embeds: [
            buildStaffEmbed({
              ...updated,
              answers,
              status: "SUBMITTED",
              steamId: content,
            }),
          ],
          components: [staffDecisionRow(updated.id)],
        });
      }
    } catch (err) {
      console.error("Erro ao enviar whitelist para staff:", err);
    }

    await (message.channel as any).send("✅ **Whitelist finalizada!** Aguarde análise.");

    // ✅ fecha thread/tópico
    await closeWhitelistThreadIfAny(message);
    return;
  }

  // continua
  await prisma.whitelistApplication.update({
    where: { id: attempt.id },
    data: { answers, currentStep: nextStep },
  });

  await (message.channel as any).send({ embeds: [questionEmbed(nextStep)] });
}

/* ─────────────────────────────── */
/* STAFF / MODALS */
/* ─────────────────────────────── */

export async function handleWhitelistAnswerModal(i: ModalSubmitInteraction) {
  await i.reply({
    content: "⚠️ Responda diretamente na thread/DM.",
    ephemeral: true,
  });
}

export async function handleWhitelistDecisionButton(i: ButtonInteraction) {
  if (!i.guild) {
    await i.reply({
      content: "⚠️ Isso só funciona dentro do servidor.",
      ephemeral: true,
    });
    return;
  }

  const parts = i.customId.split(":");
  const action = parts[1]; // approve | reject
  const attemptId = parts[2];

  if (!action || !attemptId) {
    await i.reply({ content: "⚠️ Ação inválida.", ephemeral: true });
    return;
  }

  const cfg = await prisma.guildConfig.findUnique({ where: { guildId: i.guild.id } });
  const staffRoleId = cfg?.staffRoleId ?? undefined;

  const member = await i.guild.members.fetch(i.user.id).catch(() => null);
  const hasManageGuild = member?.permissions?.has(PermissionsBitField.Flags.ManageGuild);

  const isStaff = staffRoleId ? member?.roles?.cache?.has(staffRoleId) : false;

  if (staffRoleId && !isStaff && !hasManageGuild) {
    await i.reply({
      content: "⛔ Você não tem permissão para avaliar whitelist.",
      ephemeral: true,
    });
    return;
  }

  const attempt = await prisma.whitelistApplication.findUnique({ where: { id: attemptId } });
  if (!attempt) {
    await i.reply({ content: "⚠️ Whitelist não encontrada.", ephemeral: true });
    return;
  }

  if (attempt.status !== "SUBMITTED") {
    await i.reply({
      content: "⚠️ Essa whitelist já foi avaliada ou não está submetida.",
      ephemeral: true,
    });
    return;
  }

  // REJECT → abre modal motivo
  if (action === "reject") {
    const modal = new ModalBuilder()
      .setCustomId(`wl:reject_reason:${attemptId}`)
      .setTitle("Motivo da reprovação");

    const reason = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Explique o motivo")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(800);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reason));
    await i.showModal(modal);
    return;
  }

  // APPROVE
  await prisma.whitelistApplication.update({
    where: { id: attemptId },
    data: {
      status: "APPROVED",
      decidedAt: new Date(),
      decidedById: i.user.id,
      decidedByTag: i.user.tag,
      decisionNote: null,
    },
  });

  // cargos (se configurados)
  try {
    const approvedRoleId = cfg?.whitelistApprovedRoleId ?? null;
    const preRoleId = cfg?.whitelistPreResultRoleId ?? null;
    const rejectedRoleId = cfg?.whitelistRejectedRoleId ?? null;

    const m = await i.guild.members.fetch(attempt.userId).catch(() => null);
    if (m) {
      if (preRoleId) await m.roles.remove(preRoleId).catch(() => null);
      if (rejectedRoleId) await m.roles.remove(rejectedRoleId).catch(() => null);
      if (approvedRoleId) await m.roles.add(approvedRoleId, "Whitelist aprovada");
    }
  } catch {
    // ignore
  }

  // DM usuário
  try {
    const user = await i.client.users.fetch(attempt.userId);
    await user.send("✅ Sua whitelist foi **APROVADA**. Bem-vindo ao Black | Vale dos Ossos.");
  } catch {
    // ignore
  }

  // atualiza mensagem do staff (remove botões)
  try {
    const embed = buildStaffEmbed({ ...attempt, status: "APPROVED" });
    await i.update({
      content: `✅ Whitelist aprovada por <@${i.user.id}>`,
      embeds: [embed],
      components: [],
    });
  } catch {
    if (!i.replied) await i.reply({ content: "✅ Aprovado.", ephemeral: true });
  }
}

export async function handleWhitelistRejectReasonModal(i: ModalSubmitInteraction) {
  if (!i.guild) {
    await i.reply({
      content: "⚠️ Isso só funciona dentro do servidor.",
      ephemeral: true,
    });
    return;
  }

  const parts = i.customId.split(":");
  const attemptId = parts[2];
  const reason = i.fields.getTextInputValue("reason")?.trim() || "(sem motivo)";

  const attempt = await prisma.whitelistApplication.findUnique({ where: { id: attemptId } });
  if (!attempt) {
    await i.reply({ content: "⚠️ Whitelist não encontrada.", ephemeral: true });
    return;
  }

  if (attempt.status !== "SUBMITTED") {
    await i.reply({
      content: "⚠️ Essa whitelist já foi avaliada ou não está submetida.",
      ephemeral: true,
    });
    return;
  }

  await prisma.whitelistApplication.update({
    where: { id: attemptId },
    data: {
      status: "REJECTED",
      decidedAt: new Date(),
      decidedById: i.user.id,
      decidedByTag: i.user.tag,
      decisionNote: reason,
    },
  });

  const cfg = await prisma.guildConfig.findUnique({ where: { guildId: i.guild.id } });

  // cargos (se configurados)
  try {
    const rejectedRoleId = cfg?.whitelistRejectedRoleId ?? null;
    const preRoleId = cfg?.whitelistPreResultRoleId ?? null;
    const approvedRoleId = cfg?.whitelistApprovedRoleId ?? null;

    const m = await i.guild.members.fetch(attempt.userId).catch(() => null);
    if (m) {
      if (preRoleId) await m.roles.remove(preRoleId).catch(() => null);
      if (approvedRoleId) await m.roles.remove(approvedRoleId).catch(() => null);
      if (rejectedRoleId) await m.roles.add(rejectedRoleId, "Whitelist reprovada");
    }
  } catch {
    // ignore
  }

  // DM usuário
  try {
    const user = await i.client.users.fetch(attempt.userId);
    await user.send(`❌ Sua whitelist foi **REPROVADA**. Motivo: ${reason}`);
  } catch {
    // ignore
  }

  // atualiza mensagem do staff
  try {
    const embed = buildStaffEmbed({ ...attempt, status: "REJECTED" });
    await i.reply({ content: "❌ Reprovado e notificado (DM se disponível).", ephemeral: true });
    // tenta editar mensagem original (se o modal veio de uma interação de botão, a mensagem anterior ainda existe)
    // não é obrigatório
  } catch {
    // ignore
  }
}

export async function handleWhitelistAdjustNoteModal(i: ModalSubmitInteraction) {
  await i.reply({ content: "⚠️ Ajuste não implementado.", ephemeral: true });
}
