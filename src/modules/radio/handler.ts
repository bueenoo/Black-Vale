import {
  ActionRowBuilder,
  ModalBuilder,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
  ModalSubmitInteraction,
  ChannelType,
  GuildMember,
} from "discord.js";
import { buildRadioText, SIGNAL_STATUSES, type RadioType, type SignalStatus } from "./templates.js";
import { breakIntoRadioLines, sanitizeRadioText, sleep, randInt } from "./utils.js";

// ===== CONFIG (FIXO) =====
export const RADIO_CHANNEL_ID = "1453867021140754543"; // 📻｜radio-bitterroot
export const RADIO_PUBLISH_ROLE_ID = "1453868618172596509"; // cargo que pode publicar

const COOLDOWN_MS = 2 * 60 * 1000; // 2 min por usuário
const FAKE_DELAY_MIN_MS = 3_000;
const FAKE_DELAY_MAX_MS = 10_000;

const AUTO_DELETE_MS = 10 * 60 * 1000; // 10 min

const lastSentAt = new Map<string, number>();

function hasRadioRole(member: GuildMember | null) {
  if (!member) return false;
  return member.roles.cache.has(RADIO_PUBLISH_ROLE_ID);
}

function pickStatus(type: RadioType): SignalStatus {
  if (type === "CLARA") return "TRANSMISSÃO INSTÁVEL";
  if (type === "CONFISSAO") return "SINAL FRACO";
  if (type === "URGENTE") return "SINAL INTERMITENTE";
  if (type === "AVISO") return "ORIGEM DESCONHECIDA";
  return SIGNAL_STATUSES[Math.floor(Math.random() * SIGNAL_STATUSES.length)];
}

export async function handleRadioTypeSelect(i: StringSelectMenuInteraction) {
  if (i.customId !== "radio:type_select") return;

  if (i.channelId !== RADIO_CHANNEL_ID) {
    await i.reply({ ephemeral: true, content: "📻 Este sistema funciona apenas no canal do rádio." });
    return;
  }

  const member = i.member instanceof GuildMember ? i.member : null;
  if (!hasRadioRole(member)) {
    await i.reply({ ephemeral: true, content: "⛔ Você não tem permissão para transmitir no rádio." });
    return;
  }

  const type = i.values[0] as RadioType;

  const modal = new ModalBuilder().setCustomId(`radio:submit:${type}`).setTitle("📻 Nova Transmissão");

  const signalLine = new TextInputBuilder()
    .setCustomId("signalLine")
    .setLabel("Linha de sinal (opcional) — ex: chiado, sopro")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(60)
    .setPlaceholder("chiado… sopro no microfone…");

  const body = new TextInputBuilder()
    .setCustomId("body")
    .setLabel("Mensagem (curta, fragmentada, sem OOC)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(500)
    .setPlaceholder("movimento estranho perto da rota velha...\nevitem passar sozinhos...");

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(signalLine),
    new ActionRowBuilder<TextInputBuilder>().addComponents(body)
  );

  await i.showModal(modal);
}

export async function handleRadioSubmit(i: ModalSubmitInteraction) {
  if (!i.customId.startsWith("radio:submit:")) return;

  if (i.channelId !== RADIO_CHANNEL_ID) {
    await i.reply({ ephemeral: true, content: "📻 Este sistema funciona apenas no canal do rádio." });
    return;
  }

  const member = i.member instanceof GuildMember ? i.member : null;
  if (!hasRadioRole(member)) {
    await i.reply({ ephemeral: true, content: "⛔ Você não tem permissão para transmitir no rádio." });
    return;
  }

  const userId = i.user.id;
  const now = Date.now();
  const last = lastSentAt.get(userId) ?? 0;
  if (now - last < COOLDOWN_MS) {
    await i.reply({
      ephemeral: true,
      content: "📻 O rádio ainda está quente. Aguarde um pouco antes de transmitir de novo.",
    });
    return;
  }

  // evita timeout do Discord
  await i.deferReply({ ephemeral: true });

  const type = i.customId.split(":")[2] as RadioType;
  const status = pickStatus(type);

  const signalLineRaw = i.fields.getTextInputValue("signalLine") ?? "";
  const bodyRaw = i.fields.getTextInputValue("body") ?? "";

  const signalLine = sanitizeRadioText(signalLineRaw);
  const bodySan = sanitizeRadioText(bodyRaw);
  const body = breakIntoRadioLines(bodySan, 42);

  const text = buildRadioText({ status, type, signalLine, body });

  const ch = await i.client.channels.fetch(RADIO_CHANNEL_ID).catch(() => null);
  if (!ch || ch.type !== ChannelType.GuildText) {
    await i.editReply("❌ Canal de rádio não encontrado. Avise o staff para configurar o ID do canal.");
    return;
  }

  // 🔊 delay falso (3–10s)
  const delay = randInt(FAKE_DELAY_MIN_MS, FAKE_DELAY_MAX_MS);
  await i.editReply("📡 Sintonizando… captando sinal…");
  await sleep(delay);

  const msg = await ch.send({ content: text, allowedMentions: { parse: [] } });
  lastSentAt.set(userId, Date.now());

  // ⏱️ apaga após 10 min
  setTimeout(async () => {
    try {
      await msg.delete();
    } catch {
      // ignore
    }
  }, AUTO_DELETE_MS);

  await i.editReply("✅ Transmissão enviada. O vale ouviu. (expira em 10 min)");
}
