import type { Client, TextChannel } from "discord.js";
import { ChannelType } from "discord.js";
import { RADIO_CHANNEL_ID } from "./handler.js";
import { buildRadioText, type RadioType, SIGNAL_STATUSES } from "./templates.js";
import { breakIntoRadioLines } from "./utils.js";

/* =========================================================
   GHOST RADIO — BLACK | VALE DOS OSSOS
   Transmissões a cada 4h (estilo rádio GTA)
   Boatos, alertas, relatos e lendas do mapa
========================================================= */

const GHOST_ENABLED = true;

// Transmissão fixa (em horas)
const GHOST_EVERY_HOURS = 4;

// Auto-delete (para não poluir o canal)
const AUTO_DELETE = true;
const AUTO_DELETE_MINUTES = 10;

// Tipos
const GHOST_TYPES: RadioType[] = ["BOATO", "AVISO", "CONFISSAO", "CLARA"];

/* ===================== MAPA ===================== */

const LOCATIONS = [
  // Towns
  "Milton","Jasper","Coleman","Blairsville","Troy","Sefner","Juno","Darby","Fairfax",
  "Rolling Hills","Bennett","Riggins","Bear Town","Buford","Hamilton","Centerville",
  "Aurora","Ruby Ridge","Hawkins",

  // Major Cities
  "Tyler","Broken Arrow","Lakeland","Ouray",

  // Campgrounds
  "Camp Wannastay","Crystal Lake Campground","Three Frogs Campground",
  "Wounded Heel Campground","Camp Horizons","John's Pass Campground",
  "Camp Virtue","Camp Telluride","Camp Congregation","Hog Horn Camp",

  // Military / Facilities
  "International Airport","Eagle Mountain Rescue Center","Juno Barracks",
  "Glasgow Air Force Base","March Air Force Base","Fort Simmons",
  "Hawkins Nuclear Facility","Black Rock Barracks","Bishop Air Station",
  "Checkpoint West","Fort Hale",

  // Cult
  "Faith's Gate",

  // POI
  "Bitterroot Speedway","Bitterroot Country Club","Industrial Park",
  "Resort","Silver Springs","Winter Park",
  "Windfarm","Sawmill","Quarry","Processing Plant","Junkyard","Cannibal Island",
];

/* ===================== LORE ===================== */

const SOURCES = [
  "um caminhoneiro de Lakeland",
  "um vigia do Checkpoint West",
  "um enfermeiro do Eagle Mountain Rescue Center",
  "um mecânico do Junkyard",
  "uma voz anônima no canal 3",
  "um caçador vindo de Ruby Ridge",
  "um desertor de Juno Barracks",
  "uma família do Crystal Lake Campground",
  "um segurança do Industrial Park",
  "alguém que passou por Cannibal Island",
];

const PHENOMENA = [
  "luzes imóveis dentro da neblina",
  "estática que aumenta quando alguém fala",
  "passos sem pegadas",
  "um assobio que imita pensamentos",
  "cheiro de metal quente perto d’água",
  "um rádio ligado num carro vazio",
  "fitas pretas amarradas em árvores",
  "silêncio total — até os insetos somem",
  "uma sombra parada que muda quando você pisca",
  "eco de risadas onde não há ninguém",
];

const ADVICE = [
  "se ouvir seu nome, não responda",
  "não siga luz nenhuma no nevoeiro",
  "não toque em mochila abandonada",
  "vá em grupo e sem lanterna",
  "marque no mapa e saia",
  "se a estática subir, fique em silêncio",
  "evite fogueiras altas",
  "deite e espere se o vale ficar mudo",
];

const CTA_VISIT = [
  "visite, mas não demore",
  "vá cedo e saia antes do escuro",
  "observe de longe",
  "passe rápido, sem parar",
];

const CTA_AVOID = [
  "evite depois das 18h",
  "não atravesse sozinho",
  "não acampe por perto",
  "desista se houver neblina",
];

/* ===================== RARIDADE ===================== */

type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "LEGEND";

function rollRarity(): Rarity {
  const r = Math.random();
  if (r < 0.7) return "COMMON";
  if (r < 0.92) return "UNCOMMON";
  if (r < 0.99) return "RARE";
  return "LEGEND";
}

const LEGEND_LINES = [
  "ninguém confirma. ninguém nega.",
  "se você ouviu isso, talvez já seja tarde.",
  "há coisas no Vale que não querem ser vistas.",
];

/* ===================== UTIL ===================== */

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pick2(arr: string[]) {
  const a = pick(arr);
  let b = pick(arr);
  while (b === a) b = pick(arr);
  return [a, b];
}

function fingerprint(parts: string[]) {
  return parts.join("|").toLowerCase();
}

function msUntilNextBlock(hours: number) {
  const now = new Date();
  const next = new Date(now);
  const h = now.getHours();
  const block = Math.floor(h / hours) * hours + hours;
  next.setHours(block % 24, 0, 10, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

/* ===================== GERADOR ===================== */

function generate(used: Set<string>) {
  for (let i = 0; i < 20; i++) {
    const rarity = rollRarity();
    const type = pick(GHOST_TYPES);
    const status = pick([...SIGNAL_STATUSES]);
    const [visit, avoid] = pick2(LOCATIONS);

    const src = pick(SOURCES);
    const phen = pick(PHENOMENA);
    const adv = pick(ADVICE);

    const title =
      rarity === "LEGEND" ? "relato proibido" :
      rarity === "RARE" ? "sinal interceptado" :
      rarity === "UNCOMMON" ? "nota de campo" :
      "boato de estrada";

    const signal = pick([
      "transmissão sem origem…",
      "sinal fraco, repetindo…",
      "linha aberta…",
      "chiado constante…",
    ]);

    const raw = [
      `fonte: ${src}.`,
      `perto de **${avoid}** houve ${phen}.`,
      `se for a **${visit}**, ${pick(CTA_VISIT)}.`,
      `mas **${avoid}**… ${pick(CTA_AVOID)}.`,
      `conselho: ${adv}.`,
      rarity === "LEGEND" ? pick(LEGEND_LINES) : "",
    ].filter(Boolean).join("\n");

    const fp = fingerprint([rarity, type, status, visit, avoid, src, phen, adv]);

    if (!used.has(fp)) {
      used.add(fp);
      return {
        type,
        status,
        title,
        signal,
        body: breakIntoRadioLines(raw, 42),
        visit,
        avoid,
      };
    }
  }
  return null;
}

/* ===================== START ===================== */

export function startGhostRadio(client: Client) {
  if (!GHOST_ENABLED) return;

  const used = new Set<string>();

  const send = async () => {
    const ch = await client.channels.fetch(RADIO_CHANNEL_ID).catch(() => null);
    if (!ch || ch.type !== ChannelType.GuildText) return;

    const g = generate(used);
    if (!g) return;

    const text = buildRadioText({
      status: g.status,
      type: g.type,
      signalLine: `**${g.title}** — ${g.signal}`,
      body: `${g.body}\n\n🧭 visitar: ${g.visit}\n⛔ evitar: ${g.avoid}\n— ghost radio | vale dos ossos`,
      ghost: true,
    });

    const msg = await (ch as TextChannel).send({ content: text, allowedMentions: { parse: [] } });

    if (AUTO_DELETE) {
      setTimeout(() => msg.delete().catch(() => null), AUTO_DELETE_MINUTES * 60 * 1000);
    }
  };

  const first = msUntilNextBlock(GHOST_EVERY_HOURS);

  setTimeout(async () => {
    await send();
    setInterval(send, GHOST_EVERY_HOURS * 60 * 60 * 1000);
  }, first);
}
