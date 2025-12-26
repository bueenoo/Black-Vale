import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
} from "discord.js";

import { prisma } from "../../core/prisma.js";

/* ======================================================
   Helpers: publicar painéis
====================================================== */
async function publishTicketsPanel(guildId: string) {
  const cfg = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!cfg?.ticketPanelChannelId) throw new Error("ticketPanelChannelId não configurado no /setup.");

  const channel = await (globalThis as any).client.channels.fetch(cfg.ticketPanelChannelId);
  if (!channel || !channel.isTextBased()) throw new Error("Canal do painel de tickets inválido.");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("tickets:create:SUPPORT").setLabel("⚙️ Suporte Técnico").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("tickets:create:REPORT").setLabel("🚨 Denúncia").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("tickets:create:DONATION").setLabel("💰 Doações").setStyle(ButtonStyle.Success)
  );

  const msg = await channel.send({
    content:
      "**🎫 TICKETS — BLACK**\n" +
      "Clique no botão abaixo para abrir um ticket.\n" +
      "Seu ticket será privado (você + staff).",
    components: [row],
  });

  await prisma.guildConfig.update({
    where: { guildId },
    data: { ticketPanelMessageId: msg.id },
  });

  return msg.id;
}

async function publishWhitelistPanel(guildId: string) {
  const cfg = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!cfg?.whitelistPanelChannelId) throw new Error("whitelistPanelChannelId não configurado no /setup.");

  const channel = await (globalThis as any).client.channels.fetch(cfg.whitelistPanelChannelId);
  if (!channel || !channel.isTextBased()) throw new Error("Canal do painel de whitelist inválido.");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("whitelist:start").setLabel("📜 Iniciar Whitelist").setStyle(ButtonStyle.Primary)
  );

  const msg = await channel.send({
    content:
      "**BLACK | VALE DOS OSSOS**\n\n" +
      "Se você chegou até aqui,\n" +
      "Isso não significa que será aceito.\n" +
      "O Vale já está te observando.\n\n" +
      "A whitelist é um interrogatório.\n" +
      "Não há respostas certas.\n" +
      "Há coerência… ou exclusão.\n\n" +
      "Clique no botão abaixo.\n" +
      "Não existe segunda chance.\n" +
      "O Vale está ouvindo.",
    components: [row],
  });

  await prisma.guildConfig.update({
    where: { guildId },
    data: { whitelistPanelMessageId: msg.id },
  });

  return msg.id;
}

/* ======================================================
   /setup — COMANDO PRINCIPAL
====================================================== */
export async function setupCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.inGuild() || !interaction.guildId) {
    if (!interaction.replied) {
      await interaction.reply({ ephemeral: true, content: "❌ Use este comando dentro de um servidor." });
    }
    return;
  }

  // evita InteractionAlreadyReplied
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("setup:page:welcome").setLabel("👋 Boas-vindas").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("setup:page:tickets").setLabel("🎫 Tickets").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("setup:page:whitelist").setLabel("📜 Whitelist").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("setup:publish").setLabel("✅ Publicar painéis").setStyle(ButtonStyle.Success)
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

  // O "value" precisa ser exatamente o nome do campo no Prisma
  let options: { label: string; value: string }[] = [];

  if (interaction.customId === "setup:page:welcome") {
    options = [{ label: "Canal de boas-vindas", value: "welcomeChannelId" }];
  }

  if (interaction.customId === "setup:page:tickets") {
    options = [
      { label: "Canal do painel de tickets", value: "ticketPanelChannelId" },
      { label: "Categoria dos tickets", value: "ticketCategoryId" },
      { label: "Cargo da staff", value: "staffRoleId" },
      { label: "Canal de logs/transcript", value: "ticketLogChannelId" },
    ];
  }

  if (interaction.customId === "setup:page:whitelist") {
    options = [
      { label: "Canal do painel da whitelist", value: "whitelistPanelChannelId" },
      { label: "Canal staff whitelist", value: "whitelistStaffChannelId" },
      { label: "Canal de reprovação (log)", value: "whitelistRejectLogChannelId" },
      { label: "Cargo aprovado", value: "whitelistApprovedRoleId" },
      { label: "Cargo reprovado", value: "whitelistRejectedRoleId" },
      { label: "Cargo pré-resultado", value: "whitelistPreResultRoleId" },
      { label: "Cargo whitelist (acesso)", value: "whitelistRoleId" },
      { label: "Canal acesso whitelist", value: "whitelistAccessChannelId" },
      { label: "Canal painel iniciar (opcional)", value: "whitelistStartPanelChannelId" },
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
      "✅ O valor salvo será o **canal onde você executou o /setup** (canal atual).",
    components: [row],
  });
}

/* ======================================================
   SELECT MENU — SALVAR CONFIGURAÇÃO
====================================================== */
export async function setupValueSelect(interaction: StringSelectMenuInteraction) {
  if (!interaction.inGuild() || !interaction.guildId) return;

  await interaction.deferUpdate();

  const key = interaction.values[0]; // ex: welcomeChannelId
  const value = interaction.channelId;

  await prisma.guildConfig.upsert({
    where: { guildId: interaction.guildId },
    create: { guildId: interaction.guildId, [key]: value } as any,
    update: { [key]: value } as any,
  });

  await interaction.editReply({
    content: `✅ Configuração salva: **${key}** = \`${value}\``,
    components: [],
  });
}

/* ======================================================
   BOTÃO — PUBLICAR PAINÉIS
====================================================== */
export async function setupPublishButton(interaction: ButtonInteraction) {
  if (!interaction.inGuild() || !interaction.guildId) return;

  await interaction.deferUpdate();

  try {
    const ticketsMsgId = await publishTicketsPanel(interaction.guildId);
    const wlMsgId = await publishWhitelistPanel(interaction.guildId);

    await interaction.editReply({
      content:
        "🚀 **Painéis publicados com sucesso!**\n" +
        `• Tickets messageId: \`${ticketsMsgId}\`\n` +
        `• Whitelist messageId: \`${wlMsgId}\`\n\n` +
        "Agora os botões já aparecem nos canais configurados.",
      components: [],
    });
  } catch (e: any) {
    await interaction.editReply({
      content: `❌ Falha ao publicar painéis: **${e?.message || String(e)}**\n\n` + "Dica: configure os canais primeiro via /setup.",
      components: [],
    });
  }
}
