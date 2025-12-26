import { TextInputStyle } from "discord.js";

export type WLQuestion = {
  id: string;
  title: string;
  label: string;
  placeholder: string;
  style: TextInputStyle;
  minLen?: number;
};

export const WL_QUESTIONS: WLQuestion[] = [
  {
    id: "q1_identidade",
    title: "Q1 — IDENTIDADE",
    label: "Quem é você?",
    placeholder:
      "Diga o nome que sobrou depois que o mundo acabou.\nEsse nome ainda te representa — ou apenas o que restou?",
    style: TextInputStyle.Short,
    minLen: 2,
  },
  {
    id: "q2_origem",
    title: "Q2 — ORIGEM",
    label: "De onde você veio?",
    placeholder: "Descreva o lugar que deixou para trás.\nO que aconteceu lá?\nPor que você nunca voltou?",
    style: TextInputStyle.Paragraph,
    minLen: 20,
  },
  {
    id: "q3_sobrevivencia",
    title: "Q3 — SOBREVIVÊNCIA",
    label: "O que você fez para sobreviver até aqui?",
    placeholder:
      "Roubo, violência ou omissão?\nExiste algo que ainda te persegue quando fica sozinho?\nSe acredita estar limpo demais, explique.",
    style: TextInputStyle.Paragraph,
    minLen: 30,
  },
  {
    id: "q4_confianca",
    title: "Q4 — CONFIANÇA",
    label: "Em quem você confia hoje?",
    placeholder: "Pessoas, grupos, ideias…\nou apenas em si mesmo?\nO que te levou a essa escolha?",
    style: TextInputStyle.Paragraph,
    minLen: 20,
  },
  {
    id: "q5_limites",
    title: "Q5 — LIMITES",
    label: "Até onde você iria para viver mais um dia?",
    placeholder:
      "Mentir para um aliado?\nRoubar comida de um ferido?\nAbandonar alguém para salvar a própria vida?\n\nExiste um limite que você não cruzaria?",
    style: TextInputStyle.Paragraph,
    minLen: 30,
  },
  {
    id: "q6_medo",
    title: "Q6 — MEDO REAL",
    label: "O que seu personagem mais teme perder agora?",
    placeholder: "Não falamos de loot.\nFalamos do que ainda te mantém humano.",
    style: TextInputStyle.Paragraph,
    minLen: 15,
  },
  {
    id: "q7_autoridade",
    title: "Q7 — AUTORIDADE",
    label: "Uma facção armada controla a região...",
    placeholder:
      "Uma facção oferece proteção em troca de obediência total.\n\nVocê aceita, resiste ou finge concordar?\nExplique sua escolha e as consequências esperadas.",
    style: TextInputStyle.Paragraph,
    minLen: 30,
  },
  {
    id: "q8_rp_hard",
    title: "Q8 — RP HARD (OBRIGATÓRIA)",
    label: "Explique com suas palavras:",
    placeholder:
      "• O que é MetaGaming\n• O que é PowerGaming\n• Por que a morte deve ser temida no RP hard",
    style: TextInputStyle.Paragraph,
    minLen: 40,
  },
  {
    id: "q9_consequencias",
    title: "Q9 — CONSEQUÊNCIAS",
    label: "Se suas ações causarem a morte de alguém...",
    placeholder:
      "Como isso afetaria seu personagem?\nCulpa, indiferença ou justificativa?\nExplique.",
    style: TextInputStyle.Paragraph,
    minLen: 20,
  },
  {
    id: "q10_cena_final",
    title: "Q10 — CENA FINAL",
    label: "Narre sua chegada ao Vale dos Ossos.",
    placeholder:
      "Descreva o ambiente, o silêncio e o medo.\nEscreva como a abertura de um filme.\n\nMínimo 8 linhas.",
    style: TextInputStyle.Paragraph,
    minLen: 80,
  },
];
