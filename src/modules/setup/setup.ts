import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} from "discord.js";

import { prisma } from "../../core/prisma.js";

/* ======================================================
   /setup — COMANDO PRINCIPAL
====================================================== */
export async function setupCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.inGuild() || !interaction.guildId) {
    if (!interaction.replied) {
      await interaction.reply({
        ephemeral: true,
        content: "❌ Use este comando dentro de um servidor.",
      });
    }
    return;
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("setup:page:welcome")
      .setLabel("👋 Boas-vindas")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("setup:page:tickets")
      .setLabel("🎫 Tickets")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("setup:page:whitelist")
      .setLabel("📜 Whitelist")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("setup:publish")
      .setLabel("✅ Publicar painéis")
      .setStyle(ButtonStyle.Success)
  );

  await interaction.editReply({
    content: "🛠️ **Setup do Blackbot**\nEscolha o que deseja configurar:",
    components: [row],
  });
}

/* ======================================================
   BOTÕES DE NAVEGAÇÃO
====================================================== */
export async function setupPageButton(interaction: ButtonInteraction) {
  if (!interaction.inGuild() || !interaction.guildId) return;

  await interaction.deferUpdate();

  let options: { label: string; value: string }[] = [];

  if (interaction.customId === "setup:page:welcome") {
    options = [{ label: "Canal de boas-vindas", value: "welcomeChannel" }];
  }

  if (interaction.customId === "setup:page:tickets") {
    options = [
      { label: "Canal do painel de tickets", value: "ticketPanel" },
      { label: "Categoria dos tickets", value: "ticketCategory" },
      { label: "Cargo da staff", value: "staffRole" },
    ];
  }

  if (interaction.customId === "setup:page:whitelist") {
    options = [{ label: "Canal do painel da whitelist", value: "whitelistPanel" }];
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId("setup:value")
    .setPlaceholder("Selecione o item que deseja definir")
    .addOptions(options);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

  await interaction.editReply({
    content: "Selecione o item que deseja configurar.\nO valor será salvo como **este canal atual**.",
    components: [row],
  });
}

/* ======================================================
   SELECT MENU — SALVAR CONFIGURAÇÃO
====================================================== */
export async function setupValueSelect(interaction: StringSelectMenuInteraction) {
  if (!interaction.inGuild() || !interaction.guildId) return;

  await interaction.deferUpdate();

  const key = interaction.values[0];

  await prisma.guildConfig.upsert({
    where: { guildId: interaction.guildId },
    create: {
      guildId: interaction.guildId,
      [key]: interaction.channelId,
    } as any,
    update: {
      [key]: interaction.channelId,
    } as any,
  });

  await interaction.editReply({
    content: `✅ Configuração **${key}** salva com sucesso.`,
    components: [],
  });
}

/* ======================================================
   PUBLICAR PAINÉIS
====================================================== */
export async function setupPublishButton(interaction: ButtonInteraction) {
  await interaction.deferUpdate();

  await interaction.editReply({
    content: "🚀 Painéis publicados com sucesso.\n(Fluxo completo será expandido depois.)",
    components: [],
  });
}
