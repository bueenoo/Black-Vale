export type RadioType =
  | "URGENTE"
  | "BOATO"
  | "AVISO"
  | "CONFISSAO"
  | "CLARA";

export const RADIO_TYPES: { label: string; value: RadioType; desc: string }[] = [
  { label: "🔴 Urgente", value: "URGENTE", desc: "Chamada de ação / logar agora" },
  { label: "🟠 Boato", value: "BOATO", desc: "Rumor / informação incompleta" },
  { label: "⚫ Aviso", value: "AVISO", desc: "Perigo territorial / evite área" },
  { label: "🕯️ Confissão", value: "CONFISSAO", desc: "Relato pessoal / medo / culpa" },
  { label: "📡 Transmissão clara", value: "CLARA", desc: "Pode ser verdade… ou armadilha" },
];

export const SIGNAL_STATUSES = [
  "SINAL FRACO",
  "INTERFERÊNCIA",
  "ORIGEM DESCONHECIDA",
  "TRANSMISSÃO INSTÁVEL",
  "SINAL INTERMITENTE",
  "GRAVAÇÃO ANTIGA",
] as const;

export type SignalStatus = (typeof SIGNAL_STATUSES)[number];

const GLITCH_LINES = [
  "…ksshh…",
  "…tzz—tzz…",
  "…ruído branco…",
  "…sopro no microfone…",
  "…batidas metálicas…",
  "…estática…",
];

const FOOTERS_BY_TYPE: Record<RadioType, string[]> = {
  URGENTE: [
    "Isso não vai se repetir.",
    "Se você ouviu, você já está envolvido.",
    "O vale não dá segunda chance.",
  ],
  BOATO: [
    "Ninguém confirma. Ninguém nega.",
    "Se for mentira, alguém ainda vai morrer por ela.",
    "Você não ouviu isso de mim.",
  ],
  AVISO: [
    "Entre sabendo que pode não sair.",
    "O mapa muda quando você fecha os olhos.",
    "Se atravessar, atravessa consciente.",
  ],
  CONFISSAO: [
    "Se isso chegou até você… já é tarde.",
    "Não procure meu nome. Procure meus rastros.",
    "Eu devia ter ficado calado.",
  ],
  CLARA: [
    "O silêncio também é um sinal.",
    "Às vezes a clareza é a isca.",
    "Se estava tudo calmo… agora não está.",
  ],
};

function pick<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function buildRadioText(args: {
  status: SignalStatus;
  type: RadioType;
  signalLine?: string;
  body: string;
  ghost?: boolean;
}) {
  const { status, type, signalLine, body, ghost } = args;

  const footer = pick(FOOTERS_BY_TYPE[type]);
  const sig = (signalLine ?? "").trim();

  const origin = ghost ? "ORIGEM: \"FANTASMA\"" : "ORIGEM: DESCONHECIDA";
  const glitchA = pick(GLITCH_LINES);
  const glitchB = pick(GLITCH_LINES);

  return [
    "```",
    "📻 TRANSMISSÃO DETECTADA",
    `STATUS: ${status}`,
    origin,
    "```",
    "",
    `_${glitchA}_`,
    sig ? `_${sig}_` : "",
    body,
    `_${glitchB}_`,
    "",
    "—",
    `_ ${footer} _`,
  ]
    .filter(Boolean)
    .join("\n");
}
