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
import type { WhitelistStatus } from "@prisma/client";

/**
 * BLACKBOT — Whitelist (Privada + Contínua)
 * - Inicia em THREAD PRIVADA quando possível; se não der, cai para DM.
 * - Perguntas contínuas (responde com mensagem normal e o bot avança).
 * - Permite refazer WL: tentativa ativa vira EXPIRED e começa outra.
 * - Envia para staff (whitelistStaffChannelId) com botões: Aprovar / Reprovar / Ajuste
 * - Envia DM automática para o player em qualquer decisão.
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

function isSteamId64(v: string) {
  return /^\d{17}$/.test(v.trim());
}

function questionEmbed(step: number) {
  const q = QUESTIONS[step];
  return new EmbedBuilder()
    .setTitle("Whitelist — Vale dos Ossos")
    .setDescription(
      `Responda **uma pergunta por vez**.\n` +
        `Se errar, clique em **Iniciar Whitelist** novamente.\n\n` +
        `**${q.title}**\n${q.text}`
    );
}

async function expireActiveAttempts(guildId: string, userId: string) {
  const actives = await prisma.whitelistApplication.findMany({
    where: {
      guildId,
      userId,
      status: { in: ["IN_PROGRESS", "SUBMITTED"] },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  for (const a of actives) {
    await prisma.whitelistApplication.update({
      where: { id: a.id },
      data: { status: "EXPIRED", decisionNote: "Substituída por nova tentativa." },
    });
  }
}

async function createAttempt(guildId: string, userId: string, userTag: string) {
  await expireActiveAttempts(guildId, userId);

  return prisma.whitelistApplication.create({
    data: {
      guildId,
      userId,
      userTag,
      status: "IN_PROGRESS",
      currentStep: 0,
      answers: {},
    },
  });
}

// ─────────────────────────────────────────────────────────────
// PUBLIC EXPORTS (required by interactionCreate.ts)
// ─────────────────────────────────────────────────────────────

export async function whitelistStartButton(i: ButtonInteraction) {
  // ACK immediately so Discord never shows "Esta interação falhou"
  if (!i.deferred && !i.replied) await i.deferReply({ ephemeral: true });

  if (!i.guild || !i.channel) {
    await i.editReply("❌ Isso só funciona dentro de um servidor.");
    return;
  }

  const attempt = await createAttempt(i.guild.id, i.user.id, i.user.tag);

  // Try private thread (best UX)
  if (i.channel.type === ChannelType.GuildText) {
    const me = i.guild.members.me;
    const perms = me ? i.channel.permissionsFor(me) : null;

    const missing: string[] = [];
    const need = [
      ["ViewChannel", PermissionsBitField.Flags.ViewChannel],
      ["SendMessages", PermissionsBitField.Flags.SendMessages],
      ["CreatePrivateThreads", PermissionsBitField.Flags.CreatePrivateThreads],
      ["SendMessagesInThreads", PermissionsBitField.Flags.SendMessagesInThreads],
    ] as const;

    for (const [name, flag] of need) {
      if (!perms?.has(flag)) missing.push(name);
    }

    if (missing.length === 0) {
      try {
        const thread = await i.channel.threads.create({
          name: `wl-${i.user.username}-${attempt.id.slice(0, 6)}`,
          autoArchiveDuration: 1440,
          type: ChannelType.PrivateThread,
          invitable: false,
          reason: "Whitelist privada",
        });

        await thread.members.add(i.user.id);

        await i.editReply(`✅ Whitelist iniciada (privada)! Vá para: <#${thread.id}>`);
        await thread.send({ embeds: [questionEmbed(0)] });
        return;
      } catch (err: any) {
        // fall through to DM
      }
    }
  }

  // DM fallback
  try {
    const dm = await i.user.createDM();
    await dm.send({ embeds: [questionEmbed(0)] });
    await i.editReply("✅ Iniciei sua whitelist no seu privado (DM).");
  } catch {
    await i.editReply(
      "❌ Não consegui abrir sua whitelist.\n" +
        "➡️ Ative **DMs de membros do servidor** (Configurações de Privacidade) e tente novamente."
    );
  }
}

/**
 * Continuous Q&A handler called from messageCreate.ts
 * Works in Private Thread AND DM.
 */
export async function handleWhitelistThreadMessage(message: Message) {
  if (message.author.bot) return;

  const inThread = message.channel.isThread();
  const inDM = !message.guildId;

  if (!inThread && !inDM) return;

  // ensure we can send replies
  if (!message.channel.isTextBased()) return;

  const userId = message.author.id;

  // Find active attempt
  const attempt = await prisma.whitelistApplication.findFirst({
    where: inThread
      ? { guildId: message.guildId!, userId, status: "IN_PROGRESS" }
      : { userId, status: "IN_PROGRESS" },
    orderBy: { createdAt: "desc" },
  });

  if (!attempt) return;

  const step = attempt.currentStep ?? 0;
  if (step >= QUESTIONS.length) return;

  const q = QUESTIONS[step];
  const content = (message.content ?? "").trim();
  if (!content) return;

  if (content.length > q.max) {
    await (message.channel as any).send(`⚠️ Resposta muito longa. Limite: **${q.max}** caracteres.`);
    return;
  }

  if (q.key === "steamId" && !isSteamId64(content)) {
    await (message.channel as any).send("⚠️ SteamID64 inválido. Envie **17 dígitos** (apenas números).");
    return;
  }

  const answers = (attempt.answers ?? {}) as Record<string, any>;
  answers[q.key] = content;

  const nextStep = step + 1;

  // if last question answered, SUBMITTED
  if (nextStep >= QUESTIONS.length) {
    await prisma.whitelistApplication.update({
      where: { id: attempt.id },
      data: {
        answers,
        currentStep: nextStep,
        status: "SUBMITTED",
        steamId: String(answers.steamId ?? content),
        submittedAt: new Date(),
        userTag: message.author.tag,
      },
    });

    await (message.channel as any).send("✅ **Whitelist finalizada!** Enviada para análise da staff.");
    await sendToStaff(attempt.id, message);
    return;
  }

  await prisma.whitelistApplication.update({
    where: { id: attempt.id },
    data: {
      answers,
      currentStep: nextStep,
      userTag: message.author.tag,
    },
  });

  await (message.channel as any).send({ embeds: [questionEmbed(nextStep)] });
}

/**
 * Kept for compatibility (old modal flow).
 */
export async function handleWhitelistAnswerModal(i: ModalSubmitInteraction) {
  if (!i.deferred && !i.replied) {
    await i.reply({
      content: "⚠️ A whitelist foi atualizada. Responda diretamente na thread/DM.",
      ephemeral: true,
    });
  }
}

/**
 * Staff decision buttons: wl:decision:<approve|reject|adjust>:<appId>
 */
export async function handleWhitelistDecisionButton(i: ButtonInteraction) {
  if (!i.deferred && !i.replied) await i.deferReply({ ephemeral: true });

  const parts = i.customId.split(":");
  const action = parts[2];
  const appId = parts[3];

  if (!appId) {
    await i.editReply("❌ Aplicação inválida.");
    return;
  }

  const app = await prisma.whitelistApplication.findUnique({ where: { id: appId } });
  if (!app) {
    await i.editReply("❌ Aplicação não encontrada.");
    return;
  }

  if (action === "approve") {
    await prisma.whitelistApplication.update({
      where: { id: appId },
      data: {
        status: "APPROVED",
        decidedAt: new Date(),
        decidedById: i.user.id,
        decidedByTag: i.user.tag,
        decisionNote: null,
      },
    });

    await disableStaffCard(i, "APPROVED");
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
  const appId = parts[2];
  const channelId = parts[3];
  const messageId = parts[4];

  const reason = (i.fields.getTextInputValue("reason") ?? "").trim() || "Sem motivo.";

  if (!appId || !channelId || !messageId) {
    await i.editReply("❌ Dados inválidos.");
    return;
  }

  const app = await prisma.whitelistApplication.findUnique({ where: { id: appId } });
  if (!app) {
    await i.editReply("❌ Aplicação não encontrada.");
    return;
  }

  await prisma.whitelistApplication.update({
    where: { id: appId },
    data: {
      status: "REJECTED",
      decidedAt: new Date(),
      decidedById: i.user.id,
      decidedByTag: i.user.tag,
      decisionNote: reason,
    },
  });

  await disableStaffCardByIds(i, channelId, messageId, "REJECTED", reason);
  await notifyUser(i, app.userId, `❌ Sua whitelist foi **REPROVADA**.\nMotivo: ${reason}`);
  await i.editReply("✅ Reprovado e notificado (se DM aberta).");
}

export async function handleWhitelistAdjustNoteModal(i: ModalSubmitInteraction) {
  if (!i.deferred && !i.replied) await i.deferReply({ ephemeral: true });

  const parts = i.customId.split(":");
  const appId = parts[2];
  const channelId = parts[3];
  const messageId = parts[4];

  const note = (i.fields.getTextInputValue("note") ?? "").trim() || "Sem nota.";

  if (!appId || !channelId || !messageId) {
    await i.editReply("❌ Dados inválidos.");
    return;
  }

  const app = await prisma.whitelistApplication.findUnique({ where: { id: appId } });
  if (!app) {
    await i.editReply("❌ Aplicação não encontrada.");
    return;
  }

  await prisma.whitelistApplication.update({
    where: { id: appId },
    data: {
      status: "ADJUST",
      decidedAt: new Date(),
      decidedById: i.user.id,
      decidedByTag: i.user.tag,
      decisionNote: note,
    },
  });

  await disableStaffCardByIds(i, channelId, messageId, "ADJUST", note);
  await notifyUser(
    i,
    app.userId,
    `✍️ Sua whitelist precisa de **AJUSTE**.\nNota da staff: ${note}\n\n➡️ Clique em **Iniciar Whitelist** e reenviar.`
  );
  await i.editReply("✅ Ajuste enviado (se DM aberta).");
}

// ─────────────────────────────────────────────────────────────
// Staff message / card helpers
// ─────────────────────────────────────────────────────────────

async function sendToStaff(appId: string, message: Message) {
  const guildId = message.guildId;
  if (!guildId) return;

  const cfg = await prisma.guildConfig.findUnique({ where: { guildId } });
  const staffChannelId = cfg?.whitelistStaffChannelId;
  if (!staffChannelId) {
    await (message.channel as any).send("⚠️ Canal da staff não configurado (`whitelistStaffChannelId`).");
    return;
  }

  const guild = await message.client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  const staffChannel = await guild.channels.fetch(staffChannelId).catch(() => null);
  if (!staffChannel || !staffChannel.isTextBased()) return;

  const app = await prisma.whitelistApplication.findUnique({ where: { id: appId } });
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

async function disableStaffCard(i: ButtonInteraction, status: WhitelistStatus, note?: string) {
  const base = i.message.embeds?.[0];
  const embed = base ? EmbedBuilder.from(base) : new EmbedBuilder().setTitle("Whitelist");
  embed.setFooter({ text: `${status}${note ? " • " + note : ""} • ${i.user.tag}` });

  const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("wl:disabled:1").setLabel("Aprovar").setStyle(ButtonStyle.Success).setDisabled(true),
    new ButtonBuilder().setCustomId("wl:disabled:2").setLabel("Reprovar").setStyle(ButtonStyle.Danger).setDisabled(true),
    new ButtonBuilder().setCustomId("wl:disabled:3").setLabel("Ajuste").setStyle(ButtonStyle.Secondary).setDisabled(true),
  );

  await i.message.edit({ embeds: [embed], components: [disabledRow] }).catch(() => {});
}

async function disableStaffCardByIds(
  i: ModalSubmitInteraction,
  channelId: string,
  messageId: string,
  status: WhitelistStatus,
  note?: string
) {
  const guild = i.guild;
  if (!guild) return;

  const ch = await guild.channels.fetch(channelId).catch(() => null);
  if (!ch || !ch.isTextBased()) return;

  const msg = await (ch as any).messages.fetch(messageId).catch(() => null);
  if (!msg) return;

  const base = msg.embeds?.[0];
  const embed = base ? EmbedBuilder.from(base) : new EmbedBuilder().setTitle("Whitelist");
  embed.setFooter({ text: `${status}${note ? " • " + note : ""} • ${i.user.tag}` });

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
    await user.send(content);
  } catch {
    // DM closed; ignore
  }
}
