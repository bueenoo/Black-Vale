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
   START WHITELIST
========================= */

export async function whitelistStartButton(interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });
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
    await interaction.editReply("📝 Você já tem uma whitelist em andamento / em análise.");
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

  // NEXT
  if (interaction.customId.startsWith("wl:next:")) {
    await interaction.deferReply({ ephemeral: true });
    const nextStep = Number(interaction.customId.split(":")[2]);
    await interaction.deleteReply().catch(() => null);
    await showQuestionModal(interaction, nextStep);
    return;
  }

  // DECISIONS
  await interaction.deferReply({ ephemeral: true });

  const cfg = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });

  const member = await guild.members.fetch(interaction.user.id);
  const isStaff =
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    (cfg?.staffRoleId && member.roles.cache.has(cfg.staffRoleId));

  if (!isStaff) {
    await interaction.editReply("⛔ Apenas staff pode decidir.");
    return;
  }

  const [, action, appId] = interaction.customId.split(":");
  const app = await prisma.whitelistApplication.findUnique({ where: { id: appId } });
  if (!app) return interaction.editReply("❌ Aplicação não encontrada.");

  if (action === "approve") {
    await prisma.whitelistApplication.update({
      where: { id: app.id },
      data: {
        status: WhitelistStatus.APPROVED,
        decidedAt: new Date(),
        decidedById: interaction.user.id,
        decidedByTag: interaction.user.tag,
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

    return interaction.editReply("✅ Whitelist aprovada.");
  }

  if (action === "reject") {
    const modal = new ModalBuilder()
      .setCustomId(`wl:reject_reason:${app.id}`)
      .setTitle("Motivo da reprovação");

    const input = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Motivo (obrigatório)")
      .setRequired(true)
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(600);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));

    await interaction.showModal(modal);
    return;
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

  const appId = interaction.customId.split(":")[2];
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

  return interaction.editReply("❌ Reprovado e registrado.");
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
    new ButtonBuilder().setCustomId(`wl:reject:${app.id}`).setLabel("❌ Reprovar").setStyle(ButtonStyle.Danger)
  );

  await (ch as TextChannel).send({ embeds: [embed], components: [row] });
}
