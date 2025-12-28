import type { Client, TextChannel } from "discord.js";
import { ChannelType } from "discord.js";
import { RADIO_CHANNEL_ID } from "./handler.js";
import { buildRadioText, type RadioType, SIGNAL_STATUSES } from "./templates.js";
import { breakIntoRadioLines } from "./utils.js";

// ===== AJUSTES =====
const GHOST_ENABLED = true;

// Transmissão fixa a cada 4 horas (GTA-style)
const GHOST_EVERY_HOURS = 4;

// Auto-delete (se quiser manter histórico da rádio, coloque false)
const GHOST_AUTO_DELETE = true;
const GHOST_AUTO_DELETE_MINUTES = 10;

// Tipos possíveis
const GHOST_TYPES: RadioType[] = ["BOATO", "AVISO", "CONFISSAO", "CLARA"];

// ===== “MUNDO” / LORE =====
// Dica: troque os nomes pelos pontos reais do teu mapa (Bitterroot / Vale dos Ossos).
const LOCATIONS = [
  "Ponte Velha do Rio",
  "Trilha do Pinheiro Torto",
  "Mirante da Pedreira",
  "Celeiro Queimado",
  "Linha Férrea Partida",
  "Depósito de Carga",
  "Cabana do Caçador",
  "Posto de Vigilância",
  "Lagoa Escura",
  "Estrada do Asfalto Morto",
  "Túnel Alagado",
  "Capela em Ruínas",
  "Acampamento Abandonado",
  "Fazenda dos Corvos",
  "Bosque da Cerca Rasgada",
];

// Ganchos “de medo” (fragmentos combináveis)
const ODD_SIGNS = [
  "estática que aparece sozinha",
  "um assobio curto vindo do nada",
  "três estalos secos na mata",
  "passos sem pegadas",
  "luzes paradas dentro da neblina",
  "um rádio ligado num carro vazio",
  "fita preta amarrada em árvores, em três nós",
  "um cheiro de metal quente perto d’água",
  "um silêncio que engole até os insetos",
];

const WARNINGS = [
  "se ouvir seu nome, não responda",
  "não siga luz nenhuma no nevoeiro",
  "não toque em mochila largada no chão",
  "não entre sozinho",
  "marque no mapa e saia",
  "vá em grupo e sem lanterna acesa",
  "se a estática subir, deite e espere",
];

const NPC_RUMORS = [
  "um caminhante disse que viu alguém parado… sem respirar",
  "um pescador jurou que a água ‘olhou’ pra ele",
  "um minerador falou de batidas vindas de dentro da pedra",
  "um cara do sul falou de ‘gente’ que não faz barulho",
  "alguém deixou um bilhete: “não é neblina, é presença”",
];

const CTA_VISIT = [
  "visite, mas não demore",
  "vá cedo e saia antes do fim da tarde",
  "olhe de longe, não se aproxime",
  "passe rápido, sem parar",
];

const CTA_AVOID = [
  "evite depois das 18h",
  "não volte por esse caminho hoje",
  "não atravesse sozinho",
  "não acampe por perto",
];

// ===== util =====
function pick<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pick2Distinct(arr: string[]) {
  if (arr.length < 2) return [arr[0], arr[0]];
  const a = pick(arr);
  let b = pick(arr);
  while (b === a) b = pick(arr);
  return [a, b];
}

function clampLines(text: string, maxLines = 10) {
  const lines = text.split("\n").filter(Boolean);
  return lines.slice(0, maxLines).join("\n");
}

// gera uma “assinatura” curta pra evitar repetição e deixar único
function fingerprint(parts: string[]) {
  return parts.join("|").toLowerCase().replace(/\s+/g, " ").trim();
}

// agenda alinhado no relógio (00:00/04:00/08:00…)
function msUntilNext4hBlock(hours = 4) {
  const now = new Date();
  const next = new Date(now);

  const h = now.getHours();
  const nextBlock = Math.floor(h / hours) * hours + hours;

  next.setHours(nextBlock % 24, 0, 10, 0); // 10s depois do horário cheio
  if (next <= now) next.setDate(next.getDate() + 1);

  return next.getTime() - now.getTime();
}

// ===== gerador procedural (transmissão única) =====
type Generated = {
  type: RadioType;
  status: string;
  signalLine: string;
  body: string;
  visit: string;
  avoid: string;
  titleLine: string;
  fp: string;
};

function generateTransmission(prevFingerprints: Set<string>): Generated {
  // tenta algumas vezes pra garantir “único”
  for (let attempt = 0; attempt < 25; attempt++) {
    const type = pick(GHOST_TYPES);
    const status = pick([...SIGNAL_STATUSES]);

    const [visitLoc, avoidLoc] = pick2Distinct(LOCATIONS);
    const odd = pick(ODD_SIGNS);
    const rumor = pick(NPC_RUMORS);
    const warn = pick(WARNINGS);

    const visitCTA = pick(CTA_VISIT);
    const avoidCTA = pick(CTA_AVOID);

    // título curtinho, GTA vibe
    const titleLine = pick([
      "chamada de emergência",
      "boato confirmado por ninguém",
      "relato arquivado",
      "sinal interceptado",
      "nota de campo",
      "alerta da noite",
    ]);

    const signalLine = pick([
      "transmissão sem origem…",
      "sinal fraco, repetindo…",
      "chiado constante… alguém tá ouvindo…",
      "linha aberta… ninguém deveria estar aqui…",
      "captado no vale…",
    ]);

    // Corpo (procedural)
    const raw = [
      `${rumor}.`,
      `foi perto de **${avoidLoc}** — e veio junto com ${odd}.`,
      `um detalhe: quando a neblina baixou, a estrada parecia “errada”, como se o vale tivesse mudado.`,
      `se você for até **${visitLoc}**, ${visitCTA}.`,
      `mas **${avoidLoc}**… ${avoidCTA}.`,
      `e lembra: ${warn}.`,
      `se a estática subir, não discuta com o silêncio.`,
    ].join("\n");

    const fp = fingerprint([type, status, visitLoc, avoidLoc, odd, rumor, warn, titleLine, signalLine]);

    if (!prevFingerprints.has(fp)) {
      prevFingerprints.add(fp);

      // limita e quebra em linhas “de rádio”
      const body = breakIntoRadioLines(clampLines(raw, 12), 42);

      const visit = `🧭 visitar: ${visitLoc}`;
      const avoid = `⛔ evitar: ${avoidLoc}`;

      return { type, status, signalLine, body, visit, avoid, titleLine, fp };
    }
  }

  // fallback (raro): se saturar, ainda assim manda algo
  const type = pick(GHOST_TYPES);
  const status = pick([...SIGNAL_STATUSES]);
  const [visitLoc, avoidLoc] = pick2Distinct(LOCATIONS);

  const body = breakIntoRadioLines(
    clampLines(
      `ninguém confirma. ninguém nega.\nvisitar: ${visitLoc}\nevitar: ${avoidLoc}\nse ouvir estática, não responda.`,
      8
    ),
    42
  );

  const fp = fingerprint([type, status, visitLoc, avoidLoc, "fallback"]);
  prevFingerprints.add(fp);

  return {
    type,
    status,
    signalLine: "sinal fraco…",
    body,
    visit: `🧭 visitar: ${visitLoc}`,
    avoid: `⛔ evitar: ${avoidLoc}`,
    titleLine: "nota de campo",
    fp,
  };
}

// ===== runner =====
export function startGhostRadio(client: Client) {
  if (!GHOST_ENABLED) return;

  // memória de “não repetir” (persiste enquanto o processo estiver vivo)
  const used = new Set<string>();

  const runOnce = async () => {
    const ch = await client.channels.fetch(RADIO_CHANNEL_ID).catch(() => null);
    if (!ch || ch.type !== ChannelType.GuildText) return;

    const t = generateTransmission(used);

    const fullText = buildRadioText({
      status: t.status,
      type: t.type,
      signalLine: `**${t.titleLine}** — ${t.signalLine}`,
      body: `${t.body}\n\n${t.visit}\n${t.avoid}\n— ghost radio | vale dos ossos`,
      ghost: true,
    });

    const msg = await (ch as TextChannel).send({
      content: fullText,
      allowedMentions: { parse: [] },
    });

    if (GHOST_AUTO_DELETE) {
      setTimeout(async () => {
        try {
          await msg.delete();
        } catch {
          // ignore
        }
      }, GHOST_AUTO_DELETE_MINUTES * 60 * 1000);
    }
  };

  // alinha no relógio: 00:00/04:00/08:00/12:00/16:00/20:00
  const firstDelay = msUntilNext4hBlock(GHOST_EVERY_HOURS);

  setTimeout(async () => {
    // dispara a primeira alinhada
    await runOnce().catch(() => null);

    // e mantém rodando a cada 4h
    setInterval(() => {
      runOnce().catch(() => null);
    }, GHOST_EVERY_HOURS * 60 * 60 * 1000);
  }, firstDelay);
}
