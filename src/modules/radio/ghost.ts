import type { Client, TextChannel } from "discord.js";
import { ChannelType } from "discord.js";
import { RADIO_CHANNEL_ID } from "./handler.js";
import { buildRadioText, type RadioType, SIGNAL_STATUSES } from "./templates.js";
import { breakIntoRadioLines } from "./utils.js";

/* =========================================================
   BLACK — GHOST RADIO (GTA-style)
   - Transmissão a cada 4 horas (alinhada no relógio)
   - Edição especial quando evento ativo
   - Quadro de avisos (clima/tráfego/desaparecidos/facções)
   - Comerciais imersivos
   - Mensagens raras do Culto (Faith’s Gate)
   - Alertas manuais pela staff (via command.ts -> triggerManualBroadcast)
========================================================= */

const GHOST_ENABLED = true;
const GHOST_EVERY_HOURS = 4;

const AUTO_DELETE = true;
const AUTO_DELETE_MINUTES = 10;

const GHOST_TYPES: RadioType[] = ["BOATO", "AVISO", "CONFISSAO", "CLARA"];

/* ===================== MAPA ===================== */
const LOCATIONS = [
  "Milton","Jasper","Coleman","Blairsville","Troy","Sefner","Juno","Darby","Fairfax",
  "Rolling Hills","Bennett","Riggins","Bear Town","Buford","Hamilton","Centerville",
  "Aurora","Ruby Ridge","Hawkins",
  "Tyler","Broken Arrow","Lakeland","Ouray",
  "Camp Wannastay","Crystal Lake Campground","Three Frogs Campground",
  "Wounded Heel Campground","Camp Horizons","John's Pass Campground",
  "Camp Virtue","Camp Telluride","Camp Congregation","Hog Horn Camp",
  "International Airport","Eagle Mountain Rescue Center","Juno Barracks",
  "Glasgow Air Force Base","March Air Force Base","Fort Simmons",
  "Hawkins Nuclear Facility","Black Rock Barracks","Bishop Air Station",
  "Checkpoint West","Fort Hale",
  "Faith's Gate",
  "Bitterroot Speedway","Bitterroot Country Club","Industrial Park",
  "Resort","Silver Springs","Winter Park",
  "Windfarm","Sawmill","Quarry","Processing Plant","Junkyard","Cannibal Island",
];

/* ===================== LORE “BASE” ===================== */
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

const CTA_VISIT = ["visite, mas não demore", "vá cedo e saia antes do escuro", "observe de longe", "passe rápido, sem parar"];
const CTA_AVOID = ["evite depois das 18h", "não atravesse sozinho", "não acampe por perto", "desista se houver neblina"];

/* ===================== CULT (Faith’s Gate) ===================== */
const CULT_LINES = [
  "a fé não pede permissão. ela entra.",
  "o portão não é madeira. é escolha.",
  "se o vale ficou mudo, é porque ele está ouvindo.",
  "quem procura sinal, encontra dívida.",
  "a neblina não cobre — ela separa.",
];

const CULT_CALLS = [
  "falam que há vigias perto de **Faith's Gate**.",
  "alguém jurou ter visto velas acesas em **Faith's Gate** sem vento nenhum.",
  "se te oferecerem “água limpa” em **Faith's Gate**, não beba.",
];

/* ===================== COMERCIAIS (imersivos) ===================== */
const COMMERCIALS = [
  "📻 intervalo: troca justa no **Industrial Park**. ferro por comida. sem perguntas.",
  "📻 intervalo: precisa de curativo? passe no **Eagle Mountain Rescue Center** — se eles ainda estiverem lá.",
  "📻 intervalo: ferramentas e sucata no **Junkyard**. cuidado com os ‘donos’.",
  "📻 intervalo: corrida clandestina no **Bitterroot Speedway**. só entra quem aguenta a noite.",
  "📻 intervalo: madeira seca no **Sawmill**. paga caro, mas acende rápido.",
];

/* ===================== QUADRO DE AVISOS ===================== */
type BulletinKind = "TRAFEGO" | "CLIMA" | "DESAPARECIDO" | "FACCAO";
type Bulletin = { kind: BulletinKind; text: string; createdAt: number };

const BULLETINS_DEFAULT: Bulletin[] = [
  { kind: "CLIMA", text: "neblina baixa prevista. se o som sumir, não force caminho.", createdAt: 0 },
  { kind: "TRAFEGO", text: "movimento estranho na rota entre **Tyler** e **Lakeland**. vá por dentro.", createdAt: 0 },
  { kind: "DESAPARECIDO", text: "procura-se: ‘homem de jaqueta verde’. última vez visto em **Milton**.", createdAt: 0 },
  { kind: "FACCAO", text: "recado curto: ‘não acampe perto do **Quarry**’ — assinado: ninguém.", createdAt: 0 },
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
  "se você ouviu isso… talvez já seja tarde.",
  "há coisas no Vale que não querem ser vistas.",
];

/* ===================== ESTADO POR GUILD (EVENTO + BULLETINS) ===================== */
type EventState = {
  active: boolean;
  title?: string;
  until?: number; // ms timestamp
  cultBoost?: boolean;
  extraFrequencyMinutes?: number; // se quiser “rádio mais ativa” no evento
};

const EVENT_BY_GUILD = new Map<string, EventState>();
const BULLETINS_BY_GUILD = new Map<string, Bulletin[]>();

/* Exposto pro /radio (command.ts) */
export function setRadioEvent(guildId: string, next: EventState) {
  EVENT_BY_GUILD.set(guildId, next);
}

export function clearRadioEvent(guildId: string) {
  EVENT_BY_GUILD.set(guildId, { active: false });
}

export function addRadioBulletin(guildId: string, b: { kind: BulletinKind; text: string }) {
  const arr = BULLETINS_BY_GUILD.get(guildId) ?? [];
  arr.unshift({ kind: b.kind, text: b.text, createdAt: Date.now() });
  // limita pra não virar mural infinito
  BULLETINS_BY_GUILD.set(guildId, arr.slice(0, 20));
}

export function clearRadioBulletins(guildId: string) {
  BULLETINS_BY_GUILD.set(guildId, []);
}

/* Alerta manual (staff) */
export async function triggerManualBroadcast(client: Client, guildId: string, payload: { title: string; body: string; severity?: "INFO" | "WARN" | "CRITICAL" }) {
  const ch = await client.channels.fetch(RADIO_CHANNEL_ID).catch(() => null);
  if (!ch || ch.type !== ChannelType.GuildText) return;

  const sev = payload.severity ?? "WARN";
  const status = "SINAL FORTE";
  const type: RadioType = sev === "CRITICAL" ? "AVISO" : "BOATO";

  const header =
    sev === "CRITICAL" ? "🚨 ALERTA CRÍTICO" :
    sev === "WARN" ? "🚨 ALERTA" :
    "ℹ️ INFORMATIVO";

  const raw = `${header}: ${payload.title}\n\n${payload.body}`;
  const body = breakIntoRadioLines(raw, 42);

  const text = buildRadioText({
    status,
    type,
    signalLine: "transmissão priorizada…",
    body: `${body}\n\n— alerta manual | staff`,
    ghost: true,
  });

  const msg = await (ch as TextChannel).send({ content: text, allowedMentions: { parse: [] } });
  if (AUTO_DELETE) setTimeout(() => msg.delete().catch(() => null), AUTO_DELETE_MINUTES * 60 * 1000);
}

/* ===================== UTIL ===================== */
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function pick2(arr: string[]) {
  const a = pick(arr);
  let b = pick(arr);
  while (b === a) b = pick(arr);
  return [a, b];
}

function fingerprint(parts: string[]) {
  return parts.join("|").toLowerCase().replace(/\s+/g, " ").trim();
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

/* ===================== GERADOR “PROGRAMA” ===================== */
function buildBulletinBlock(guildId: string) {
  const custom = BULLETINS_BY_GUILD.get(guildId) ?? [];
  const base = BULLETINS_DEFAULT;
  const pool = [...custom, ...base];

  // pega 3 itens variados
  const picks: Bulletin[] = [];
  const kinds: BulletinKind[] = ["CLIMA", "TRAFEGO", "DESAPARECIDO", "FACCAO"];

  for (const k of kinds) {
    const options = pool.filter(p => p.kind === k);
    if (options.length) picks.push(pick(options));
  }

  // se tiver pouco, completa
  while (picks.length < 3 && pool.length) picks.push(pick(pool));

  const lines = picks.slice(0, 4).map(b => {
    const tag =
      b.kind === "CLIMA" ? "🌫️ clima" :
      b.kind === "TRAFEGO" ? "🚧 tráfego" :
      b.kind === "DESAPARECIDO" ? "🧷 desaparecidos" :
      "🕸️ facções";
    return `${tag}: ${b.text}`;
  });

  return lines.join("\n");
}

function shouldInjectCult(event: EventState | undefined) {
  const baseChance = 0.04; // 4%
  const boosted = event?.active && event?.cultBoost ? 0.35 : baseChance;
  return Math.random() < boosted;
}

function generateProgram(guildId: string, used: Set<string>) {
  const event = EVENT_BY_GUILD.get(guildId);
  // expira evento automaticamente
  if (event?.active && event.until && Date.now() > event.until) {
    EVENT_BY_GUILD.set(guildId, { active: false });
  }

  for (let i = 0; i < 25; i++) {
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

    const signal = pick(["transmissão sem origem…", "sinal fraco, repetindo…", "linha aberta…", "chiado constante…"]);

    const mainRaw = [
      `fonte: ${src}.`,
      `perto de **${avoid}** houve ${phen}.`,
      `se for a **${visit}**, ${pick(CTA_VISIT)}.`,
      `mas **${avoid}**… ${pick(CTA_AVOID)}.`,
      `conselho: ${adv}.`,
      rarity === "LEGEND" ? pick(LEGEND_LINES) : "",
    ].filter(Boolean).join("\n");

    const bulletin = buildBulletinBlock(guildId);
    const commercial = pick(COMMERCIALS);

    const cult =
      shouldInjectCult(event)
        ? `🩸 culto: ${pick(CULT_CALLS)}\n> ${pick(CULT_LINES)}`
        : "";

    const special =
      EVENT_BY_GUILD.get(guildId)?.active
        ? `📡 **EDIÇÃO ESPECIAL ATIVA**: ${(EVENT_BY_GUILD.get(guildId)?.title ?? "evento em andamento").toUpperCase()}`
        : "";

    const programRaw = [
      special ? special : "",
      mainRaw,
      "",
      "📌 quadro de avisos:",
      bulletin,
      "",
      commercial,
      "",
      cult ? cult : "",
      "",
      `🧭 visitar: ${visit}`,
      `⛔ evitar: ${avoid}`,
      "— ghost radio | vale dos ossos",
    ].filter(Boolean).join("\n");

    const fp = fingerprint([rarity, type, status, visit, avoid, src, phen, adv, title, signal, special, cult, bulletin, commercial]);

    if (!used.has(fp)) {
      used.add(fp);
      return {
        type,
        status,
        title,
        signal,
        body: breakIntoRadioLines(programRaw, 42),
      };
    }
  }
  return null;
}

/* ===================== START ===================== */
export function startGhostRadio(client: Client) {
  if (!GHOST_ENABLED) return;

  const used = new Set<string>();

  const sendScheduled = async () => {
    const ch = await client.channels.fetch(RADIO_CHANNEL_ID).catch(() => null);
    if (!ch || ch.type !== ChannelType.GuildText) return;

    const guildId = (ch as TextChannel).guildId;
    const p = generateProgram(guildId, used);
    if (!p) return;

    const text = buildRadioText({
      status: p.status,
      type: p.type as RadioType,
      signalLine: `**${p.title}** — ${p.signal}`,
      body: p.body,
      ghost: true,
    });

    const msg = await (ch as TextChannel).send({ content: text, allowedMentions: { parse: [] } });
    if (AUTO_DELETE) setTimeout(() => msg.delete().catch(() => null), AUTO_DELETE_MINUTES * 60 * 1000);
  };

  // 4/4h alinhado
  const first = msUntilNextBlock(GHOST_EVERY_HOURS);

  setTimeout(async () => {
    await sendScheduled().catch(() => null);
    setInterval(() => sendScheduled().catch(() => null), GHOST_EVERY_HOURS * 60 * 60 * 1000);
  }, first);

  // frequência extra durante evento (opcional)
  setInterval(() => {
    const chGuilds = Array.from(EVENT_BY_GUILD.entries()).filter(([_, ev]) => ev.active && (ev.extraFrequencyMinutes ?? 0) > 0);
    // se não tiver evento com extra, não faz nada
    if (!chGuilds.length) return;
    // envia “pulso” extra (sem spam)
    sendScheduled().catch(() => null);
  }, 30 * 60 * 1000); // checa a cada 30min (só transmite se tiver evento com extra)
}
