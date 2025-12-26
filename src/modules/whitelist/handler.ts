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
    // DM
