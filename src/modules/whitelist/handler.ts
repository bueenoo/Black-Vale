import {
  ButtonInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
} from "discord.js";

import { prisma } from "../../core/prisma.js";
import { WL_QUESTIONS } from "./questions.js";

// ====== FALLBACK IDS (se não tiver config no Prisma) ======
const FALLBACK_WL_STAFF_CHANNEL_ID = "1453867163612872824";
const FALLBACK_STAFF_ROLE_ID = "1453868542809083965";
const FALLBACK_ROLE_EM_ANALISE = "1453866441290944646";
const FALLBACK_ROLE_APROVADO = "1453868618172596509";
const FALLBACK_ROLE_REPROVADO: string | null = null;
// =========================================================

type Session = {
  step: number;
  answers: Record<string, string>;
};

const sessions = new Map<string, Session>(); // key = `${guildId}:${userId}`

function sk(guildId: string, userId: string) {
  return `${guildId}:${userId}`;
}

function brandTitle() {
  return "🦴 BLACK | VALE DOS OSSOS";
}

function dmApproved() {
  return (
    `${brandTitle()}\n\n` +
    "```O Vale ouviu sua história.\n\n" +
    "Ela não é limpa.\n" +
    "Ela não é fácil.\n" +
    "Mas é verdadeira.\n\n" +
    "Você foi ACEITO.\n\n" +
    "Lembre-se:\n" +
    "aqui, escolhas têm peso,\n" +
    "palavras salvam mais que armas,\n" +
    "e a morte nunca é trivial.\n\n" +
    "O Vale observa.\n" +
    "Boa sorte.```"
  );
}

function dmRejected(reason?: string) {
  const base =
    `${brandTitle()}\n\n` +
    "```O Vale ouviu sua história.\n\n" +
    "Mas ela não pertence a este lugar.\n" +
    "Não ainda.\n\n" +
    "Isso não é um julgamento pessoal.\n" +
    "É uma decisão narrativa.\n\n" +
    "Reflita.\n" +
    "Ajuste.\n" +
    "Volte quando estiver pronto.\n\n" +
    "O Vale não esquece.```";
  if (reason?.trim()) return base + `\n\n**Motivo do staff:** ${reason.trim()}`;
  return base;
}

function dmAdjust(reason?: string) {
  const base =
    `${brandTitle()}\n\n` +
    "```Sua história tem potencial,\n" +
    "mas precisa de ajustes.\n\n" +
    "Leia o motivo enviado pela staff,\n" +
    "refaça sua narrativa\n" +
    "e tente novamente.\n\n" +
    "Aqui, qualidade vem antes de quantidade.```";
  if (reason?.trim()) return base + `\n\n**Motivo do staff:** ${reason.trim()}`;
  return base;
}

async function ensureEphemeral(i: any) {
  if (!i.deferred && !i.replied) await i.deferReply({ ephemeral: true });
}

async function safeDM(user: any, content: string) {
  try {
    await user.send({ content });
  } catch {
    // DM fechada
  }
}

function steamIdLooksValid(s: string) {
  // SteamID64: 17 dígitos
  return /^\d{17}$/.test(s);
}

function questionModal(customId: string, step: number) {
  const q = WL_QUESTIONS[step];

  const modal = new ModalBuilder().setCustomId(customId).setTitle(`📼 GRAVAÇÃO — ${q.title}`);

  const input = new TextInputBuilder()
    .setCustomId("answer")
    .setLabel(q.label)
    .setStyle(q.style)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder(q.placeholder);

  if (q.minLen) input.setMinLength(q.minLen);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  return modal;
}

function staffEmbed(guildId: string, userTag: string, userId: string, steamId: string, answers: Record<string, string>) {
  const e = new EmbedBuilder()
    .setTitle("📜 Nova Whitelist — Vale dos Ossos")
    .setDescription(
      `👤 **${userTag}**\n` +
      `🆔 Discord: \`${userId}\`\n` +
      `🎮 SteamID64: \`${steamId}\`\n` +
      `🏷️ Guild: \`${guildId}\``
    )
    .setColor(0x111111);

  for (const q of WL_QUESTIONS) {
    if (q.id === "steamId") continue;
    const v = (answers[q.id] ?? "").slice(0, 1024) || "_(vazio)_";
    e.addFields({ name: `${q.title} — ${q.label}`, value: v });
  }

  e.setFooter({ text: "O Vale observa." });
  return e;
}

function staffButtons(guildId: string, userId: string, appId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`wl:approve:${guildId}:${userId}:${appId}`).setLabel("✅ Aprovar").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`wl:reject:${guildId}:${userId}:${appId}`).setLabel("❌ Reprovar").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`wl:adjust:${guildId}:${userId}:${appId}`).setLabel("🟡 Ajuste").setStyle(ButtonStyle.Secondary),
  );
}

function reasonModal(customId: string, title: string) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);

  const input = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel("Motivo (obrigatório)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMinLength(5)
    .setMaxLength(800)
    .setPlaceholder("Ex: respostas curtas demais / incoerência / MG/PG mal explicado / falta de detalhes...");

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  return modal;
}

async function getCfgOrFallback(guildId: string) {
  const cfg = await prisma.guildConfig.findUnique({ where: { guildId } });

  return {
    staffChannelId: cfg?.whitelistStaffChannelId ?? FALLBACK_WL_STAFF_CHANNEL_ID,
    staffRoleId: cfg?.staffRoleId ?? FALLBACK_STAFF_ROLE_ID,
    roleEmAnalise: cfg?.whitelistPreResultRoleId ?? FALLBACK_ROLE_EM_ANALISE,
    roleAprovado: cfg?.whitelistApprovedRoleId ?? FALLBACK_ROLE_APROVADO,
    roleReprovado: cfg?.whitelistRejectedRoleId ?? FALLBACK_ROLE_REPROVADO,
  };
}

// =============================
// START
// =============================
export async function whitelistStartButton(interaction: ButtonInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return;
  const userId = interaction.user.id;

  const cfg = await getCfgOrFallback(guildId);

  // Anti-spam 1: se já tem cargo aprovado, bloqueia
  const member = await interaction.guild?.members.fetch(userId).catch(() => null);
  if (member?.roles.cache.has(cfg.roleAprovado)) {
    await interaction.reply({ ephemeral: true, content: "🦴 Você já foi aprovado. O Vale já decidiu." });
    return;
  }

  // Anti-spam 2: se existe WL pendente no Prisma, bloqueia
  const pending = await prisma.whitelistApplication.findFirst({
    where: { guildId, userId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });

  if (pending) {
    await interaction.reply({ ephemeral: true, content: "📝 Você já está **Em Análise**. Aguarde a decisão do staff." });
    return;
  }

  // cria sessão
  sessions.set(sk(guildId, userId), { step: 0, answers: {} });

  // dá cargo em análise (se existir)
  if (member && cfg.roleEmAnalise) {
    await member.roles.add(cfg.roleEmAnalise).catch(() => null);
  }

  await ensureEphemeral(interaction);
  await interaction.editReply({
    content:
      "📼 **GRAVAÇÃO INICIADA**\nArquivo corrompido. Data desconhecida.\n\n" +
      "Você não está aqui por acaso.\nSe cruzou o Vale dos Ossos… algo o trouxe até nós.\n\n" +
      "Responda com calma.\nMentiras ecoam aqui.",
  });

  await interaction.showModal(questionModal(`whitelist:answer:${guildId}:${userId}`, 0));
}

// =============================
// MODAL ANSWERS
// =============================
export async function handleWhitelistAnswerModal(interaction: ModalSubmitInteraction) {
  const parts = interaction.customId.split(":"); // whitelist:answer:guildId:userId
  if (parts.length < 4) return;

  const guildId = parts[2];
  const userId = parts[3];

  if (interaction.user.id !== userId) {
    await interaction.reply({ ephemeral: true, content: "⚠️ Este formulário não é seu." });
    return;
  }

  const s = sessions.get(sk(guildId, userId));
  if (!s) {
    await interaction.reply({ ephemeral: true, content: "⚠️ Sua sessão expirou. Clique em **Iniciar Whitelist** novamente." });
    return;
  }

  const q = WL_QUESTIONS[s.step];
  const value = interaction.fields.getTextInputValue("answer")?.trim() ?? "";

  if (q.minLen && value.length < q.minLen) {
    await interaction.reply({ ephemeral: true, content: `⚠️ Resposta curta demais para **${q.title}**.` });
    return;
  }

  // valida SteamID
  if (q.id === "steamId") {
    const onlyDigits = value.replace(/\D/g, "");
    if (!steamIdLooksValid(onlyDigits)) {
      await interaction.reply({
        ephemeral: true,
        content: "⚠️ SteamID inválido. Envie **SteamID64 com 17 dígitos** (somente números).",
      });
      return;
    }
    s.answers[q.id] = onlyDigits;
  } else {
    s.answers[q.id] = value;
  }

  s.step++;

  // terminou?
  if (s.step >= WL_QUESTIONS.length) {
    const cfg = await getCfgOrFallback(guildId);

    const steamId = s.answers["steamId"] ?? "";
    if (!steamIdLooksValid(steamId)) {
      await interaction.reply({ ephemeral: true, content: "⚠️ SteamID inválido/ausente. Reinicie a whitelist." });
      sessions.delete(sk(guildId, userId));
      return;
    }

    // salva no Prisma (histórico)
    const created = await prisma.whitelistApplication.create({
      data: {
        guildId,
        userId,
        userTag: interaction.user.tag,
        steamId,
        answersJson: s.answers,
        status: "PENDING",
      },
    });

    // manda pro staff
    const staffCh = await interaction.client.channels.fetch(cfg.staffChannelId).catch(() => null);
    if (!staffCh || staffCh.type !== ChannelType.GuildText) {
      await interaction.reply({ ephemeral: true, content: "⚠️ Canal do staff inválido. Configure whitelistStaffChannelId." });
      return;
    }

    await (staffCh as any).send({
      embeds: [staffEmbed(guildId, interaction.user.tag, userId, steamId, s.answers)],
      components: [staffButtons(guildId, userId, created.id)],
    });

    sessions.delete(sk(guildId, userId));

    await interaction.reply({
      ephemeral: true,
      content:
        "📼 **GRAVAÇÃO ENCERRADA**\n\n" +
        "Se você mentiu,\no Vale vai descobrir.\n\n" +
        "Se falou a verdade,\ntalvez sobreviva.\n\n" +
        "Talvez.",
    });

    return;
  }

  // próxima pergunta
  await interaction.showModal(questionModal(`whitelist:answer:${guildId}:${userId}`, s.step));
}

// =============================
// STAFF DECISION BUTTONS
// =============================
export async function handleWhitelistDecisionButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":"); // wl:approve:guild:user:appId
  if (parts.length < 5) return;

  const action = parts[1]; // approve|reject|adjust
  const guildId = parts[2];
  const targetUserId = parts[3];
  const appId = parts[4];

  const cfg = await getCfgOrFallback(guildId);

  // permissão staff
  const staffMember = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
  const hasStaffRole = !!(cfg.staffRoleId && staffMember?.roles.cache.has(cfg.staffRoleId));
  const isAdmin = !!staffMember?.permissions.has(PermissionFlagsBits.ManageGuild);

  if (!hasStaffRole && !isAdmin) {
    await interaction.reply({ ephemeral: true, content: "⛔ Você não tem permissão para decidir whitelist." });
    return;
  }

  // abre modal de motivo obrigatório
  if (action === "reject") {
    await interaction.showModal(reasonModal(`wl:reject_reason:${guildId}:${targetUserId}:${appId}`, "Motivo da reprovação (obrigatório)"));
    return;
  }
  if (action === "adjust") {
    await interaction.showModal(reasonModal(`wl:adjust_reason:${guildId}:${targetUserId}:${appId}`, "Motivo do ajuste (obrigatório)"));
    return;
  }

  // approve direto
  if (action === "approve") {
    await ensureEphemeral(interaction);

    // atualiza prisma
    await prisma.whitelistApplication.update({
      where: { id: appId },
      data: {
        status: "APPROVED",
        decidedById: interaction.user.id,
        decidedByTag: interaction.user.tag,
        decidedAt: new Date(),
        decisionNote: "Aprovado",
      },
    }).catch(() => null);

    // cargos
    const targetMember = await interaction.guild?.members.fetch(targetUserId).catch(() => null);
    if (targetMember) {
      await targetMember.roles.add(cfg.roleAprovado).catch(() => null);
      if (cfg.roleEmAnalise) await targetMember.roles.remove(cfg.roleEmAnalise).catch(() => null);
    }

    // DM
    const user = await interaction.client.users.fetch(targetUserId).catch(() => null);
    if (user) await safeDM(user, dmApproved());

    await interaction.editReply({ content: "✅ Aprovado. DM enviada (se possível)." }).catch(() => null);
    await interaction.message.edit({ content: `✅ **Whitelist APROVADA** por <@${interaction.user.id}>`, components: [] }).catch(() => null);
    return;
  }
}

// =============================
// REJECT MODAL (MOTIVO) + AJUSTE MODAL
// =============================
export async function handleWhitelistRejectReasonModal(interaction: ModalSubmitInteraction) {
  const parts = interaction.customId.split(":"); // wl:reject_reason:guild:user:appId
  if (parts.length < 5) return;

  const guildId = parts[2];
  const targetUserId = parts[3];
  const appId = parts[4];

  const cfg = await getCfgOrFallback(guildId);

  // permissão staff
  const staffMember = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
  const hasStaffRole = !!(cfg.staffRoleId && staffMember?.roles.cache.has(cfg.staffRoleId));
  const isAdmin = !!staffMember?.permissions.has(PermissionFlagsBits.ManageGuild);

  if (!hasStaffRole && !isAdmin) {
    await interaction.reply({ ephemeral: true, content: "⛔ Você não tem permissão." });
    return;
  }

  const reason = interaction.fields.getTextInputValue("reason")?.trim() ?? "";
  await ensureEphemeral(interaction);

  await prisma.whitelistApplication.update({
    where: { id: appId },
    data: {
      status: "REJECTED",
      decidedById: interaction.user.id,
      decidedByTag: interaction.user.tag,
      decidedAt: new Date(),
      decisionNote: reason,
    },
  }).catch(() => null);

  const targetMember = await interaction.guild?.members.fetch(targetUserId).catch(() => null);
  if (targetMember) {
    if (cfg.roleEmAnalise) await targetMember.roles.remove(cfg.roleEmAnalise).catch(() => null);
    if (cfg.roleReprovado) await targetMember.roles.add(cfg.roleReprovado).catch(() => null);
  }

  const user = await interaction.client.users.fetch(targetUserId).catch(() => null);
  if (user) await safeDM(user, dmRejected(reason));

  await interaction.editReply({ content: "❌ Reprovado. Motivo registrado e DM enviada (se possível)." }).catch(() => null);
}

export async function handleWhitelistAdjustReasonModal(interaction: ModalSubmitInteraction) {
  const parts = interaction.customId.split(":"); // wl:adjust_reason:guild:user:appId
  if (parts.length < 5) return;

  const guildId = parts[2];
  const targetUserId = parts[3];
  const appId = parts[4];

  const cfg = await getCfgOrFallback(guildId);

  // permissão staff
  const staffMember = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
  const hasStaffRole = !!(cfg.staffRoleId && staffMember?.roles.cache.has(cfg.staffRoleId));
  const isAdmin = !!staffMember?.permissions.has(PermissionFlagsBits.ManageGuild);

  if (!hasStaffRole && !isAdmin) {
    await interaction.reply({ ephemeral: true, content: "⛔ Você não tem permissão." });
    return;
  }

  const reason = interaction.fields.getTextInputValue("reason")?.trim() ?? "";
  await ensureEphemeral(interaction);

  // status ADJUST (libera tentar de novo)
  await prisma.whitelistApplication.update({
    where: { id: appId },
    data: {
      status: "ADJUST",
      decidedById: interaction.user.id,
      decidedByTag: interaction.user.tag,
      decidedAt: new Date(),
      decisionNote: reason,
    },
  }).catch(() => null);

  // remove "em análise" para liberar reinício
  const targetMember = await interaction.guild?.members.fetch(targetUserId).catch(() => null);
  if (targetMember && cfg.roleEmAnalise) {
    await targetMember.roles.remove(cfg.roleEmAnalise).catch(() => null);
  }

  const user = await interaction.client.users.fetch(targetUserId).catch(() => null);
  if (user) await safeDM(user, dmAdjust(reason));

  await interaction.editReply({ content: "🟡 Ajuste enviado. Jogador liberado para tentar novamente." }).catch(() => null);
}
