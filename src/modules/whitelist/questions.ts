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
    id: "steamId",
    title: "Q0 — STEAM ID (OBRIGATÓRIO)",
    label: "Seu SteamID64 (17 dígitos)",
    placeholder: "Ex: 7656119XXXXXXXXXX (somente números, 17 dígitos)",
    style: TextInputStyle.Short,
    minLen: 17,
  },
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
