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
  PermissionFlagsBits,
} from "discord.js";

import { WL_QUESTIONS } from "./questions.js";

// ====== IDS FIXOS (BLACK | VALE DOS OSSOS) ======
const WL_STAFF_CHANNEL_ID = "1453867163612872824";
const STAFF_ROLE_ID = "1453868542809083965";
const ROLE_EM_ANALISE = "1453866441290944646";
const ROLE_APROVADO = "1453868618172596509";
// opcional (se não quiser, deixa null)
const ROLE_REPROVADO = "1453911181936033822";
// log de reprovação opcional
const WL_REJECT_LOG_CHANNEL_ID: string | null = null;
// ===============================================

type Session = {
  step: number;
  answers: Record<string, string>;
};

const sessions = new Map<string, Session>(); // key = `${guildId}:${userId}`

function sessionKey(guildId: string, userId: string) {
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

async function ensureEphemeral(i: any) {
  if (!i.deferred && !i.replied) await i.deferReply({ ephemeral: true });
}

async function safeDM(user: any, content: string) {
  try {
    await user.send({ content });
  } catch {
    // DM fechada
  }
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

function rejectReasonModal(customId: string) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle("Motivo da reprovação (obrigatório)");

  const input = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel("Explique o motivo (seja objetivo)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMinLength(5)
    .setMaxLength(800)
    .setPlaceholder("Ex: incoerência narrativa / respostas curtas / MG/PG mal explicado...");

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  return modal;
}

function staffEmbed(userTag: string, userId: string, answers: Record<string, string>) {
  const e = new EmbedBuilder()
    .setTitle("📜 Nova Whitelist — Vale dos Ossos")
    .setDescription(`👤 **${userTag}** (\`${userId}\`)`)
    .setColor(0x111111);

  for (const q of WL_QUESTIONS) {
    const v = (answers[q.id] ?? "").slice(0, 1024) || "_(vazio)_";
    e.addFields({ name: `${q.title} — ${q.label}`, value: v });
  }

  e.setFooter({ text: "O Vale observa." });
  return e;
}

function staffButtons(guildId: string, userId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`wl:approve:${guildId}:${userId}`).setLabel("✅ Aprovar").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`wl:reject:${guildId}:${userId}`).setLabel("❌ Reprovar").setStyle(ButtonStyle.Danger),
  );
}

// =============================
// START
// =============================
export async function whitelistStartButton(interaction: ButtonInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return;

  const userId = interaction.user.id;

  // evita iniciar 2x
  sessions.set(sessionKey(guildId, userId), { step: 0, answers: {} });

  // dá cargo em análise
  const member = await interaction.guild?.members.fetch(userId).catch(() => null);
  if (member && ROLE_EM_ANALISE) {
    await member.roles.add(ROLE_EM_ANALISE).catch(() => null);
  }

  await ensureEphemeral(interaction);
  await interaction.editReply({
    content:
      "📼 **GRAVAÇÃO INICIADA**\nArquivo corrompido. Data desconhecida.\n\n" +
      "Você não está aqui por acaso.\nSe cruzou o Vale dos Ossos… algo o trouxe até nós.\n\n" +
      "Responda com calma.\nMentiras ecoam aqui.",
  });

  await interaction.showModal(questionModal(`whitelist:answer:${guildId}:${userId}`, 0));
}

// =============================
// MODAL ANSWERS
// =============================
export async function handleWhitelistAnswerModal(interaction: ModalSubmitInteraction) {
  const parts = interaction.customId.split(":"); // whitelist:answer:guildId:userId
  if (parts.length < 4) return;

  const guildId = parts[2];
  const userId = parts[3];

  if (interaction.user.id !== userId) {
    await interaction.reply({ ephemeral: true, content: "⚠️ Este formulário não é seu." });
    return;
  }

  const s = sessions.get(sessionKey(guildId, userId));
  if (!s) {
    await interaction.reply({ ephemeral: true, content: "⚠️ Sua sessão expirou. Clique em **Iniciar Whitelist** novamente." });
    return;
  }

  const q = WL_QUESTIONS[s.step];
  const value = interaction.fields.getTextInputValue("answer")?.trim() ?? "";

  if (q.minLen && value.length < q.minLen) {
    await interaction.reply({
      ephemeral: true,
      content: `⚠️ Resposta curta demais para **${q.title}** (mínimo ${q.minLen} caracteres).`,
    });
    return;
  }

  s.answers[q.id] = value;
  s.step++;

  // terminou?
  if (s.step >= WL_QUESTIONS.length) {
    sessions.delete(sessionKey(guildId, userId));

    const staffCh = await interaction.client.channels.fetch(WL_STAFF_CHANNEL_ID).catch(() => null);
    if (!staffCh || !staffCh.isTextBased()) {
      await interaction.reply({ ephemeral: true, content: "⚠️ Canal do staff inválido (ID fixo). Verifique." });
      return;
    }

    await staffCh.send({
      embeds: [staffEmbed(interaction.user.tag, userId, s.answers)],
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
  await interaction.showModal(questionModal(`whitelist:answer:${guildId}:${userId}`, s.step));
}

// =============================
// STAFF DECISION BUTTONS
// =============================
export async function handleWhitelistDecisionButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":"); // wl:approve:guildId:userId
  if (parts.length < 4) return;

  const action = parts[1];
  const guildId = parts[2];
  const targetUserId = parts[3];

  // permissão staff
  const staffMember = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
  const hasStaffRole = !!(STAFF_ROLE_ID && staffMember?.roles.cache.has(STAFF_ROLE_ID));
  const isAdmin = !!staffMember?.permissions.has(PermissionFlagsBits.ManageGuild);

  if (!hasStaffRole && !isAdmin) {
    await interaction.reply({ ephemeral: true, content: "⛔ Você não tem permissão para decidir whitelist." });
    return;
  }

  if (action === "reject") {
    await interaction.showModal(rejectReasonModal(`wl:reject_reason:${guildId}:${targetUserId}`));
    return;
  }

  if (action === "approve") {
    await ensureEphemeral(interaction);

    const targetMember = await interaction.guild?.members.fetch(targetUserId).catch(() => null);

    if (targetMember) {
      await targetMember.roles.add(ROLE_APROVADO).catch(() => null);
      if (ROLE_EM_ANALISE) await targetMember.roles.remove(ROLE_EM_ANALISE).catch(() => null);
    }

    const user = await interaction.client.users.fetch(targetUserId).catch(() => null);
    if (user) await safeDM(user, dmApproved());

    await interaction.editReply({ content: "✅ Aprovado. DM enviada (se possível)." }).catch(() => null);

    await interaction.message.edit({
      content: `✅ **Whitelist APROVADA** por <@${interaction.user.id}>`,
      components: [],
    }).catch(() => null);

    return;
  }
}

// =============================
// REJECT MODAL (MOTIVO)
// =============================
export async function handleWhitelistRejectReasonModal(interaction: ModalSubmitInteraction) {
  const parts = interaction.customId.split(":"); // wl:reject_reason:guild:user
  if (parts.length < 4) return;

  const guildId = parts[2];
  const targetUserId = parts[3];
  const reason = interaction.fields.getTextInputValue("reason")?.trim() ?? "";

  // permissão staff
  const staffMember = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
  const hasStaffRole = !!(STAFF_ROLE_ID && staffMember?.roles.cache.has(STAFF_ROLE_ID));
  const isAdmin = !!staffMember?.permissions.has(PermissionFlagsBits.ManageGuild);

  if (!hasStaffRole && !isAdmin) {
    await interaction.reply({ ephemeral: true, content: "⛔ Você não tem permissão para reprovar whitelist." });
    return;
  }

  await ensureEphemeral(interaction);

  const targetMember = await interaction.guild?.members.fetch(targetUserId).catch(() => null);
  if (targetMember) {
    if (ROLE_REPROVADO) await targetMember.roles.add(ROLE_REPROVADO).catch(() => null);
    if (ROLE_EM_ANALISE) await targetMember.roles.remove(ROLE_EM_ANALISE).catch(() => null);
  }

  const user = await interaction.client.users.fetch(targetUserId).catch(() => null);
  if (user) await safeDM(user, dmRejected(reason));

  if (WL_REJECT_LOG_CHANNEL_ID) {
    const ch = await interaction.client.channels.fetch(WL_REJECT_LOG_CHANNEL_ID).catch(() => null);
    if (ch?.isTextBased()) {
      await ch.send({ content: `❌ WL reprovada: <@${targetUserId}> — por <@${interaction.user.id}>\n**Motivo:** ${reason}` }).catch(() => null);
    }
  }

  await interaction.editReply({ content: "❌ Reprovado. Motivo registrado e DM enviada (se possível)." }).catch(() => null);
}
