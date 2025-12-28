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
  PermissionFlagsBits,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

import { prisma } from "../../core/prisma.js";
import { WhitelistStatus } from "@prisma/client";

/**
 * WHITELIST (CONTÍNUA)
 * - Inicia criando uma THREAD privada para o jogador responder.
 * - Cada mensagem do jogador avança automaticamente para a próxima pergunta.
 * - Permite refazer whitelist: ao iniciar, se houver IN_PROGRESS/SUBMITTED, marcamos como EXPIRED (substituída).
 *
 * STAFF
 * - Card no canal de staff com botões: Aprovar / Reprovar / Ajuste
 * - Reprovar/Ajuste abrem modal de motivo/nota
 * - Após decisão: edita o card e desabilita botões
 */

/* =========================
   CONFIG: QUESTIONS
========================= */

type Question = {
  key: "nome" | "idade" | "steamId" | "xp" | "historia";
  title: string;
  prompt: string;
  placeholder: string;
  style: TextInputStyle;
  maxLength: number;
};

const QUESTIONS: Question[] = [
  {
    key: "nome",
    title: "Nome",
    prompt: "🧍 **Pergunta 1/5 — Quem é você?**\nDiga o nome que sobrou depois que o mundo acabou.",
    placeholder: "Ex: Kazimir Paká",
    style: TextInputStyle.Short,
    maxLength: 80,
  },
  {
    key: "idade",
    title: "Idade",
    prompt: "🎂 **Pergunta 2/5 — Idade**\nQuantos anos você tem?",
    placeholder: "Ex: 27",
    style: TextInputStyle.Short,
    maxLength: 3,
  },
  {
    key: "steamId",
    title: "SteamID64",
    prompt: "🆔 **Pergunta 3/5 — SteamID64 (obrigatório)**\nEnvie seu **SteamID64** (17 dígitos, apenas números).",
    placeholder: "Ex: 7656119XXXXXXXXXX",
    style: TextInputStyle.Short,
    maxLength: 17,
  },
  {
    key: "xp",
    title: "Experiência com RP",
    prompt: "🎭 **Pergunta 4/5 — Experiência com RP**\nResponda apenas: **Sim** ou **Não**.",
    placeholder: "Sim / Não",
    style: TextInputStyle.Short,
    maxLength: 3,
  },
  {
    key: "historia",
    title: "História do personagem",
    prompt:
      "📜 **Pergunta 5/5 — História (até 200 caracteres)**\n" +
      "Conte uma breve história do seu personagem baseada na lore do servidor.",
    placeholder: "Até 200 caracteres…",
    style: TextInputStyle.Paragraph,
    maxLength: 200,
  },
];

/* =========================
   UTILS
========================= */

function steamIdOk(v: string) {
  return /^\d{17}$/.test((v ?? "").trim());
}

function normalizeYesNo(v: string) {
  const low = (v ?? "").trim().toLowerCase();
  if (["sim", "s"].includes(low)) return "Sim";
  if (["não", "nao", "n"].includes(low)) return "Não";
  return null;
}

async function findLatestApp(guildId: string, userId: string) {
  return prisma.whitelistApplication.findFirst({
    where: { guildId, userId },
    orderBy: { createdAt: "desc" },
  });
}

function disableDecisionRow(appId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`wl:approve:${appId}`)
      .setLabel("✅ Aprovar")
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`wl:reject:${appId}`)
      .setLabel("❌ Reprovar")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`wl:adjust:${appId}`)
      .setLabel("✍️ Ajuste")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
}

function decisionRow(appId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`wl:approve:${appId}`).setLabel("✅ Aprovar").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`wl:reject:${appId}`).setLabel("❌ Reprovar").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`wl:adjust:${appId}`).setLabel("✍️ Ajuste").setStyle(ButtonStyle.Secondary)
  );
}

/* =========================
   START WHITELIST (BUTTON)
========================= */

export async function whitelistStartButton(interaction: ButtonInteraction) {
  const guild = interaction.guild;
  if (!guild) return;

  // Permissões mínimas: criar thread no canal
  if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: "❌ Use o botão em um canal de texto do servidor.", ephemeral: true });
    return;
  }

  // Se tiver uma aplicação ativa, NÃO bloqueia: marca como EXPIRED (substituída) e cria outra.
  const active = await prisma.whitelistApplication.findFirst({
    where: {
      guildId: guild.id,
      userId: interaction.user.id,
      status: { in: [WhitelistStatus.IN_PROGRESS, WhitelistStatus.SUBMITTED] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (active) {
    await prisma.whitelistApplication.update({
      where: { id: active.id },
      data: {
        status: WhitelistStatus.EXPIRED,
        decidedAt: new Date(),
        decisionNote: "Substituída por nova tentativa (refeita pelo jogador).",
      },
    });
  }

  // Cria nova aplicação
  const app = await prisma.whitelistApplication.create({
    data: {
      guildId: guild.id,
      userId: interaction.user.id,
      userTag: interaction.user.tag,
      status: WhitelistStatus.IN_PROGRESS,
      currentStep: 0,
      answers: {},
    },
  });

  // Cria thread privada para o jogador responder (resolve falta de permissão no canal)
  const parent = interaction.channel as TextChannel;
  const thread = await parent.threads.create({
    name: `wl-${interaction.user.username}-${app.id.slice(0, 6)}`,
    autoArchiveDuration: 1440,
    reason: "Whitelist contínua",
  });

  await thread.members.add(interaction.user.id);

  // Guarda threadId para validar mensagens
  await prisma.whitelistApplication.update({
    where: { id: app.id },
    data: {
      // @ts-expect-error - campo adicionado no schema (threadId)
      threadId: thread.id,
    },
  });

  await interaction.reply({
    content: `✅ Whitelist iniciada em: <#${thread.id}>`,
    ephemeral: true,
  });

  await thread.send(
    "📜 **Whitelist — Vale dos Ossos**\n" +
      "Responda **uma pergunta por vez**. Para refazer, é só clicar em **Iniciar Whitelist** novamente.\n\n" +
      QUESTIONS[0].prompt
  );
}

/* =========================
   MESSAGE FLOW (CONTÍNUA)
   -> chame isso no messageCreate
========================= */

export async function handleWhitelistThreadMessage(message: Message) {
  if (message.author.bot) return;
  if (!message.guildId) return;
  if (!message.channel.isThread()) return;

  const app = await prisma.whitelistApplication.findFirst({
    where: {
      guildId: message.guildId,
      userId: message.author.id,
      status: WhitelistStatus.IN_PROGRESS,
    },
    orderBy: { createdAt: "desc" },
  });
  if (!app) return;

  // Confere se a thread é a da aplicação (evita capturar msgs em outras threads)
  const threadId = (app as any).threadId as string | undefined;
  if (threadId && message.channel.id !== threadId) return;

  const step = app.currentStep;
  const q = QUESTIONS[step];
  if (!q) return;

  const content = (message.content ?? "").trim();

  // Validações
  if (q.key === "idade") {
    const n = Number(content);
    if (!Number.isFinite(n) || n <= 0 || n > 120) {
      await message.channel.send("⚠️ Idade inválida. Envie apenas um número (ex: 27).");
      return;
    }
  }

  if (q.key === "steamId" && !steamIdOk(content)) {
    await message.channel.send("⚠️ SteamID64 inválido. Envie **17 dígitos** (apenas números).");
    return;
  }

  if (q.key === "xp") {
    const yn = normalizeYesNo(content);
    if (!yn) {
      await message.channel.send("⚠️ Responda apenas **Sim** ou **Não**.");
      return;
    }
  }

  if (q.key === "historia" && content.length > 200) {
    await message.channel.send(`⚠️ Sua história passou de 200 caracteres (${content.length}). Reduza e envie novamente.`);
    return;
  }

  // Salva resposta
  const answers = (app.answers ?? {}) as Record<string, any>;
  answers[q.key] = q.key === "xp" ? normalizeYesNo(content) : content;

  const nextStep = step + 1;
  const done = nextStep >= QUESTIONS.length;

  const updated = await prisma.whitelistApplication.update({
    where: { id: app.id },
    data: {
      answers,
      currentStep: done ? step : nextStep,
      status: done ? WhitelistStatus.SUBMITTED : WhitelistStatus.IN_PROGRESS,
      submittedAt: done ? new Date() : undefined,
    },
  });

  if (done) {
    await message.channel.send("✅ **Whitelist finalizada!** Sua aplicação foi enviada para análise da staff.");
    await sendApplicationToStaff(message.client, message.guildId, updated.id);
    // opcional: arquiva thread
    try {
      await message.channel.setArchived(true, "Whitelist enviada para staff");
    } catch {}
    return;
  }

  // Próxima pergunta automaticamente
  await message.channel.send(QUESTIONS[nextStep].prompt);
}

/* =========================
   (LEGACY) MODAL: OPEN QUESTION
   Mantido para compatibilidade caso alguma rota antiga chame.
========================= */

async function openQuestionModal(interaction: ButtonInteraction, step: number) {
  const q = QUESTIONS[step];
  if (!q) return;

  const modal = new ModalBuilder()
    .setCustomId(`wl:answer:${step + 1}`)
    .setTitle(`Whitelist — ${q.title}`);

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
   (LEGACY) MODAL: SAVE ANSWER
========================= */

export async function handleWhitelistAnswerModal(interaction: ModalSubmitInteraction) {
  // O fluxo oficial agora é CONTÍNUO na thread; este handler fica como fallback.
  await interaction.reply({
    content: "⚠️ Whitelist atualizada: responda as perguntas na thread criada pelo botão **Iniciar Whitelist**.",
    ephemeral: true,
  });
}

/* =========================
   STAFF: DECISION BUTTONS
========================= */

export async function handleWhitelistDecisionButton(interaction: ButtonInteraction) {
  const guild = interaction.guild;
  if (!guild) return;

  const [_, action, appId] = interaction.customId.split(":");
  const cfg = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });
  if (!cfg?.staffReviewChannelId) {
    await interaction.reply({ content: "❌ staffReviewChannelId não configurado. Use /setup.", ephemeral: true });
    return;
  }

  // somente staff (ou admin) pode decidir
  const member = interaction.member;
  const isAdmin =
    !!member &&
    "permissions" in member &&
    (member.permissions as any).has?.(PermissionFlagsBits.Administrator);

  if (!isAdmin) {
    await interaction.reply({ content: "❌ Somente a staff pode aprovar/reprovar/ajustar.", ephemeral: true });
    return;
  }

  const app = await prisma.whitelistApplication.findUnique({ where: { id: appId } });
  if (!app) {
    await interaction.reply({ content: "❌ Aplicação não encontrada.", ephemeral: true });
    return;
  }

  // APROVAR: decisão direta (sem modal)
  if (action === "approve") {
    await prisma.whitelistApplication.update({
      where: { id: appId },
      data: {
        status: WhitelistStatus.APPROVED,
        decidedAt: new Date(),
        decidedById: interaction.user.id,
        decidedByTag: interaction.user.tag,
        decisionNote: null,
      },
    });

    // edita card e desabilita botões
    await finalizeStaffCard(interaction, appId, "✅ APROVADO", interaction.user.tag);

    // aqui você pode dar cargo se quiser (mantive fora para não quebrar tua lógica atual)
    await interaction.reply({ content: "✅ Aprovado.", ephemeral: true });
    return;
  }

  // REPROVAR: abrir modal de motivo
  if (action === "reject") {
    const modal = new ModalBuilder()
      .setCustomId(`wl:reject_reason:${appId}:${interaction.channelId}:${interaction.message.id}`)
      .setTitle("Reprovar whitelist");

    const input = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Motivo da reprovação")
      .setRequired(true)
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(600);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  // AJUSTE: abrir modal de nota
  if (action === "adjust") {
    const modal = new ModalBuilder()
      .setCustomId(`wl:adjust_note:${appId}:${interaction.channelId}:${interaction.message.id}`)
      .setTitle("Solicitar ajuste");

    const input = new TextInputBuilder()
      .setCustomId("note")
      .setLabel("O que precisa ser ajustado?")
      .setRequired(true)
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(600);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  await interaction.reply({ content: "⚠️ Ação inválida.", ephemeral: true });
}

/* =========================
   STAFF: REJECT REASON MODAL
========================= */

export async function handleWhitelistRejectReasonModal(interaction: ModalSubmitInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild;
  if (!guild) return;

  const parts = interaction.customId.split(":");
  const appId = parts[2];
  const channelId = parts[3];
  const messageId = parts[4];

  const reason = (interaction.fields.getTextInputValue("reason") ?? "").trim();

  const app = await prisma.whitelistApplication.findUnique({ where: { id: appId } });
  if (!app) return interaction.editReply("❌ Aplicação não encontrada.");

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

  await editStaffCard(interaction.client, channelId, messageId, appId, `❌ REPROVADO`, interaction.user.tag, reason);
  await interaction.editReply("✅ Reprovado e registrado.");
}

/* =========================
   STAFF: ADJUST NOTE MODAL
========================= */

export async function handleWhitelistAdjustNoteModal(interaction: ModalSubmitInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild;
  if (!guild) return;

  const parts = interaction.customId.split(":");
  const appId = parts[2];
  const channelId = parts[3];
  const messageId = parts[4];

  const note = (interaction.fields.getTextInputValue("note") ?? "").trim();

  const app = await prisma.whitelistApplication.findUnique({ where: { id: appId } });
  if (!app) return interaction.editReply("❌ Aplicação não encontrada.");

  await prisma.whitelistApplication.update({
    where: { id: appId },
    data: {
      status: WhitelistStatus.ADJUST,
      decidedAt: new Date(),
      decidedById: interaction.user.id,
      decidedByTag: interaction.user.tag,
      decisionNote: note,
    },
  });

  await editStaffCard(interaction.client, channelId, messageId, appId, `✍️ AJUSTE`, interaction.user.tag, note);

  // tenta avisar o jogador por DM (se der)
  try {
    const user = await interaction.client.users.fetch(app.userId);
    await user.send(
      "✍️ Sua whitelist precisa de ajuste.\n" +
        `**Nota da staff:** ${note}\n\n` +
        "Para reenviar, clique em **Iniciar Whitelist** no servidor e responda novamente."
    );
  } catch {}

  await interaction.editReply("✅ Ajuste registrado e notificação enviada (se possível).");
}

/* =========================
   STAFF: SEND APPLICATION
========================= */

async function sendApplicationToStaff(client: any, guildId: string, appId: string) {
  const cfg = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!cfg?.staffReviewChannelId) return;

  const app = await prisma.whitelistApplication.findUnique({ where: { id: appId } });
  if (!app) return;

  const ch = await client.channels.fetch(cfg.staffReviewChannelId).catch(() => null);
  if (!ch || ch.type !== ChannelType.GuildText) return;

  const a = (app.answers ?? {}) as Record<string, any>;
  const fields = [
    { name: "Usuário", value: `<@${app.userId}> (${app.userTag ?? "—"})`, inline: false },
    { name: "SteamID64", value: String(a.steamId ?? app.steamId ?? "—"), inline: true },
    ...QUESTIONS.filter((q) => q.key !== "steamId").map((q) => ({
      name: q.title,
      value: String(a[q.key] ?? "—").slice(0, 1024),
      inline: false,
    })),
  ];

  const embed = new EmbedBuilder()
    .setTitle("📜 Whitelist — Nova aplicação")
    .setDescription(`Status: **${app.status}**\nID: \`${app.id}\``)
    .addFields(fields);

  await (ch as TextChannel).send({ embeds: [embed], components: [decisionRow(app.id)] });
}

/* =========================
   STAFF: EDIT CARD + DISABLE
========================= */

async function editStaffCard(
  client: any,
  channelId: string,
  messageId: string,
  appId: string,
  decisionLabel: string,
  staffTag: string,
  note?: string
) {
  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) return;

    const msg = await (channel as TextChannel).messages.fetch(messageId).catch(() => null);
    if (!msg) return;

    const embed = EmbedBuilder.from(msg.embeds[0] ?? new EmbedBuilder().setTitle("📜 Whitelist"));
    const footer = `${decisionLabel} • ${staffTag} • ${new Date().toLocaleString("pt-BR")}`;

    embed.setFooter({ text: footer });

    if (note) {
      embed.addFields({ name: "Nota / Motivo", value: String(note).slice(0, 1024), inline: false });
    }

    await msg.edit({ embeds: [embed], components: [disableDecisionRow(appId)] });
  } catch {}
}

async function finalizeStaffCard(interaction: ButtonInteraction, appId: string, decisionLabel: string, staffTag: string) {
  const msg = interaction.message;
  const embed = EmbedBuilder.from(msg.embeds[0] ?? new EmbedBuilder().setTitle("📜 Whitelist"));
  const footer = `${decisionLabel} • ${staffTag} • ${new Date().toLocaleString("pt-BR")}`;
  embed.setFooter({ text: footer });
  await interaction.message.edit({ embeds: [embed], components: [disableDecisionRow(appId)] }).catch(() => {});
}
