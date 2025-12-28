import {
  ButtonInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits,
  TextChannel,
} from "discord.js";

import { prisma } from "../../core/prisma.js";
import { WhitelistStatus } from "@prisma/client";

/* =========================
   TYPES
========================= */

type Question = {
  key: string;
  title: string;
  placeholder: string;
  style: TextInputStyle;
  maxLength: number;
};

/* =========================
   HELPERS
========================= */

async function findLatestApp(guildId: string, userId: string) {
  return prisma.whitelistApplication.findFirst({
    where: { guildId, userId },
    orderBy: { createdAt: "desc" },
  });
}

function steamIdOk(v: string) {
  return /^\d{17}$/.test(v.trim());
}

function countLines(v: string) {
  return v.split(/\r?\n/).filter((l) => l.trim()).length;
}

/* =========================
   QUESTIONS
========================= */

const QUESTIONS = [
  {
    key: "steamId",
    title: "SteamID",
    placeholder: "Informe sua SteamID64 (17 dígitos).",
    style: TextInputStyle.Short,
    maxLength: 32,
  },
  {
    key: "q1",
    title: "Quem é você?",
    placeholder: "Diga o nome que sobrou depois que o mundo acabou.",
    style: TextInputStyle.Short,
    maxLength: 200,
  },
  {
    key: "q2",
    title: "Origem",
    placeholder: "De onde você veio? O que aconteceu lá? Por que nunca voltou?",
    style: TextInputStyle.Paragraph,
    maxLength: 1000,
  },
  {
    key: "q3",
    title: "Sobrevivência",
    placeholder: "O que você fez para sobreviver até aqui?",
    style: TextInputStyle.Paragraph,
    maxLength: 1000,
  },
  {
    key: "q4",
    title: "RP HARD (obrigatório)",
    placeholder: "Explique MetaGaming, PowerGaming e por que a morte deve ser temida no RP.",
    style: TextInputStyle.Paragraph,
    maxLength: 1000,
  },
  {
    key: "q5",
    title: "Cena final (mín. 6 linhas)",
    placeholder: "Narre sua chegada ao Vale dos Ossos. Ambiente, silêncio, medo...",
    style: TextInputStyle.Paragraph,
    maxLength: 1000,
  },
] satisfies Question[];


/* =========================
   STAFF HELPERS
========================= */

function buildDecisionRow(appId: string, disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`wl:approve:${appId}`)
      .setLabel("✅ Aprovar")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`wl:reject:${appId}`)
      .setLabel("❌ Reprovar")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`wl:adjust:${appId}`)
      .setLabel("✍️ Ajuste")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled)
  );
}

async function disableStaffDecisionComponents(interaction: ButtonInteraction) {
  const [, , appId] = interaction.customId.split(":");
  if (!interaction.message) return;
  await interaction.message.edit({ components: [buildDecisionRow(appId, true)] }).catch(() => null);
}

async function markStaffDecision(interaction: ButtonInteraction, statusLabel: string, staffTag: string) {
  const [, , appId] = interaction.customId.split(":");
  const embeds = interaction.message.embeds?.map((e) => EmbedBuilder.from(e)) ?? [];

  if (embeds[0]) {
    const now = new Date().toLocaleString("pt-BR");
    embeds[0].setFooter({ text: `${statusLabel} • ${staffTag} • ${now}` });
  }

  await interaction.message.edit({ embeds, components: [buildDecisionRow(appId, true)] }).catch(() => null);
}

/* =========================
   START WHITELIST
========================= */

export async function whitelistStartButton(interaction: ButtonInteraction) {
  const guild = interaction.guild;
  if (!guild) return;

  // anti-spam: já preenchendo ou já enviada
  const pending = await prisma.whitelistApplication.findFirst({
    where: {
      guildId: guild.id,
      userId: interaction.user.id,
      status: { in: [WhitelistStatus.IN_PROGRESS, WhitelistStatus.SUBMITTED] },
    },
  });

  if (pending) {
    // Aqui NÃO abrimos modal, então podemos responder normal
    await interaction.reply({
      content: "📝 Você já tem uma whitelist em andamento / em análise.",
      ephemeral: true,
    });
    return;
  }

  await prisma.whitelistApplication.create({
    data: {
      guildId: guild.id,
      userId: interaction.user.id,
      userTag: interaction.user.tag,
      status: WhitelistStatus.IN_PROGRESS,
      currentStep: 0,
      answers: {},
    },
  });

  // Modal precisa ser a PRIMEIRA resposta dessa interaction
  await showQuestionModal(interaction, 1);
}

/* =========================
   MODAL: SHOW QUESTION
========================= */

async function showQuestionModal(interaction: ButtonInteraction, step: number) {
  const q = QUESTIONS[step - 1];
  if (!q) return;

  const modal = new ModalBuilder()
    .setCustomId(`wl:answer:${step}`)
    .setTitle(q.title);

  const input = new TextInputBuilder()
    .setCustomId("answer")
    .setLabel(q.title)
    .setPlaceholder(q.placeholder)
    .setRequired(true)
    .setStyle(q.style)
    .setMaxLength(q.maxLength);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
}

/* =========================
   MODAL: SAVE ANSWER
========================= */

export async function handleWhitelistAnswerModal(interaction: ModalSubmitInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild;
  if (!guild) return;

  const step = Number(interaction.customId.split(":")[2]);
  const q = QUESTIONS[step - 1];
  if (!q) return interaction.editReply("❌ Etapa inválida.");

  const answer = (interaction.fields.getTextInputValue("answer") ?? "").trim();

  const app = await findLatestApp(guild.id, interaction.user.id);
  if (!app) return interaction.editReply("❌ Aplicação não encontrada. Inicie novamente.");

  // validações
  if (q.key === "steamId" && !steamIdOk(answer)) {
    return interaction.editReply("❌ SteamID inválida. Use SteamID64 (17 dígitos).");
  }

  if (q.key === "q5" && countLines(answer) < 6) {
    return interaction.editReply("❌ A cena final precisa ter no mínimo **6 linhas**.");
  }

  const answers = (app.answers as any) ?? {};
  answers[q.key] = answer;

  await prisma.whitelistApplication.update({
    where: { id: app.id },
    data: {
      answers,
      currentStep: step,
      steamId: q.key === "steamId" ? answer : app.steamId,
    },
  });

  // continuar
  if (step < QUESTIONS.length) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`wl:next:${step + 1}`)
        .setLabel("Continuar")
        .setStyle(ButtonStyle.Success)
    );

    return interaction.editReply({
      content: `✅ Etapa ${step}/${QUESTIONS.length} salva.`,
      components: [row],
    });
  }

  // finaliza
  await prisma.whitelistApplication.update({
    where: { id: app.id },
    data: {
      status: WhitelistStatus.SUBMITTED,
      submittedAt: new Date(),
    },
  });

  await sendToStaff(guild.id, app.id);

  return interaction.editReply("📼 Whitelist enviada para análise.");
}

/* =========================
   BUTTON: NEXT STEP + DECISIONS
========================= */

export async function handleWhitelistDecisionButton(interaction: ButtonInteraction) {
  const guild = interaction.guild;
  if (!guild) return;

  // NEXT (abre modal => NÃO pode deferReply)
  if (interaction.customId.startsWith("wl:next:")) {
    const nextStep = Number(interaction.customId.split(":")[2]);
    await showQuestionModal(interaction, nextStep);
    return;
  }

  const cfg = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });

  // Permissão de staff
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  const isStaff =
    !!member &&
    (member.permissions.has(PermissionFlagsBits.ManageGuild) ||
      (cfg?.staffRoleId && member.roles.cache.has(cfg.staffRoleId)));

  if (!isStaff) {
    await interaction.reply({ content: "⛔ Apenas staff pode decidir.", ephemeral: true }).catch(async () => {
      // fallback se já tiver respondido
      try {
        await interaction.editReply("⛔ Apenas staff pode decidir.");
      } catch {}
    });
    return;
  }

  const [, action, appId] = interaction.customId.split(":");
  if (!appId) {
    await interaction.reply({ content: "⚠️ Aplicação inválida.", ephemeral: true }).catch(() => null);
    return;
  }

  // REJECT / ADJUST => abrir modal (não pode deferReply)
  if (action === "reject") {
    const modal = new ModalBuilder()
      .setCustomId(`wl:reject_reason:${appId}:${interaction.channelId}:${interaction.message.id}`)
      .setTitle("Reprovar whitelist");

    const input = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Motivo da reprovação")
      .setPlaceholder("Explique com clareza o que faltou / o que está errado…")
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(600)
      .setRequired(false);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  if (action === "adjust") {
    const modal = new ModalBuilder()
      .setCustomId(`wl:adjust_note:${appId}:${interaction.channelId}:${interaction.message.id}`)
      .setTitle("Pedir ajuste");

    const input = new TextInputBuilder()
      .setCustomId("note")
      .setLabel("O que o player precisa ajustar?")
      .setPlaceholder("Ex.: explicar melhor o passado, corrigir SteamID64, reduzir metagaming…")
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(600)
      .setRequired(false);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  // APPROVE => pode deferReply
  await interaction.deferReply({ ephemeral: true });

  const app = await prisma.whitelistApplication.findUnique({ where: { id: appId } });
  if (!app) return interaction.editReply("❌ Aplicação não encontrada.");

  // evita dupla decisão
  if ([WhitelistStatus.APPROVED, WhitelistStatus.REJECTED].includes(app.status)) {
    await interaction.editReply("⚠️ Essa whitelist já foi decidida.");
    // tenta desabilitar botões do card
    try {
      await disableStaffDecisionComponents(interaction);
    } catch {}
    return;
  }

  if (action === "approve") {
    await prisma.whitelistApplication.update({
      where: { id: app.id },
      data: {
        status: WhitelistStatus.APPROVED,
        decidedAt: new Date(),
        decidedById: interaction.user.id,
        decidedByTag: interaction.user.tag,
        decisionNote: null,
      },
    });

    // cargos (opcional)
    if (cfg?.whitelistApprovedRoleId) {
      const target = await guild.members.fetch(app.userId).catch(() => null);
      if (target) {
        await target.roles.add(cfg.whitelistApprovedRoleId).catch(() => null);
        if (cfg.whitelistPreResultRoleId) await target.roles.remove(cfg.whitelistPreResultRoleId).catch(() => null);
        if (cfg.whitelistRoleId) await target.roles.remove(cfg.whitelistRoleId).catch(() => null);
      }
    }

    // desabilita botões no card da staff + marca decisão no embed
    try {
      await markStaffDecision(interaction, "✅ APROVADO", interaction.user.tag);
    } catch {}

    return interaction.editReply("✅ Whitelist aprovada.");
  }

  return interaction.editReply("⚠️ Ação inválida.");
}


/* =========================
   MODAL: REJECT REASON
========================= */

export async function handleWhitelistRejectReasonModal(interaction: ModalSubmitInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild;
  if (!guild) return;

  const parts = interaction.customId.split(":");
  const appId = parts[2];
  const staffChannelId = parts[3];
  const staffMessageId = parts[4];
  const reason = (interaction.fields.getTextInputValue("reason") ?? "").trim();

  const cfg = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });
  const app = await prisma.whitelistApplication.findUnique({ where: { id: appId } });
  if (!app) return interaction.editReply("❌ Aplicação não encontrada.");

  await prisma.whitelistApplication.update({
    where: { id: app.id },
    data: {
      status: WhitelistStatus.REJECTED,
      decidedAt: new Date(),
      decidedById: interaction.user.id,
      decidedByTag: interaction.user.tag,
      decisionNote: reason,
    },
  });

  // cargos (opcional)
  const target = await guild.members.fetch(app.userId).catch(() => null);
  if (target) {
    if (cfg?.whitelistRejectedRoleId) await target.roles.add(cfg.whitelistRejectedRoleId).catch(() => null);
    if (cfg?.whitelistPreResultRoleId) await target.roles.remove(cfg.whitelistPreResultRoleId).catch(() => null);
  }

  // log reprovação
  if (cfg?.whitelistRejectLogChannelId) {
    const ch = await guild.channels.fetch(cfg.whitelistRejectLogChannelId).catch(() => null);
    if (ch && ch.type === ChannelType.GuildText) {
      await (ch as TextChannel).send(
        `❌ Reprovado: <@${app.userId}> por <@${interaction.user.id}>\nMotivo: **${reason || "—"}**`
      );
    }
  }

  
  // tenta desabilitar botões no card da staff (se o modal veio de um botão)
  if (staffChannelId && staffMessageId) {
    const ch = await guild.channels.fetch(staffChannelId).catch(() => null);
    if (ch && ch.type === ChannelType.GuildText) {
      const msg = await (ch as TextChannel).messages.fetch(staffMessageId).catch(() => null);
      if (msg) {
        const embeds = msg.embeds?.map((e) => EmbedBuilder.from(e)) ?? [];
        if (embeds[0]) {
          const now = new Date().toLocaleString("pt-BR");
          embeds[0].setFooter({ text: `❌ REPROVADO • ${interaction.user.tag} • ${now}` });
        }
        await msg.edit({ embeds, components: [buildDecisionRow(appId, true)] }).catch(() => null);
      }
    }
  }

  return interaction.editReply("❌ Reprovado e registrado.");
}


/* =========================
   MODAL: ADJUST NOTE
========================= */

export async function handleWhitelistAdjustNoteModal(interaction: ModalSubmitInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  if (!guild) return;

  const parts = interaction.customId.split(":");
  const appId = parts[2];
  const staffChannelId = parts[3];
  const staffMessageId = parts[4];
  const note = (interaction.fields.getTextInputValue("note") ?? "").trim();

  const cfg = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });
  const app = await prisma.whitelistApplication.findUnique({ where: { id: appId } });
  if (!app) return interaction.editReply("❌ Aplicação não encontrada.");

  // marca como AJUSTE (não é reprovação; o player pode reenviar depois)
  await prisma.whitelistApplication.update({
    where: { id: app.id },
    data: {
      status: WhitelistStatus.ADJUST,
      decidedAt: new Date(),
      decidedById: interaction.user.id,
      decidedByTag: interaction.user.tag,
      decisionNote: note || null,
    },
  });

  // devolve cargos para o player tentar novamente (opcional)
  const target = await guild.members.fetch(app.userId).catch(() => null);
  if (target) {
    // mantém o cargo de whitelist se você quiser que ele consiga reenviar
    if (cfg?.whitelistPreResultRoleId) await target.roles.remove(cfg.whitelistPreResultRoleId).catch(() => null);
    // se você usa whitelistRoleId para liberar o canal de WL, mantenha.
  }

  // Log em canal (opcional) usando o mesmo reject log (ou crie um adjust log no futuro)
  if (cfg?.whitelistRejectLogChannelId) {
    const ch = await guild.channels.fetch(cfg.whitelistRejectLogChannelId).catch(() => null);
    if (ch && ch.type === ChannelType.GuildText) {
      await (ch as TextChannel).send(
        `✍️ Ajuste solicitado: <@${app.userId}> por <@${interaction.user.id}>
Nota: **${note || "—"}**`
      );
    }
  }

  // DM pro player (opcional)
  try {
    const user = await guild.client.users.fetch(app.userId);
    await user.send(
      `✍️ **Whitelist — Ajuste solicitado**
` +
        `Servidor: **${guild.name}**
` +
        `Nota da staff: **${note || "—"}**

` +
        `Você pode reenviar sua whitelist iniciando novamente pelo botão.`
    );
  } catch {
    // ignora se DM fechado
  }

  
  // tenta desabilitar botões no card da staff (se o modal veio de um botão)
  if (staffChannelId && staffMessageId) {
    const ch = await guild.channels.fetch(staffChannelId).catch(() => null);
    if (ch && ch.type === ChannelType.GuildText) {
      const msg = await (ch as TextChannel).messages.fetch(staffMessageId).catch(() => null);
      if (msg) {
        const embeds = msg.embeds?.map((e) => EmbedBuilder.from(e)) ?? [];
        if (embeds[0]) {
          const now = new Date().toLocaleString("pt-BR");
          embeds[0].setFooter({ text: `✍️ AJUSTE • ${interaction.user.tag} • ${now}` });
        }
        await msg.edit({ embeds, components: [buildDecisionRow(appId, true)] }).catch(() => null);
      }
    }
  }

  return interaction.editReply("✍️ Ajuste registrado e notificado (se possível).");
}

/* =========================
   STAFF MESSAGE
========================= */

async function sendToStaff(guildId: string, appId: string) {
  const cfg = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!cfg?.whitelistStaffChannelId) return;

  const app = await prisma.whitelistApplication.findUnique({ where: { id: appId } });
  if (!app) return;

  const client: any = (globalThis as any).__blackbot_client;
  const guild = client?.guilds?.cache?.get(guildId);
  if (!guild) return;

  const ch = guild.channels.cache.get(cfg.whitelistStaffChannelId);
  if (!ch || ch.type !== ChannelType.GuildText) return;

  const a = (app.answers as any) ?? {};

  const fields = [
    { name: "Usuário", value: `<@${app.userId}> (\`${app.userId}\`)` },
    { name: "SteamID", value: `\`${String(app.steamId ?? a.steamId ?? "—").slice(0, 32)}\`` },
    ...QUESTIONS.filter((q) => q.key !== "steamId").map((q) => ({
      name: q.title,
      value: String(a[q.key] ?? "—").slice(0, 1024),
    })),
  ];

  const embed = new EmbedBuilder()
    .setTitle("📜 Whitelist — Nova aplicação")
    .addFields(fields);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`wl:approve:${app.id}`).setLabel("✅ Aprovar").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`wl:reject:${app.id}`).setLabel("❌ Reprovar").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`wl:adjust:${app.id}`).setLabel("✍️ Ajuste").setStyle(ButtonStyle.Secondary)
  );

  await (ch as TextChannel).send({ embeds: [embed], components: [row] });
}
