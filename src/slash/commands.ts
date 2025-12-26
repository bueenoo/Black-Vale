import { SlashCommandBuilder } from "discord.js";

export const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Testa se o bot está respondendo."),
  new SlashCommandBuilder().setName("setup").setDescription("Abre o wizard de configuração do bot (admin)."),
  new SlashCommandBuilder()
    .setName("painel")
    .setDescription("Publica/Reposta painéis do bot.")
    .addStringOption((opt) =>
      opt
        .setName("tipo")
        .setDescription("Qual painel publicar")
        .setRequired(true)
        .addChoices({ name: "Whitelist", value: "whitelist" }, { name: "Tickets", value: "tickets" })
    ),
];
