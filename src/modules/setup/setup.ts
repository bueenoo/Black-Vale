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

  // evita InteractionAlreadyReplied
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

  // IMPORTANTÍSSIMO:
  // O "value" precisa ser exatamente o nome do campo no Prisma (schema.prisma)
  let options: { label: string; value: string }[] = [];

  if (interaction.customId === "setup:page:welcome") {
    options = [
      { label: "Canal de boas-vindas (welcomeChannelId)", value: "welcomeChannelId" },
    ];
  }

  if (interaction.customId === "setup:page:tickets") {
    options = [
      { label: "Canal do painel de tickets (ticketPanelChannelId)", value: "ticketPanelChannelId" },
      { label: "Categoria dos tickets (ticketCategoryId)", value: "ticketCategoryId" },
      { label: "Cargo da staff (staffRoleId)", value: "staffRoleId" },
      { label: "Canal de logs/transcript (ticketLogChannelId)", value: "ticketLogChannelId" },
    ];
  }

  if (interaction.customId === "setup:page:whitelist") {
    options = [
      { label: "Canal do painel da whitelist (whitelistPanelChannelId)", value: "whitelistPanelChannelId" },
      { label: "Canal staff whitelist (whitelistStaffChannelId)", value: "whitelistStaffChannelId" },
      { label: "Canal de reprovação (whitelistRejectLogChannelId)", value: "whitelistRejectLogChannelId" },
      { label: "Cargo aprovado (whitelistApprovedRoleId)", value: "whitelistApprovedRoleId" },
      { label: "Cargo reprovado (whitelistRejectedRoleId)", value: "whitelistRejectedRoleId" },
      { label: "Cargo pré-resultado (whitelistPreResultRoleId)", value: "whitelistPreResultRoleId" },
      { label: "Cargo whitelist (acesso) (whitelistRoleId)", value: "whitelistRoleId" },
      { label: "Canal acesso whitelist (whitelistAccessChannelId)", value: "whitelistAccessChannelId" },
      { label: "Canal do painel iniciar (whitelistStartPanelChannelId)", value: "whitelistStartPanelChannelId" },
    ];
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId("setup:value")
    .setPlaceholder("Selecione o item que deseja definir")
    .addOptions(options);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

  await interaction.editReply({
    content:
      "Selecione o item que deseja configurar.\n" +
      "✅ O valor será salvo como **este canal atual** (ou use o canal onde você está agora).",
    components: [row],
  });
}

/* ======================================================
   SELECT MENU — SALVAR CONFIGURAÇÃO
====================================================== */
export async function setupValueSelect(interaction: StringSelectMenuInteraction) {
  if (!interaction.inGuild() || !interaction.guildId) return;

  await interaction.deferUpdate();

  const key = interaction.values[0]; // agora é tipo "welcomeChannelId"

  // Salva o ID do canal atual
  const value = interaction.channelId;

  await prisma.guildConfig.upsert({
    where: { guildId: interaction.guildId },
    create: {
      guildId: interaction.guildId,
      [key]: value,
    } as any,
    update: {
      [key]: value,
    } as any,
  });

  await interaction.editReply({
    content: `✅ Configuração salva: **${key}** = \`${value}\``,
    components: [],
  });
}

/* ======================================================
   PUBLICAR PAINÉIS (stub)
====================================================== */
export async function setupPublishButton(interaction: ButtonInteraction) {
  await interaction.deferUpdate();

  await interaction.editReply({
    content: "🚀 OK! (Publicação dos painéis será aplicada no próximo passo.)",
    components: [],
  });
}
