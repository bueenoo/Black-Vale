import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  Guild,
  ModalBuilder,
  ModalSubmitInteraction,
  Message,
  PermissionFlagsBits,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

import { prisma } from "../../core/prisma.js";

/**
 * Whitelist contínua (por thread) + refazer WL ilimitado + painel de staff com Aprovar/Reprovar/Ajuste.
 *
 * Model Prisma usado:
 * - GuildConfig.whitelistStaffChannelId
 * - WhitelistApplication (status: IN_PROGRESS | SUBMITTED | APPROVED | REJECTED | ADJUST | EXPIRED)
 */

type Q = { key: string; text: string; max?: number; validator?: (v: string) => string | null };

const QUESTIONS: Q[] = [
  { key: "nome", text: "🧍 **Quem é você?**\nDiga o nome que sobrou depois que o mundo acabou.", max: 80 },
  { key: "origem", text: "🌍 **De onde você veio?**\nO que aconteceu lá e por que você nunca voltou?", max: 500 },
  { key: "sobrevivencia", text: "🩸 **O que você fez para sobreviver?**\nAqui ninguém está limpo. E você?", max: 500 },
  { key: "confianca", text: "🤝 **Em quem você confia hoje — pessoas, grupos ou só em si mesmo?**\nExplique.", max: 250 },
  { key: "limite", text: "⚖️ **Até onde você iria para viver mais um dia?**\nMentir, roubar ou abandonar alguém?", max: 350 },
  {
    key: "steamId",
    text: "🎮 **SteamID64 (obrigatório):**\nEnvie apenas números (17 dígitos).",
    max: 32,
    validator: (v) => (/^\d{17}$/.test(v.trim()) ? null : "SteamID64 inválida. Envie **17 dígitos** (apenas números)."),
  },
  {
    key: "historia",
    text: "📜 **História (até 200 caracteres):**\nUma breve história do seu personagem baseada na lore do servidor.",
    max: 200,
    validator: (v) => (v.trim().length <= 200 ? null : `Sua história passou de 200 caracteres (${v.trim().length}).`),
  },
];

function nowIso() {
  return new Date().toISOString();
}

function safeUsernameTag(user: { username: string; discriminator?: string }) {
  return user.discriminator && user.discriminator !== "0"
    ? `${user.username}#${user.discriminator}`
    : user.username;
}

async function getConfig(guildId: string) {
  return prisma.guildConfig.upsert({
    where: { guildId },
    update: {},
    create: { guildId },
  });
}

async function expireActiveApps(guildId: string, userId: string) {
  await prisma.whitelistApplication.updateMany({
    where: { guildId, userId, status: { in: ["IN_PROGRESS", "SUBMITTED"] } },
    data: {
      status: "EXPIRED",
      decidedAt: new Date(),
      decisionNote: "Substituída por nova tentativa",
    },
  });
}

async function createNewApp(guild: Guild, userId: string, userTag: string) {
  await expireActiveApps(guild.id, userId);

  return prisma.whitelistApplication.create({
    data: {
      guildId: guild.id,
      userId,
      userTag,
      status: "IN_PROGRESS",
      currentStep: 0,
      answers: { _meta: { startedAt: nowIso() } },
    },
  });
}

async function getLatestActiveApp(guildId: string, userId: string) {
  return prisma.whitelistApplication.findFirst({
    where: { guildId, userId, status: { in: ["IN_PROGRESS", "SUBMITTED"] } },
    orderBy: { createdAt: "desc" },
  });
}

function buildStaffEmbed(app: any) {
  const a = (app.answers ?? {}) as Record<string, any>;
  const meta = (a._meta ?? {}) as Record<string, any>;

  const embed = new EmbedBuilder()
    .setTitle("🧾 Whitelist — Aplicação")
    .addFields(
      { name: "User", value: `<@${app.userId}> (${app.userTag ?? "—"})`, inline: false },
      { name: "SteamID64", value: app.steamId ?? a.steamId ?? "—", inline: true },
      { name: "Status", value: String(app.status), inline: true },
    )
    .setFooter({ text: meta.startedAt ? `Iniciada: ${meta.startedAt}` : "Blacklist WL" });

  // respostas
  const pairs: [string, string][] = [
    ["Nome", a.nome ?? "—"],
    ["Origem", a.origem ?? "—"],
    ["Sobrevivência", a.sobrevivencia ?? "—"],
    ["Confiança", a.confianca ?? "—"],
    ["Limite", a.limite ?? "—"],
    ["História", a.historia ?? "—"],
  ];

  for (const [k, v] of pairs) {
    embed.addFields({ name: k, value: String(v).slice(0, 1024) || "—", inline: false });
  }

  return embed;
}

function staffButtons(appId: string, disabled = false) {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`wl:decision:approve:${appId}`)
        .setLabel("Aprovar")
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`wl:decision:reject:${appId}`)
        .setLabel("Reprovar")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`wl:decision:adjust:${appId}`)
        .setLabel("Ajuste")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
    ),
  ];
}

async function sendToStaff(guild: Guild, app: any) {
  const cfg = await getConfig(guild.id);
  const staffChannelId = cfg.whitelistStaffChannelId;

  if (!staffChannelId) return;

  const staffChannel = await guild.channels.fetch(staffChannelId).catch(() => null);
  if (!staffChannel || staffChannel.type !== ChannelType.GuildText) return;

  const embed = buildStaffEmbed(app);

  const msg = await (staffChannel as TextChannel).send({
    content: "🔎 Nova whitelist para análise:",
    embeds: [embed],
    components: staffButtons(app.id, false),
  });

  // guarda refs no answers para edição posterior (opcional)
  const answers = (app.answers ?? {}) as any;
  answers._meta = { ...(answers._meta ?? {}), staffChannelId, staffMessageId: msg.id };
  await prisma.whitelistApplication.update({ where: { id: app.id }, data: { answers } });
}

async function lockThread(thread: any, reason: string) {
  try {
    if (thread?.isThread()) {
      await thread.setLocked(true, reason).catch(() => null);
      await thread.setArchived(true, reason).catch(() => null);
    }
  } catch {}
}

/**
 * BOTÃO: iniciar whitelist
 * - sempre permite refazer (expira tentativa anterior)
 * - cria thread e começa perguntas
 */
export async function whitelistStartButton(interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  if (!guild) return;

  const userId = interaction.user.id;
  const userTag = safeUsernameTag(interaction.user);

  // cria nova tentativa (e expira ativa)
  const app = await createNewApp(guild, userId, userTag);

  // canal base
  const ch = interaction.channel;
  if (!ch || ch.type !== ChannelType.GuildText) {
    return interaction.editReply("❌ Use este botão em um canal de texto do servidor.");
  }

  // precisa criar thread
  const me = guild.members.me;
  if (me) {
    const perms = ch.permissionsFor(me);
    if (!perms?.has(PermissionFlagsBits.CreatePublicThreads) || !perms.has(PermissionFlagsBits.SendMessagesInThreads)) {
      return interaction.editReply("❌ Preciso das permissões **Create Public Threads** e **Send Messages in Threads** neste canal.");
    }
  }

  const thread = await (ch as TextChannel).threads.create({
    name: `wl-${interaction.user.username}-${app.id.slice(0, 6)}`,
    autoArchiveDuration: 1440,
    reason: "Whitelist contínua",
  });

  await thread.members.add(userId).catch(() => null);

  // salva thread no meta (sem mudar schema)
  const answers = (app.answers ?? {}) as any;
  answers._meta = { ...(answers._meta ?? {}), threadId: thread.id, threadChannelId: thread.id };
  await prisma.whitelistApplication.update({ where: { id: app.id }, data: { answers } });

  await interaction.editReply(`✅ Whitelist iniciada em: <#${thread.id}>`);

  await thread.send(
    "🧾 **Whitelist — Vale dos Ossos**\n" +
      "Responda **uma pergunta por vez**. Se errar, você pode clicar em **Iniciar Whitelist** novamente.\n\n" +
      `**Pergunta 1/${QUESTIONS.length}**\n${QUESTIONS[0].text}`,
  );
}

/**
 * MESSAGE FLOW: perguntas contínuas (thread)
 * - salva resposta
 * - valida
 * - envia próxima
 * - ao final: SUBMITTED + envia pra staff
 */
export async function handleWhitelistThreadMessage(message: Message) {
  if (message.author.bot) return;
  const guild = message.guild;
  if (!guild) return;

  if (!message.channel.isThread()) return;
  const thread = message.channel;

  const app = await prisma.whitelistApplication.findFirst({
    where: { guildId: guild.id, userId: message.author.id, status: "IN_PROGRESS" },
    orderBy: { createdAt: "desc" },
  });
  if (!app) return;

  // garante que essa thread é da aplicação (se tiver meta)
  const meta = ((app.answers as any)?._meta ?? {}) as any;
  if (meta.threadId && meta.threadId !== thread.id) return;

  const step = app.currentStep;
  const q = QUESTIONS[step];
  if (!q) return;

  const answer = message.content.trim();

  if (q.max && answer.length > q.max) {
    await thread.send(`⚠️ Resposta muito longa. Limite: **${q.max}** caracteres. Tente novamente.`);
    return;
  }
  if (q.validator) {
    const err = q.validator(answer);
    if (err) {
      await thread.send(`⚠️ ${err}`);
      return;
    }
  }

  const answers = (app.answers ?? {}) as any;
  answers[q.key] = answer;
  answers._meta = { ...(answers._meta ?? {}), lastAnsweredAt: nowIso() };

  const nextStep = step + 1;

  await prisma.whitelistApplication.update({
    where: { id: app.id },
    data: {
      answers,
      currentStep: nextStep,
      steamId: q.key === "steamId" ? answer : app.steamId,
      status: nextStep >= QUESTIONS.length ? "SUBMITTED" : "IN_PROGRESS",
      submittedAt: nextStep >= QUESTIONS.length ? new Date() : app.submittedAt,
    },
  });

  if (nextStep >= QUESTIONS.length) {
    await thread.send("✅ **Whitelist finalizada!** Sua aplicação foi enviada para análise da staff.");
    const refreshed = await prisma.whitelistApplication.findUnique({ where: { id: app.id } });
    if (refreshed) await sendToStaff(guild, refreshed);
    return;
  }

  await thread.send(`**Pergunta ${nextStep + 1}/${QUESTIONS.length}**\n${QUESTIONS[nextStep].text}`);
}

/* =========================
   STAFF: DECISION BUTTONS
========================= */

export async function handleWhitelistDecisionButton(interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild;
  if (!guild) return;

  const parts = interaction.customId.split(":");
  // wl:decision:<approve|reject|adjust>:<appId>
  const action = parts[2];
  const appId = parts[3];
  if (!action || !appId) return interaction.editReply("❌ Ação inválida.");

  const app = await prisma.whitelistApplication.findUnique({ where: { id: appId } });
  if (!app) return interaction.editReply("❌ Aplicação não encontrada.");

  // Aprovar direto
  if (action === "approve") {
    await applyDecisionAndUpdateCard(interaction, appId, "APPROVED", null);
    await interaction.editReply("✅ Aprovado.");
    return;
  }

  // Reprovar -> modal motivo
  if (action === "reject") {
    const modal = new ModalBuilder()
      .setCustomId(`wl:reject_reason:${appId}:${interaction.channelId}:${interaction.message.id}`)
      .setTitle("Motivo da reprovação");

    const input = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Motivo (será registrado)")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(400);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  // Ajuste -> modal nota
  if (action === "adjust") {
    const modal = new ModalBuilder()
      .setCustomId(`wl:adjust_note:${appId}:${interaction.channelId}:${interaction.message.id}`)
      .setTitle("Pedido de ajuste");

    const input = new TextInputBuilder()
      .setCustomId("note")
      .setLabel("O que o player deve ajustar?")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(400);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  await interaction.editReply("❌ Ação não reconhecida.");
}

async function applyDecisionAndUpdateCard(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  appId: string,
  status: "APPROVED" | "REJECTED" | "ADJUST",
  note: string | null,
) {
  const guild = interaction.guild!;
  const cfg = await getConfig(guild.id);

  const decidedById = interaction.user.id;
  const decidedByTag = safeUsernameTag(interaction.user);

  const updated = await prisma.whitelistApplication.update({
    where: { id: appId },
    data: {
      status,
      decidedAt: new Date(),
      decidedById,
      decidedByTag,
      decisionNote: note ?? undefined,
    },
  });

  // cargo/roles
  const member = await guild.members.fetch(updated.userId).catch(() => null);
  if (member) {
    // roles envolvidos (se existirem no config)
    const approvedRoleId = cfg.whitelistApprovedRoleId ?? undefined;
    const rejectedRoleId = cfg.whitelistRejectedRoleId ?? undefined;
    const preRoleId = cfg.whitelistPreResultRoleId ?? undefined;
    const whitelistRoleId = cfg.whitelistRoleId ?? undefined;

    if (preRoleId) await member.roles.remove(preRoleId).catch(() => null);

    if (status === "APPROVED") {
      if (approvedRoleId) await member.roles.add(approvedRoleId).catch(() => null);
      if (rejectedRoleId) await member.roles.remove(rejectedRoleId).catch(() => null);
      if (whitelistRoleId) await member.roles.remove(whitelistRoleId).catch(() => null);
    }

    if (status === "REJECTED") {
      if (rejectedRoleId) await member.roles.add(rejectedRoleId).catch(() => null);
    }
  }

  // editar card da staff e desabilitar botões
  const channelId = (interaction as any).customId?.includes(":") ? (interaction as any).customId.split(":")[3] : interaction.channelId;
  // no caso do modal, customId tem ...:<channelId>:<messageId>
  let staffChannelId = interaction.channelId;
  let staffMessageId: string | null = null;

  if ("customId" in interaction && interaction.customId.includes("wl:reject_reason:")) {
    const p = interaction.customId.split(":");
    staffChannelId = p[3];
    staffMessageId = p[4];
  }
  if ("customId" in interaction && interaction.customId.includes("wl:adjust_note:")) {
    const p = interaction.customId.split(":");
    staffChannelId = p[3];
    staffMessageId = p[4];
  }
  if ("message" in interaction && interaction.message?.id) {
    staffMessageId = staffMessageId ?? interaction.message.id;
  }

  const staffChannel = await guild.channels.fetch(staffChannelId).catch(() => null);
  if (staffChannel && staffChannel.type === ChannelType.GuildText && staffMessageId) {
    const msg = await (staffChannel as TextChannel).messages.fetch(staffMessageId).catch(() => null);
    if (msg) {
      const embed = buildStaffEmbed(updated);
      const footer = `${status} • ${decidedByTag} • ${new Date().toLocaleString("pt-BR")}`;
      embed.setFooter({ text: footer });

      await msg.edit({
        embeds: [embed],
        components: staffButtons(appId, true),
      }).catch(() => null);
    }
  }

  // tentar DM pro usuário
  const user = await guild.client.users.fetch(updated.userId).catch(() => null);
  if (user) {
    const pretty = status === "APPROVED" ? "✅ APROVADO" : status === "REJECTED" ? "❌ REPROVADO" : "✍️ AJUSTE SOLICITADO";
    const text = note ? `\n\n📝 Nota: ${note}` : "";
    await user.send(`📄 Sua whitelist foi marcada como **${pretty}**.${text}`).catch(() => null);
  }

  // se tiver thread, arquivar/lock
  const meta = ((updated.answers as any)?._meta ?? {}) as any;
  if (meta.threadId) {
    const th = await guild.channels.fetch(meta.threadId).catch(() => null);
    await lockThread(th, `Whitelist ${status}`);
  }

  // se reprovado, mandar no canal de log se configurado
  if (status === "REJECTED" && cfg.whitelistRejectLogChannelId) {
    const logCh = await guild.channels.fetch(cfg.whitelistRejectLogChannelId).catch(() => null);
    if (logCh && logCh.type === ChannelType.GuildText) {
      await (logCh as TextChannel).send({
        content: `❌ Whitelist reprovada: <@${updated.userId}> (${updated.userTag ?? "—"})\nMotivo: ${note ?? "—"}`,
      }).catch(() => null);
    }
  }
}

/* =========================
   STAFF MODALS
========================= */

export async function handleWhitelistRejectReasonModal(interaction: ModalSubmitInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const appId = interaction.customId.split(":")[2];
  const reason = (interaction.fields.getTextInputValue("reason") ?? "").trim();
  if (!appId) return interaction.editReply("❌ Aplicação inválida.");

  await applyDecisionAndUpdateCard(interaction, appId, "REJECTED", reason);
  await interaction.editReply("✅ Reprovação registrada.");
}

export async function handleWhitelistAdjustNoteModal(interaction: ModalSubmitInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const appId = interaction.customId.split(":")[2];
  const note = (interaction.fields.getTextInputValue("note") ?? "").trim();
  if (!appId) return interaction.editReply("❌ Aplicação inválida.");

  await applyDecisionAndUpdateCard(interaction, appId, "ADJUST", note);
  await interaction.editReply("✅ Ajuste solicitado.");
}

/**
 * Compat (caso seu roteador ainda chame esse handler antigo).
 * Não usado no fluxo contínuo.
 */
export async function handleWhitelistAnswerModal(_interaction: ModalSubmitInteraction) {
  // fluxo antigo removido
}
