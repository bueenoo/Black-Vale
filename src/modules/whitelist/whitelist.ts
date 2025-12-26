import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} from "discord.js";
import { prisma } from "../../core/prisma.js";
import { WhitelistStatus } from "@prisma/client";

/* =======================
   CONFIG
======================= */

const QUESTIONS = [
  ["steamId", "SteamID (obrigatório)", "Digite sua SteamID64 (17 dígitos).", "SHORT"],
  ["q1", "Quem é você?", "Diga o nome que sobrou depois que o mundo acabou.", "SHORT"],
  ["q2", "De onde você veio?", "O que aconteceu lá e por que nunca voltou?", "PARA"],
  ["q3", "Como sobreviveu?", "Roubo, violência ou omissão?", "PARA"],
  ["q4", "Confiança", "Em quem você confia hoje?", "SHORT"],
  ["q5", "Limites", "Até onde você iria para sobreviver?", "PARA"],
  ["q6", "Medo real", "O que seu personagem mais teme perder?", "SHORT"],
  [
    "q7",
    "RP HARD",
    "Explique MetaGaming, PowerGaming e por que a morte deve ser temida no RP.",
    "PARA",
  ],
  [
    "q8",
    "Cena Final",
    "Narre sua chegada ao Vale dos Ossos (mín. 6 linhas).",
    "PARA",
  ],
];

/* =======================
   HELPERS
======================= */

function isSteamIdOk(v: string) {
  return /^\d{17}$/.test(v.trim());
}

function countLines(v: string) {
  return v.split(/\r?\n/).filter((l) => l.trim()).length;
}

async function findLatestApp(guildId: string, userId: string) {
  return prisma.whitelistApplication.findFirst({
    where: { guildId, userId },
    orderBy: { createdAt: "desc" },
  });
}

/* =======================
   START WL
======================= */

export async function whitelistStartFromButton(interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild;
  if (!guild) return;

  const cfg = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });
  if (!cfg?.whitelistAccessChannelId) {
    return interaction.editReply("❌ Whitelist não configurada.");
  }

  // Anti-spam
  const existing = await prisma.whitelistApplication.findFirst({
    where: {
      guildId: guild.id,
      userId: interaction.user.id,
      status: { in: ["IN_PROGRESS", "SUBMITTED"] },
    },
  });

  if (existing) {
    return interaction.editReply("📝 Você já está em análise. Aguarde a staff.");
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

  await showStepModal(interaction, 1);
}

/* =======================
   MODALS
======================= */

async function showStepModal(interaction: ButtonInteraction, step: number) {
  const q = QUESTIONS[step - 1];
  const [, title, placeholder, kind] = q;

  const modal = new ModalBuilder()
    .setCustomId(`wl:step:${step}`)
    .setTitle(title);

  const input = new TextInputBuilder()
    .setCustomId("answer")
    .setLabel(title)
    .setPlaceholder(placeholder)
    .setRequired(true)
    .setStyle(kind === "SHORT" ? TextInputStyle.Short : TextInputStyle.Paragraph)
    .setMaxLength(kind === "SHORT" ? 200 : 1000);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));

  await interaction.showModal(modal);
}

export async function whitelistContinueModalSubmit(
  interaction: ModalSubmitInteraction
) {
  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild;
  if (!guild) return;

  const step = Number(interaction.customId.split(":")[2]);
  const answer = interaction.fields.getTextInputValue("answer").trim();

  const app = await findLatestApp(guild.id, interaction.user.id);
  if (!app) return interaction.editReply("❌ Whitelist não encontrada.");

  if (step === 1 && !isSteamIdOk(answer)) {
    return interaction.editReply("❌ SteamID inválido. Use SteamID64 (17 dígitos).");
  }

  if (step === 9 && countLines(answer) < 6) {
    return interaction.editReply("❌ A cena final precisa ter no mínimo 6 linhas.");
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
        .setCustomId("wl:continue")
        .setLabel("Continuar")
        .setStyle(ButtonStyle.Success)
    );

    return interaction.editReply({
      content: `✅ Etapa ${step}/${QUESTIONS.length} salva.`,
      components: [row],
    });
  }

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

/* =======================
   STAFF
======================= */

async function sendToStaff(guildId: string, appId: string) {
  const cfg = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!cfg?.whitelistStaffChannelId) return;

  const app = await prisma.whitelistApplication.findUnique({ where: { id: appId } });
  if (!app) return;

  const client: any = globalThis.__blackbot_client;
  const guild = client.guilds.cache.get(guildId);
  const channel = guild.channels.cache.get(cfg.whitelistStaffChannelId);

  if (!channel) return;

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

/* =======================
   STAFF DECISION
======================= */

export async function staffDecisionButton(interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild!;
  const cfg = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });

  const member = await guild.members.fetch(interaction.user.id);
  const isStaff =
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    (cfg?.staffRoleId && member.roles.cache.has(cfg.staffRoleId));

  if (!isStaff) {
    return interaction.editReply("⛔ Apenas staff pode decidir whitelist.");
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

    return interaction.editReply("✅ Whitelist aprovada.");
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
    await interaction.showModal(modal);
    return;
  }
}

export async function staffRejectModalSubmit(
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

  return interaction.editReply("❌ Reprovado e registrado.");
}
