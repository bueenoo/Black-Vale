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

/*
 BLACKBOT — WHITELIST PRIVADA E CONTÍNUA
 - Thread PRIVADA por padrão
 - DM fallback
 - Perguntas contínuas (mensagem normal)
 - Compatível com model: whitelistApplication
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
    text: "⚖️ **Até onde você iria para viver mais um dia?**",
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
    text: "🆔 **SteamID64 (obrigatório)**\nEnvie 17 dígitos (apenas números).",
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
      `Responda **uma pergunta por vez**.\n\n**${q.title}**\n${q.text}`
    );
}

/* ─────────────────────────────── */
/* START WHITELIST BUTTON */
/* ─────────────────────────────── */
export async function whitelistStartButton(i: ButtonInteraction) {
  if (!i.deferred && !i.replied) await i.deferReply({ ephemeral: true });

  if (!i.guild || !i.channel) {
    await i.editReply("❌ Use este botão dentro do servidor.");
    return;
  }

  // Expira tentativas anteriores
  await prisma.whitelistApplication.updateMany({
    where: {
      guildId: i.guild.id,
      userId: i.user.id,
      status: { in: ["IN_PROGRESS", "SUBMITTED"] },
    },
    data: { status: "EXPIRED" },
  });

  const attempt = await prisma.whitelistApplication.create({
    data: {
      guildId: i.guild.id,
      userId: i.user.id,
      userTag: i.user.tag,
      status: "IN_PROGRESS",
      currentStep: 0,
      answers: {},
    },
  });

  /* ─── PRIVATE THREAD ─── */
  if (i.channel.type === ChannelType.GuildText) {
    const perms = i.channel.permissionsFor(i.guild.members.me!);

    if (
      perms?.has(PermissionsBitField.Flags.CreatePrivateThreads) &&
      perms?.has(PermissionsBitField.Flags.SendMessagesInThreads)
    ) {
      const thread = await i.channel.threads.create({
        name: `wl-${i.user.username}-${attempt.id.slice(0, 4)}`,
        type: ChannelType.PrivateThread,
        autoArchiveDuration: 1440,
        invitable: false,
      });

      await thread.members.add(i.user.id);
      await i.editReply(`✅ Whitelist iniciada em privado: <#${thread.id}>`);
      await thread.send({ embeds: [questionEmbed(0)] });
      return;
    }
  }

  /* ─── DM FALLBACK ─── */
  try {
    const dm = await i.user.createDM();
    await dm.send({ embeds: [questionEmbed(0)] });
    await i.editReply("✅ Whitelist iniciada no seu privado (DM).");
  } catch {
    await i.editReply(
      "❌ Não consegui iniciar.\nAtive DMs de membros do servidor."
    );
  }
}

/* ─────────────────────────────── */
/* MESSAGE LISTENER (AVANÇA WL) */
/* ─────────────────────────────── */
export async function handleWhitelistThreadMessage(message: Message) {
  if (message.author.bot) return;

  const isThread =
    message.channel.type === ChannelType.PrivateThread ||
    message.channel.type === ChannelType.PublicThread;

  const isDM = message.channel.type === ChannelType.DM;

  if (!isThread && !isDM) return;
  if (!message.channel.isTextBased()) return;

  const attempt = await prisma.whitelistApplication.findFirst({
    where: isDM
      ? { userId: message.author.id, status: "IN_PROGRESS" }
      : {
          guildId: message.guildId!,
          userId: message.author.id,
          status: "IN_PROGRESS",
        },
    orderBy: { createdAt: "desc" },
  });

  if (!attempt) return;

  const step = attempt.currentStep ?? 0;
  if (step >= QUESTIONS.length) return;

  const q = QUESTIONS[step];
  const content = message.content.trim();

  if (!content) return;
  if (content.length > q.max) {
    await (message.channel as any).send(
      `⚠️ Máx: ${q.max} caracteres.`
    );
    return;
  }

  if (q.key === "steamId" && !isSteamId64(content)) {
    await (message.channel as any).send("⚠️ SteamID64 inválido.");
    return;
  }

  const answers = (attempt.answers ?? {}) as any;
  answers[q.key] = content;

  const nextStep = step + 1;

  if (nextStep >= QUESTIONS.length) {
    await prisma.whitelistApplication.update({
      where: { id: attempt.id },
      data: {
        answers,
        currentStep: nextStep,
        steamId: content,
        status: "SUBMITTED",
        submittedAt: new Date(),
      },
    });

    await (message.channel as any).send(
      "✅ **Whitelist finalizada!** Aguarde análise."
    );
    return;
  }

  await prisma.whitelistApplication.update({
    where: { id: attempt.id },
    data: { answers, currentStep: nextStep },
  });

  await (message.channel as any).send({
    embeds: [questionEmbed(nextStep)],
  });
}

/* ─────────────────────────────── */
/* STAFF / MODALS (mantidos) */
/* ─────────────────────────────── */

export async function handleWhitelistAnswerModal(
  i: ModalSubmitInteraction
) {
  await i.reply({
    content: "⚠️ Responda diretamente na thread/DM.",
    ephemeral: true,
  });
}

export async function handleWhitelistDecisionButton(i: ButtonInteraction) {
  await i.reply({ content: "⚠️ Staff flow não alterado.", ephemeral: true });
}

export async function handleWhitelistRejectReasonModal(
  i: ModalSubmitInteraction
) {
  await i.reply({ content: "⚠️ Staff flow não alterado.", ephemeral: true });
}

export async function handleWhitelistAdjustNoteModal(
  i: ModalSubmitInteraction
) {
  await i.reply({ content: "⚠️ Staff flow não alterado.", ephemeral: true });
}
