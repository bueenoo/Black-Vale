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

/**
 * Whitelist module (private-first)
 * - Starts whitelist in a PRIVATE thread when possible, otherwise DM fallback.
 * - Continuous Q&A: user replies with normal messages, bot advances automatically.
 * - Allows restarting anytime (previous attempt becomes SUPERSEDED).
 * - Sends application to staff channel and supports Approve/Reject/Adjust (with DM notify).
 */

// ---- Questions (7) ----
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
    text: "⚖️ **Até onde você iria para viver mais um dia?**\nMentir, roubar ou abandonar alguém?",
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
    text: "🆔 **SteamID64 (obrigatório)**\nEnvie seu SteamID64 (17 dígitos, apenas números).",
    max: 32,
  },
] as const;

type WhitelistStatus = "PENDING" | "SUBMITTED" | "APPROVED" | "REJECTED" | "ADJUST" | "SUPERSEDED";

function isSteamId64(v: string) {
  return /^\d{17}$/.test(v.trim());
}

async function safeDM(userId: string, content: string) {
  try {
    // We don't have client here; use Discord.js interaction objects when available.
    // This helper is used only where we already have a user object.
  } catch {}
}

async function createNewAttempt(guildId: string, userId: string) {
  const active = await prisma.whitelist.findFirst({
    where: {
      guildId,
      userId,
      status: { in: ["PENDING", "SUBMITTED"] as any },
    },
    orderBy: { createdAt: "desc" },
  });

  if (active) {
    await prisma.whitelist.update({
      where: { id: active.id },
      data: { status: "SUPERSEDED" as any, supersededAt: new Date() as any },
    });
  }

  const attempt = await prisma.whitelist.create({
    data: {
      guildId,
      userId,
      status: "PENDING" as any,
      step: 0,
      answers: {},
    },
  });

  return attempt;
}

function buildQuestionEmbed(step: number) {
  const q = QUESTIONS[step];
  return new EmbedBuilder()
    .setTitle(`Whitelist — Vale dos Ossos`)
    .setDescription(`Responda uma pergunta por vez.\nSe errar, clique em **Iniciar Whitelist** novamente.\n\n**${q.title}**\n${q.text}`);
}

// ---- PUBLIC EXPORTS ----

/**
 * Button handler: Start whitelist
 */
export async function whitelistStartButton(i: ButtonInteraction) {
  // ACK immediately to avoid "Esta interação falhou"
  if (!i.deferred && !i.replied) await i.deferReply({ ephemeral: true });

  if (!i.guild || !i.channel) {
    await i.editReply("❌ Isso só funciona dentro de um servidor.");
    return;
  }

  // Create attempt
  const attempt = await createNewAttempt(i.guild.id, i.user.id);

  // Prefer private thread in the current text channel
  if (i.channel.type === ChannelType.GuildText) {
    const me = i.guild.members.me;
    const perms = me ? i.channel.permissionsFor(me) : null;

    const canPrivate =
      perms?.has(PermissionsBitField.Flags.ViewChannel) &&
      perms?.has(PermissionsBitField.Flags.SendMessages) &&
      perms?.has(PermissionsBitField.Flags.CreatePrivateThreads) &&
      perms?.has(PermissionsBitField.Flags.SendMessagesInThreads);

    if (canPrivate) {
      try {
        const thread = await i.channel.threads.create({
          name: `wl-${i.user.username}-${attempt.id.slice(0, 6)}`,
          autoArchiveDuration: 1440,
          type: ChannelType.PrivateThread,
          invitable: false,
          reason: "Whitelist privada",
        });

        await thread.members.add(i.user.id);

        // store threadId if column exists (optional)
        try {
          await prisma.whitelist.update({
            where: { id: attempt.id },
            data: { threadId: thread.id as any },
          });
        } catch {}

        await i.editReply(`✅ Whitelist iniciada (privada)! Vá para: <#${thread.id}>`);

        await thread.send({ embeds: [buildQuestionEmbed(0)] });
        return;
      } catch (err: any) {
        // fall through to DM fallback
      }
    }
  }

  // DM fallback (fully private)
  try {
    const dm = await i.user.createDM();
    await dm.send({ embeds: [buildQuestionEmbed(0)] });
    await i.editReply("✅ Iniciei sua whitelist no seu privado (DM).");
    // mark as DM mode (optional)
    try {
      await prisma.whitelist.update({ where: { id: attempt.id }, data: { dmMode: true as any } });
    } catch {}
    return;
  } catch (err: any) {
    await i.editReply(
      "❌ Não consegui abrir sua whitelist.\n" +
        "➡️ Verifique se você permite **DMs de membros do servidor** e tente novamente."
    );
  }
}

/**
 * Continuous Q&A handler for thread or DM messages.
 * Must be called from src/handlers/messageCreate.ts
 */
export async function handleWhitelistThreadMessage(message: Message) {
  if (message.author.bot) return;

  const inThread = message.channel.isThread();
  const inDM = !message.guildId;

  if (!inThread && !inDM) return;

  // Identify user
  const userId = message.author.id;

  // Find active attempt
  // In thread: require guildId; in DM: pick latest PENDING attempt (any guild) (good enough for single-server bots)
  const attempt = await prisma.whitelist.findFirst({
    where: inThread
      ? { guildId: message.guildId!, userId, status: "PENDING" as any }
      : { userId, status: "PENDING" as any },
    orderBy: { createdAt: "desc" },
  });

  if (!attempt) return;

  const step: number = (attempt.step ?? 0) as any;
  if (step >= QUESTIONS.length) return;

  const q = QUESTIONS[step];
  const content = (message.content ?? "").trim();

  // validations
  if (!content) return;

  if (q.key === "steamId" && !isSteamId64(content)) {
    await message.channel.send("⚠️ SteamID64 inválido. Envie **17 dígitos** (apenas números).");
    return;
  }

  if (content.length > q.max) {
    await message.channel.send(`⚠️ Resposta muito longa. Limite: **${q.max}** caracteres.`);
    return;
  }

  const answers = (attempt.answers ?? {}) as Record<string, any>;
  answers[q.key] = content;

  const nextStep = step + 1;

  const updated = await prisma.whitelist.update({
    where: { id: attempt.id },
    data: {
      answers,
      step: nextStep,
      status: (nextStep >= QUESTIONS.length ? "SUBMITTED" : "PENDING") as any,
    },
  });

  if (nextStep >= QUESTIONS.length) {
    await message.channel.send("✅ **Whitelist finalizada!** Sua aplicação foi enviada para análise da staff.");
    await sendToStaff(updated.id, message);
    return;
  }

  await message.channel.send({ embeds: [buildQuestionEmbed(nextStep)] });
}

/**
 * Legacy modal handler (not used in continuous flow) — kept for compatibility with older routers
 */
export async function handleWhitelistAnswerModal(i: ModalSubmitInteraction) {
  if (!i.deferred && !i.replied) await i.reply({ content: "⚠️ Este fluxo de whitelist foi atualizado. Use as respostas na thread/DM.", ephemeral: true });
}

/**
 * Staff decision button handler (approve/reject/adjust)
 */
export async function handleWhitelistDecisionButton(i: ButtonInteraction) {
  if (!i.deferred && !i.replied) await i.deferReply({ ephemeral: true });

  const parts = i.customId.split(":");
  // wl:decision:<approve|reject|adjust>:<appId>
  const action = parts[2];
  const appId = parts[3];

  if (!appId) {
    await i.editReply("❌ Aplicação inválida.");
    return;
  }

  const app = await prisma.whitelist.findUnique({ where: { id: appId } });
  if (!app) {
    await i.editReply("❌ Aplicação não encontrada.");
    return;
  }

  if (action === "approve") {
    await prisma.whitelist.update({ where: { id: appId }, data: { status: "APPROVED" as any } });
    await updateStaffCard(i, "APPROVED", undefined);
    await notifyUser(i, app.userId, "✅ Sua whitelist foi **APROVADA**. Bem-vindo ao Vale.");
    await i.editReply("✅ Aprovado.");
    return;
  }

  if (action === "reject") {
    const modal = new ModalBuilder()
      .setCustomId(`wl:reject_reason:${appId}:${i.channelId}:${i.message.id}`)
      .setTitle("Reprovar Whitelist");

    const input = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Motivo da reprovação")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(500);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await i.showModal(modal);
    return;
  }

  if (action === "adjust") {
    const modal = new ModalBuilder()
      .setCustomId(`wl:adjust_note:${appId}:${i.channelId}:${i.message.id}`)
      .setTitle("Solicitar Ajuste");

    const input = new TextInputBuilder()
      .setCustomId("note")
      .setLabel("O que o player precisa corrigir?")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(500);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await i.showModal(modal);
    return;
  }

  await i.editReply("❌ Ação inválida.");
}

export async function handleWhitelistRejectReasonModal(i: ModalSubmitInteraction) {
  if (!i.deferred && !i.replied) await i.deferReply({ ephemeral: true });

  const parts = i.customId.split(":");
  // wl:reject_reason:<appId>:<channelId>:<messageId>
  const appId = parts[2];
  const channelId = parts[3];
  const messageId = parts[4];

  const reason = i.fields.getTextInputValue("reason")?.trim() ?? "Sem motivo.";

  if (!appId || !channelId || !messageId) {
    await i.editReply("❌ Dados do formulário inválidos.");
    return;
  }

  const app = await prisma.whitelist.findUnique({ where: { id: appId } });
  if (!app) {
    await i.editReply("❌ Aplicação não encontrada.");
    return;
  }

  await prisma.whitelist.update({ where: { id: appId }, data: { status: "REJECTED" as any, staffNote: reason as any } });

  await updateStaffCardByIds(i, channelId, messageId, "REJECTED", reason);
  await notifyUser(i, app.userId, `❌ Sua whitelist foi **REPROVADA**.\nMotivo: ${reason}`);
  await i.editReply("✅ Reprovado e notificado (se DM aberta).");
}

export async function handleWhitelistAdjustNoteModal(i: ModalSubmitInteraction) {
  if (!i.deferred && !i.replied) await i.deferReply({ ephemeral: true });

  const parts = i.customId.split(":");
  // wl:adjust_note:<appId>:<channelId>:<messageId>
  const appId = parts[2];
  const channelId = parts[3];
  const messageId = parts[4];

  const note = i.fields.getTextInputValue("note")?.trim() ?? "Sem nota.";

  if (!appId || !channelId || !messageId) {
    await i.editReply("❌ Dados do formulário inválidos.");
    return;
  }

  const app = await prisma.whitelist.findUnique({ where: { id: appId } });
  if (!app) {
    await i.editReply("❌ Aplicação não encontrada.");
    return;
  }

  await prisma.whitelist.update({ where: { id: appId }, data: { status: "ADJUST" as any, staffNote: note as any } });

  await updateStaffCardByIds(i, channelId, messageId, "ADJUST", note);
  await notifyUser(i, app.userId, `✍️ Sua whitelist precisa de **AJUSTE**.\nNota da staff: ${note}\n\n➡️ Você pode clicar em **Iniciar Whitelist** e reenviar.`);
  await i.editReply("✅ Ajuste enviado (se DM aberta).");
}

// ---- Staff helpers ----

async function sendToStaff(appId: string, message: Message) {
  // Determine guildId
  const guildId = message.guildId;
  if (!guildId) return;

  const cfg = await prisma.guildConfig.findUnique({ where: { guildId } });
  const staffChannelId = (cfg as any)?.whitelistStaffChannelId as string | null;

  if (!staffChannelId) {
    await message.channel.send("⚠️ Staff channel não configurado (`whitelistStaffChannelId`).");
    return;
  }

  const guild = message.client.guilds.cache.get(guildId) ?? (await message.client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return;

  const staffChannel = await guild.channels.fetch(staffChannelId).catch(() => null);
  if (!staffChannel || !staffChannel.isTextBased()) return;

  const app = await prisma.whitelist.findUnique({ where: { id: appId } });
  if (!app) return;

  const answers = (app.answers ?? {}) as Record<string, any>;

  const embed = new EmbedBuilder()
    .setTitle("🧾 Whitelist — Nova aplicação")
    .setDescription(`**User:** <@${app.userId}>\n**AppID:** \`${app.id}\``)
    .addFields(
      { name: "Nome", value: String(answers.nome ?? "-").slice(0, 1024) },
      { name: "Origem", value: String(answers.origem ?? "-").slice(0, 1024) },
      { name: "Sobrevivência", value: String(answers.sobrevivencia ?? "-").slice(0, 1024) },
      { name: "Confiança", value: String(answers.confianca ?? "-").slice(0, 1024) },
      { name: "Limite", value: String(answers.limite ?? "-").slice(0, 1024) },
      { name: "Medo", value: String(answers.medo ?? "-").slice(0, 1024) },
      { name: "SteamID64", value: String(answers.steamId ?? "-").slice(0, 1024) },
    )
    .setFooter({ text: "Aguardando decisão da staff" });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`wl:decision:approve:${app.id}`).setLabel("Aprovar").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`wl:decision:reject:${app.id}`).setLabel("Reprovar").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`wl:decision:adjust:${app.id}`).setLabel("Ajuste").setStyle(ButtonStyle.Secondary),
  );

  await (staffChannel as any).send({ embeds: [embed], components: [row] });
}

async function updateStaffCard(i: ButtonInteraction, status: WhitelistStatus, note?: string) {
  const embed = EmbedBuilder.from(i.message.embeds[0] ?? new EmbedBuilder().setTitle("Whitelist"));
  const footer = `${status}${note ? " • " + note : ""} • ${i.user.tag}`;
  embed.setFooter({ text: footer });

  const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("wl:disabled:1").setLabel("Aprovar").setStyle(ButtonStyle.Success).setDisabled(true),
    new ButtonBuilder().setCustomId("wl:disabled:2").setLabel("Reprovar").setStyle(ButtonStyle.Danger).setDisabled(true),
    new ButtonBuilder().setCustomId("wl:disabled:3").setLabel("Ajuste").setStyle(ButtonStyle.Secondary).setDisabled(true),
  );

  await i.message.edit({ embeds: [embed], components: [disabledRow] }).catch(() => {});
}

async function updateStaffCardByIds(i: ModalSubmitInteraction, channelId: string, messageId: string, status: WhitelistStatus, note?: string) {
  const guild = i.guild;
  if (!guild) return;

  const ch = await guild.channels.fetch(channelId).catch(() => null);
  if (!ch || !ch.isTextBased()) return;

  const msg = await (ch as any).messages.fetch(messageId).catch(() => null);
  if (!msg) return;

  const embed = EmbedBuilder.from(msg.embeds[0] ?? new EmbedBuilder().setTitle("Whitelist"));
  const footer = `${status}${note ? " • " + note : ""} • ${i.user.tag}`;
  embed.setFooter({ text: footer });

  const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("wl:disabled:1").setLabel("Aprovar").setStyle(ButtonStyle.Success).setDisabled(true),
    new ButtonBuilder().setCustomId("wl:disabled:2").setLabel("Reprovar").setStyle(ButtonStyle.Danger).setDisabled(true),
    new ButtonBuilder().setCustomId("wl:disabled:3").setLabel("Ajuste").setStyle(ButtonStyle.Secondary).setDisabled(true),
  );

  await msg.edit({ embeds: [embed], components: [disabledRow] }).catch(() => {});
}

async function notifyUser(i: ButtonInteraction | ModalSubmitInteraction, userId: string, content: string) {
  try {
    const user = await i.client.users.fetch(userId);
    if (!user) return;
    await user.send(content);
  } catch {
    // DM closed; ignore
  }
}
