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
} from "discord.js";
import { prisma } from "../../core/prisma.js";
import { WhitelistStatus } from "@prisma/client";

const QUESTIONS = [
  [
    "steam",
    "SteamID (obrigatório)",
    "Digite sua SteamID (17 dígitos Steam64).",
    "SHORT"
  ],
  [
    "q1",
    "Quem é você?",
    "Diga o nome que sobrou depois que o mundo acabou.",
    "SHORT"
  ],
  [
    "q2",
    "De onde você veio?",
    "O que aconteceu lá e por que você nunca voltou?",
    "PARA"
  ],
  [
    "q3",
    "O que você fez para sobreviver?",
    "Aqui ninguém está limpo. E você?",
    "PARA"
  ],
  [
    "q4",
    "Em quem você confia hoje?",
    "Pessoas, grupos ou só em si mesmo? Explique.",
    "SHORT"
  ],
  [
    "q5",
    "Até onde você iria?",
    "Mentir, roubar ou abandonar alguém?",
    "PARA"
  ],
  [
    "q6",
    "O que seu personagem mais teme perder agora?",
    "Responda com sinceridade.",
    "SHORT"
  ],
  [
    "q7",
    "FILTRO RP (obrigatório)",
    "Explique: MetaGaming, PowerGaming e por que a morte deve ser temida no RP.",
    "PARA"
  ],
  [
    "q8",
    "CENA FINAL (mín. 6 linhas)",
    "Narre sua chegada ao Vale dos Ossos. Ambiente, sensações, medo e silêncio.",
    "PARA"
  ]
];

function isSteamIdOk(v: string) {
  const s = v.trim().replace(/^steam:/i, "");
  return /^\d{17}$/.test(s);
}

function countLines(v: string) {
  return v.split(/\r?\n/).filter((l) => l.trim().length > 0).length;
}

function rpFilterOk(v: string) {
  const t = v.toLowerCase();
  const ok =
    (t.includes("metagaming") || t.includes("meta")) &&
    (t.includes("powergaming") || t.includes("power")) &&
    t.includes("morte");
  return ok || v.trim().length >= 300;
}

function getCfgBrand(cfg: any) {
  return {
    color: typeof cfg?.brandColor === "number" ? cfg.brandColor : 0x111111,
    footer: cfg?.brandFooter ?? "Black",
  };
}

export async function whitelistStartFromButton(
  interaction: ButtonInteraction,
  opts?: { startQuestions?: boolean }
) {
  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild;
  if (!guild) return interaction.editReply("❌ Use em um servidor.");

  const cfg = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });
  if (!cfg?.whitelistRoleId || !cfg?.whitelistAccessChannelId) {
    return interaction.editReply(
      "❌ Whitelist não configurada (whitelistRoleId/whitelistAccessChannelId)."
    );
  }

  await prisma.whitelistApplication.upsert({
    where: { guildId_userId: { guildId: guild.id, userId: interaction.user.id } },
    create: { guildId: guild.id, userId: interaction.user.id, status: WhitelistStatus.IN_PROGRESS, currentStep: 0, answers: {} },
    update: {},
  });

  if (interaction.customId === "wl:request") {
    const member = await guild.members.fetch(interaction.user.id);
    await member.roles.add(cfg.whitelistRoleId).catch(() => null);
    return interaction.editReply(
      `✅ Você recebeu acesso. Vá ao canal <#${cfg.whitelistAccessChannelId}> e clique em **Iniciar Whitelist**.`
    );
  }

  if (opts?.startQuestions || interaction.customId === "wl:start") {
    await showStepModal(interaction, 1);
    return;
  }

  await interaction.editReply("✅ OK.");
}

async function showStepModal(interaction: ButtonInteraction, step: number) {
  const q = QUESTIONS[step - 1];
  const [, title, placeholder, kind] = q;

  const modal = new ModalBuilder().setCustomId(`wl:step:${step}`).setTitle(title);

  const input = new TextInputBuilder()
    .setCustomId("answer")
    .setLabel(title)
    .setPlaceholder(placeholder)
    .setStyle(kind === "SHORT" ? TextInputStyle.Short : TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(kind === "SHORT" ? 200 : 1000);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
}

export async function whitelistContinueModalSubmit(interaction: ModalSubmitInteraction) {
  const guild = interaction.guild;
  if (!guild) return;
  await interaction.deferReply({ ephemeral: true });

  const step = Number(interaction.customId.split(":")[2]); // 1..9
  const answer = interaction.fields.getTextInputValue("answer") ?? "";

  const app = await prisma.whitelistApplication.findUnique({
    where: { guildId_userId: { guildId: guild.id, userId: interaction.user.id } },
  });
  if (!app) return interaction.editReply("❌ Aplicação não encontrada. Clique em Iniciar Whitelist novamente.");

  if (step === 1 && !isSteamIdOk(answer)) {
    return interaction.editReply("❌ SteamID inválida. Envie 17 dígitos (Steam64).");
  }
  if (step === 8 && !rpFilterOk(answer)) {
    return interaction.editReply(
      "❌ Resposta insuficiente. Explique MetaGaming, PowerGaming e por que a morte deve ser temida (ou mínimo 300 chars)."
    );
  }
  if (step === 9 && countLines(answer) < 6) {
    return interaction.editReply("❌ Mínimo **6 linhas** na cena final. Use Enter para quebrar linhas.");
  }

  const answers = (app.answers as any) ?? {};
  const key = QUESTIONS[step - 1][0];
  answers[key] = answer.trim();

  await prisma.whitelistApplication.update({
    where: { id: app.id },
    data: { answers, currentStep: step, updatedAt: new Date() },
  });

  if (step < 9) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("wl:start").setLabel("Continuar").setStyle(ButtonStyle.Success)
    );
    return interaction.editReply({ content: `✅ Etapa **${step}/9** salva. Clique em **Continuar**.`, components: [row] });
  }

  const cfg = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });
  if (cfg?.whitelistPreResultRoleId) {
    const member = await guild.members.fetch(interaction.user.id);
    await member.roles.add(cfg.whitelistPreResultRoleId).catch(() => null);
  }

  await prisma.whitelistApplication.update({
    where: { id: app.id },
    data: { status: WhitelistStatus.SUBMITTED, submittedAt: new Date() },
  });

  await sendToStaff(guild.id, interaction.user.id);
  await interaction.editReply("✅ Whitelist enviada para análise. Aguarde a decisão da staff.");
}

async function sendToStaff(guildId: string, userId: string) {
  const cfg = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!cfg?.whitelistStaffChannelId) return;

  const client = globalThis.__blackbot_client;
  const guild = client?.guilds.cache.get(guildId);
  const ch = guild?.channels.cache.get(cfg.whitelistStaffChannelId) as any;
  if (!guild || !ch) return;

  const app = await prisma.whitelistApplication.findUnique({
    where: { guildId_userId: { guildId, userId } },
  });
  if (!app) return;

  const a = (app.answers as any) ?? {};
  const brand = getCfgBrand(cfg);

  const embed = new EmbedBuilder()
    .setColor(brand.color)
    .setTitle("📜 Whitelist — Nova aplicação")
    .setFooter({ text: brand.footer })
    .addFields(
      { name: "Usuário", value: `<@${userId}> (\`${userId}\`)` },
      { name: "SteamID", value: `\`${String(a.steam ?? "—").slice(0, 25)}\`` },
      { name: "1) Quem é você?", value: String(a.q1 ?? "—").slice(0, 1024) },
      { name: "2) De onde você veio?", value: String(a.q2 ?? "—").slice(0, 1024) },
      { name: "3) O que você fez para sobreviver?", value: String(a.q3 ?? "—").slice(0, 1024) },
      { name: "4) Em quem você confia?", value: String(a.q4 ?? "—").slice(0, 1024) },
      { name: "5) Até onde você iria?", value: String(a.q5 ?? "—").slice(0, 1024) },
      { name: "6) O que teme perder?", value: String(a.q6 ?? "—").slice(0, 1024) },
      { name: "7) Filtro RP", value: String(a.q7 ?? "—").slice(0, 1024) },
      { name: "8) Cena final", value: String(a.q8 ?? "—").slice(0, 1024) }
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`wl:approve:${app.id}`).setLabel("✅ Aprovar").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`wl:reject:${app.id}`).setLabel("❌ Reprovar").setStyle(ButtonStyle.Danger)
  );

  await ch.send({ embeds: [embed], components: [row] });
}

export async function staffDecisionButton(interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild!;
  const cfg = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });
  if (!cfg?.staffRoleId) return interaction.editReply("❌ staffRoleId não configurado.");

  const isStaff =
    interaction.member?.roles &&
    "cache" in interaction.member.roles &&
    interaction.member.roles.cache.has(cfg.staffRoleId);

  if (!isStaff) return interaction.editReply("❌ Apenas staff pode aprovar/reprovar.");

  const [_, action, appId] = interaction.customId.split(":");
  const app = await prisma.whitelistApplication.findUnique({ where: { id: appId } });
  if (!app) return interaction.editReply("❌ Aplicação não encontrada.");

  if (action === "approve") {
    const member = await guild.members.fetch(app.userId).catch(() => null);
    if (!member) return interaction.editReply("⚠️ Usuário não está no servidor.");

    if (cfg.whitelistRejectedRoleId) await member.roles.remove(cfg.whitelistRejectedRoleId).catch(() => null);
    if (cfg.whitelistApprovedRoleId) await member.roles.add(cfg.whitelistApprovedRoleId).catch(() => null);
    if (cfg.whitelistRoleId) await member.roles.remove(cfg.whitelistRoleId).catch(() => null);
    if (cfg.whitelistPreResultRoleId) await member.roles.remove(cfg.whitelistPreResultRoleId).catch(() => null);

    await prisma.whitelistApplication.update({
      where: { id: app.id },
      data: { status: WhitelistStatus.APPROVED, decidedAt: new Date(), decidedById: interaction.user.id },
    });

    try {
      await member.send("✅ Sua whitelist foi **APROVADA**. Bem-vindo ao Vale.");
    } catch {}

    return interaction.editReply("✅ Aprovado.");
  }

  if (action === "reject") {
    const modal = new ModalBuilder().setCustomId(`wl:reject_reason:${app.id}`).setTitle("Motivo da reprovação");
    const input = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Motivo (obrigatório)")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(600);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  return interaction.editReply("⚠️ Ação inválida.");
}

export async function staffRejectModalSubmit(interaction: ModalSubmitInteraction) {
  const guild = interaction.guild!;
  await interaction.deferReply({ ephemeral: true });

  const appId = interaction.customId.split(":")[2];
  const reason = interaction.fields.getTextInputValue("reason") ?? "—";
  const cfg = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });
  const app = await prisma.whitelistApplication.findUnique({ where: { id: appId } });
  if (!app) return interaction.editReply("❌ Aplicação não encontrada.");

  const member = await guild.members.fetch(app.userId).catch(() => null);
  if (!member) return interaction.editReply("⚠️ Usuário não está no servidor.");

  if (cfg?.whitelistApprovedRoleId) await member.roles.remove(cfg.whitelistApprovedRoleId).catch(() => null);
  if (cfg?.whitelistRejectedRoleId) await member.roles.add(cfg.whitelistRejectedRoleId).catch(() => null);
  if (cfg?.whitelistPreResultRoleId) await member.roles.remove(cfg.whitelistPreResultRoleId).catch(() => null);

  await prisma.whitelistApplication.update({
    where: { id: app.id },
    data: { status: WhitelistStatus.REJECTED, decidedAt: new Date(), decidedById: interaction.user.id, rejectReason: reason },
  });

  const msg =
    "O Vale ouviu sua história.\nMas ela não pertence a este lugar.\nVocê pode tentar novamente no futuro.";
  try {
    await member.send(msg);
  } catch {}

  if (cfg?.whitelistRejectLogChannelId) {
    const ch = guild.channels.cache.get(cfg.whitelistRejectLogChannelId) as any;
    if (ch) {
      await ch.send(`❌ Reprovado: <@${app.userId}> por <@${interaction.user.id}>\nMotivo: **${reason}**`);
    }
  }

  await interaction.editReply("✅ Reprovado e registrado.");
}
