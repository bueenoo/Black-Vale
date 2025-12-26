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

export function buildRadioText(args: {
  status: SignalStatus;
  type: RadioType;
  signalLine?: string;
  body: string;
}) {
  const { status, type, signalLine, body } = args;

  const preface =
    type === "URGENTE"
      ? "Isso não vai se repetir."
      : type === "BOATO"
      ? "Ninguém confirma. Mas ninguém ri."
      : type === "AVISO"
      ? "Se atravessar, atravessa consciente."
      : type === "CONFISSAO"
      ? "Se isso chegar em alguém… já é tarde."
      : "Área aparentemente normal.";

  const sig = (signalLine ?? "").trim();
  const sigBlock = sig ? `*${sig}*\n\n` : "";

  return `📻 TRANSMISSÃO — ${status}\n\n${sigBlock}${body.trim()}\n\n— ${preface}`;
}
