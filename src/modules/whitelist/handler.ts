import {
  ButtonInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
} from "discord.js";
import { prisma } from "../../core/prisma.js";
import { WL_QUESTIONS } from "./questions.js";

type Session = {
  guildId: string;
  userId: string;
  step: number;
  answers: Record<string, string>;
  staffMsgId?: string;
};

const sessions = new Map<string, Session>(); // key = `${guildId}:${userId}`

function keyOf(guildId: string, userId: string) {
  return `${guildId}:${userId}`;
}

function brandTitle() {
  return "🦴 BLACK | VALE DOS OSSOS";
}

function dmApproved() {
  return (
    `${brandTitle()}\n\n` +
    "```O Vale ouviu sua história.\n\n" +
    "Ela não é limpa.\n" +
    "Ela não é fácil.\n" +
    "Mas é verdadeira.\n\n" +
    "Você foi ACEITO.\n\n" +
    "Lembre-se:\n" +
    "aqui, escolhas têm peso,\n" +
    "palavras salvam mais que armas,\n" +
    "e a morte nunca é trivial.\n\n" +
    "O Vale observa.\n" +
    "Boa sorte.```"
  );
}

function dmRejected(reason?: string) {
  const base =
    `${brandTitle()}\n\n` +
    "```O Vale ouviu sua história.\n\n" +
    "Mas ela não pertence a este lugar.\n" +
    "Não ainda.\n\n" +
    "Isso não é um julgamento pessoal.\n" +
    "É uma decisão narrativa.\n\n" +
    "Reflita.\n" +
    "Ajuste.\n" +
    "Volte quando estiver pronto.\n\n" +
    "O Vale não esquece.```";
  if (reason?.trim()) return base + `\n\n**Motivo do staff:** ${reason.trim()}`;
  return base;
}

async function ensureEphemeralReply(i: any) {
  if (!i.deferred && !i.replied) await i.deferReply({ ephemeral: true });
}

async function safeDM(user: any, content: string) {
  try {
    await user.send({ content });
  } catch {
    // ignore: DM fechada
  }
}

function rejectReasonModal(customId: string) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle("Motivo da reprovação (obrigatório)");

  const input = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel("Explique o motivo (seja objetivo)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMinLength(5)
    .setMaxLength(800)
    .setPlaceholder("Ex: Respostas curtas demais / incoerência narrativa / metagaming/powergaming mal explicado...");

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  return modal;
}

function questionModal(customId: string, step: number) {
  const q = WL_QUESTIONS[step];

  const modal = new ModalBuilder().setCustomId(customId).setTitle(`📼 GRAVAÇÃO — ${q.title}`);

  const input = new TextInputBuilder()
    .setCustomId("answer")
    .setLabel(q.label)
    .setStyle(q.style)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder(q.placeholder);

  if (q.minLen) input.setMinLength(q.minLen);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  return modal;
}

function staffEmbed(userTag: string, userId: string, answers: Record<string, string>) {
  const e = new EmbedBuilder()
    .setTitle("📜 Nova Whitelist — Vale dos Ossos")
    .setDescription(`👤 **${userTag}** (\`${userId}\`)`)
    .setColor(0x111111);

  for (let i = 0; i < WL_QUESTIONS.length; i++) {
    const q = WL_QUESTIONS[i];
    const v = (answers[q.id] ?? "").slice(0, 1024) || "_(vazio)_";
    e.addFields({ name: `${q.title} — ${q.label}`, value: v });
  }

  e.setFooter({ text: "O Vale observa." });
  return e;
}

function staffButtons(guildId: string, userId: string) {
  // customIds carregam o alvo (guild+user)
  const approveId = `wl:approve:${guildId}:${userId}`;
  const rejectId = `wl:reject:${guildId}:${userId}`;

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(approveId).setLabel("✅ Aprovar").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(rejectId).setLabel("❌ Reprovar").setStyle(ButtonStyle.Danger),
  );
}

// =============================
// START (botão iniciar)
// =============================
export async function whitelistStartButton(interaction: ButtonInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return;

  const userId = interaction.user.id;

  // evita 2 sessões ao mesmo tempo
  sessions.set(keyOf(guildId, userId), {
    guildId,
    userId,
    step: 0,
    answers: {},
  });

  // cargo "Em Análise"
  const cfg = await prisma.guildConfig.findUnique({ where: { guildId } });
  const member = await interaction.guild?.members.fetch(userId).catch(() => null);

  if (cfg?.whitelistPreResultRoleId && member) {
    await member.roles.add(cfg.whitelistPreResultRoleId).catch(() => null);
  }

  await ensureEphemeralReply(interaction);
  await interaction.editReply({
    content:
      "📼 **GRAVAÇÃO INICIADA**\nArquivo corrompido. Data desconhecida.\n\n" +
      "Você não está aqui por acaso.\n" +
      "Se cruzou o Vale dos Ossos… algo o trouxe até nós.\n\n" +
      "Responda com calma.\nMentiras ecoam aqui.",
  });

  // abre a primeira pergunta (modal)
  await interaction.showModal(questionModal(`whitelist:answer:${guildId}:${userId}`, 0));
}

// =============================
// MODAL (respostas)
// =============================
export async function handleWhitelistAnswerModal(interaction: ModalSubmitInteraction) {
  const parts = interaction.customId.split(":"); // whitelist:answer:guildId:userId
  if (parts.length < 4) return;

  const guildId = parts[2];
  const userId = parts[3];

  // só o dono responde
  if (interaction.user.id !== userId) {
    await interaction.reply({ ephemeral: true, content: "⚠️ Este formulário não é seu." });
    return;
  }

  const sKey = keyOf(guildId, userId);
  const session = sessions.get(sKey);
  if (!session) {
    await interaction.reply({ ephemeral: true, content: "⚠️ Sua sessão expirou. Clique em **Iniciar Whitelist** novamente." });
    return;
  }

  const q = WL_QUESTIONS[session.step];
  const value = interaction.fields.getTextInputValue("answer")?.trim() ?? "";

  if (q.minLen && value.length < q.minLen) {
    await interaction.reply({
      ephemeral: true,
      content: `⚠️ Resposta curta demais para **${q.title}**. (mínimo ${q.minLen} caracteres)\nClique no botão e tente novamente.`,
    });
    return;
  }

  session.answers[q.id] = value;
  session.step++;

  // terminou?
  if (session.step >= WL_QUESTIONS.length) {
    sessions.delete(sKey);

    const cfg = await prisma.guildConfig.findUnique({ where: { guildId } });
    const staffChannelId = cfg?.whitelistStaffChannelId;

    if (!staffChannelId) {
      await interaction.reply({ ephemeral: true, content: "⚠️ Falta configurar **whitelistStaffChannelId** no /setup." });
      return;
    }

    const staffCh = await interaction.client.channels.fetch(staffChannelId).catch(() => null);
    if (!staffCh || staffCh.type !== ChannelType.GuildText) {
      await interaction.reply({ ephemeral: true, content: "⚠️ Canal do staff inválido. Configure no /setup." });
      return;
    }

    await (staffCh as any).send({
      embeds: [staffEmbed(interaction.user.tag, userId, session.answers)],
      components: [staffButtons(guildId, userId)],
    });

    await interaction.reply({
      ephemeral: true,
      content:
        "📼 **GRAVAÇÃO ENCERRADA**\n\n" +
        "Se você mentiu,\no Vale vai descobrir.\n\n" +
        "Se falou a verdade,\ntalvez sobreviva.\n\n" +
        "Talvez.",
    });

    return;
  }

  // próxima pergunta
  await interaction.showModal(questionModal(`whitelist:answer:${guildId}:${userId}`, session.step));
}

// =============================
// STAFF BUTTONS (aprovar / reprovar)
// =============================
export async function handleWhitelistDecisionButton(interaction: ButtonInteraction) {
  const id = interaction.customId; // wl:approve:guild:user | wl:reject:guild:user
  const parts = id.split(":");
  if (parts.length < 4) return;

  const action = parts[1]; // approve | reject
  const guildId = parts[2];
  const targetUserId = parts[3];

  // permissão staff
  const cfg = await prisma.guildConfig.findUnique({ where: { guildId } });

