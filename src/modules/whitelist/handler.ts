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
} from "discord.js";

import { prisma } from "../../core/prisma.js";
import { WhitelistStatus } from "@prisma/client";

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

/* =========================
   START WHITELIST
========================= */

export async function whitelistStartButton(interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild;
  if (!guild) return;

  // anti-spam: já em análise ou enviada
  const pending = await prisma.whitelistApplication.findFirst({
    where: {
      guildId: guild.id,
      userId: interaction.user.id,
      status: { in: [WhitelistStatus.IN_PROGRESS, WhitelistStatus.SUBMITTED] },
    },
  });

  if (pending) {
    await interaction.editReply("📝 Você já está com uma whitelist em análise.");
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
   QUESTIONS
========================= */

const QUESTIONS = [
  ["steamId", "SteamID", "Informe sua SteamID64 (17 dígitos)", TextInputStyle.Short],
  ["q1", "Quem é você?", "Diga o nome que sobrou depois que o mundo acabou.", TextInputStyle.Short],
  ["q2", "Origem", "De onde você veio? O que aconteceu lá?", TextInputStyle.Paragraph],
  ["q3", "Sobrevivência", "O que você fez para sobreviver?", TextInputStyle.Paragraph],
  ["q4", "RP HARD", "Explique MetaGaming, PowerGaming e FearRP.", TextInputStyle.Paragraph],
  ["q5", "Cena Final", "Descreva sua chegada ao Vale (mín. 6 linhas).", TextInputStyle.Paragraph],
];

async function showQuestionModal(interaction: ButtonInteraction, step: number) {
  const q = QUESTIONS[step - 1];

  const modal = new ModalBuilder()
    .setCustomId(`wl:answer:${step}`)
    .setTitle(q[1]);

  const input = new TextInputBuilder()
    .setCustomId("answer")
    .setLabel(q[1])
    .setPlaceholder(q[2])
    .setRequired(true)
    .setStyle(q[3])
    .setMaxLength(q[3] === TextInputStyle.Short ? 200 : 1000);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));

  await interaction.showModal(modal);
}

/* =========================
   ANSWERS
========================= */

export async function handleWhitelistAnswerModal(
  interaction: ModalSubmitInteraction
) {
  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild;
  if (!guild) return;

  const step = Number(interaction.customId.split(":")[2]);
  const answer = interaction.fields.getTextInputValue("answer").trim();

  const app = await findLatestApp(guild.id, interaction.user.id);
  if (!app) {
    await interaction.editReply("❌ Sessão expirada. Inicie novamente.");
    return;
  }

  if (step === 1 && !steamIdOk(answer)) {
    await interaction.editReply("❌ SteamID inválido. Use SteamID64 (17 dígitos).");
    return;
  }

  const answers = (app.answers as any) ?? {};
  answers[QUESTIONS[step - 1][0]] = answer;

  await prisma.whitelistApplication.update({
    where: { id: app.id },
    data: {
      answers,
      currentStep: step,
      steamId: step === 1 ? answer : app.steamId,
    },
  });

  if (step < QUESTIONS.length) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("whitelist:start")
        .setLabel("Continuar")
        .setStyle(ButtonStyle.Success)
    );

    await interaction.editReply({
      content: `✅ Etapa ${step}/${QUESTIONS.length} salva.`,
      components: [row],
    });
    return;
  }

  await prisma.whitelistApplication.update({
    where: { id: app.id },
    data: {
      status: WhitelistStatus.SUBMITTED,
      submittedAt: new Date(),
    },
  });

  await sendToStaff(guild.id, app.id);

  await interaction.editReply("📼 Whitelist enviada para análise.");
}

/* =========================
   STAFF
========================= */

async function sendToStaff(guildId: string, appId: string) {
  const cfg = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!cfg?.whitelistStaffChannelId) return;

  const app = await prisma.whitelistApplication.findUnique({ where: { id: appId } });
  if (!app) return;

  const client: any = globalThis.__blackbot_client;
  const guild = client.guilds.cache.get(guildId);
  const channel = guild.channels.cache.get(cfg.whitelistStaffChannelId);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const a = app.answers as any;

  const embed = new EmbedBuilder()
    .setTitle("📜 Nova Whitelist")
    .addFields(
      { name: "Usuário", value: `<@${app.userId}>` },
      { name: "SteamID", value: `\`${app.steamId}\`` },
      ...QUESTIONS.slice(1).map((q) => ({
        name: q[1],
        value: String(a[q[0]] ?? "—").slice(0, 1024),
      }))
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`wl:approve:${app.id}`)
      .setLabel("✅ Aprovar")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`wl:reject:${app.id}`)
      .setLabel("❌ Reprovar")
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({ embeds: [embed], components: [row] });
}

/* =========================
   STAFF DECISION
========================= */

export async function handleWhitelistDecisionButton(
  interaction: ButtonInteraction
) {
  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild!;
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
  if (!app) {
    await interaction.editReply("❌ Aplicação não encontrada.");
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
      },
    });

    await interaction.editReply("✅ Whitelist aprovada.");
    return;
  }

  if (action === "reject") {
    const modal = new ModalBuilder()
      .setCustomId(`wl:reject_reason:${app.id}`)
      .setTitle("Motivo da reprovação");

    const input = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Motivo")
      .setRequired(true)
      .setStyle(TextInputStyle.Paragraph);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));

    // ModalSubmitInteraction NÃO tem showModal → cast
    await (interaction as any).showModal(modal);
    return;
  }
}

/* =========================
   REJECT MODAL
========================= */

export async function handleWhitelistRejectReasonModal(
  interaction: ModalSubmitInteraction
) {
  await interaction.deferReply({ ephemeral: true });
  const appId = interaction.customId.split(":")[2];
  const reason = interaction.fields.getTextInputValue("reason");

  await prisma.whitelistApplication.update({
    where: { id: appId },
    data: {
      status: WhitelistStatus.REJECTED,
      decidedAt: new Date(),
      decidedById: interaction.user.id,
      decidedByTag: interaction.user.tag,
      decisionNote: reason,
    },
  });

  await interaction.editReply("❌ Reprovado e registrado.");
}
