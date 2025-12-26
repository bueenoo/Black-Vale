import type { Client, TextChannel } from "discord.js";
import { ChannelType } from "discord.js";
import { RADIO_CHANNEL_ID } from "./handler.js";
import { buildRadioText, type RadioType, SIGNAL_STATUSES } from "./templates.js";
import { randInt, sleep, breakIntoRadioLines } from "./utils.js";

// ===== AJUSTES (IMERSÃO) =====
// Ligue/desligue aqui:
const GHOST_ENABLED = true;

// Frequência (min/max) em minutos:
const GHOST_MIN_MINUTES = 35;
const GHOST_MAX_MINUTES = 90;

// Duração da mensagem (auto-delete) em minutos:
const GHOST_AUTO_DELETE_MINUTES = 10;

// Tipos possíveis (pode remover URGENTE se quiser evitar spam)
const GHOST_TYPES: RadioType[] = ["BOATO", "AVISO", "CONFISSAO", "CLARA"];

// Banco de mensagens (IA leve = variação procedural)
const GHOST_BODIES: string[] = [
  "luzes na trilha velha… não são lanternas.
ninguém anda com tanta calma aqui.",
  "ouvi passos… mas não tinha pegadas.
se você sabe o que isso significa, não responda.",
  "o vale está mais quieto hoje.
quieto demais.
como se estivesse prendendo o ar.",
  "tem fumaça perto do rio.
mas não cheira a madeira.
cheira a metal quente.",
  "alguém marcou árvores com fita preta.
três nós.
se vir isso, volta.",
  "vi um carro parado.
porta aberta.
rádio ligado.
ninguém dentro.",
  "gritos, depois risada.
depois silêncio.
no mesmo lugar.
na mesma hora.",
];

function pick<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function startGhostRadio(client: Client) {
  if (!GHOST_ENABLED) return;

  const run = async () => {
    try {
      const ch = await client.channels.fetch(RADIO_CHANNEL_ID).catch(() => null);
      if (!ch || ch.type !== ChannelType.GuildText) return;

      const type = pick(GHOST_TYPES);
      const status = pick([...SIGNAL_STATUSES]);

      const body = breakIntoRadioLines(pick(GHOST_BODIES), 42);

      const text = buildRadioText({
        status,
        type,
        signalLine: "transmissão sem origem…",
        body,
        ghost: true,
      });

      const msg = await (ch as TextChannel).send({ content: text, allowedMentions: { parse: [] } });

      // apaga
      setTimeout(async () => {
        try {
          await msg.delete();
        } catch {
          // ignore
        }
      }, GHOST_AUTO_DELETE_MINUTES * 60 * 1000);
    } finally {
      // agenda próxima
      const next = randInt(GHOST_MIN_MINUTES, GHOST_MAX_MINUTES);
      setTimeout(run, next * 60 * 1000);
    }
  };

  // start depois de um tempinho (não spam no boot)
  const first = randInt(8, 20);
  setTimeout(run, first * 60 * 1000);
}
