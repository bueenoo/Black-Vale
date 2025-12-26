import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Interaction,
  PermissionFlagsBits,
  TextChannel,
} from "discord.js";
import { prisma } from "../core/prisma.js";
import { publishTicketPanel } from "../modules/tickets/panel.js";
import { createTicketFromButton, closeTicketFromButton } from "../modules/tickets/tickets.js";
import { publishWhitelistPanels } from "../modules/whitelist/panels.js";
import {
  staffDecisionButton,
  staffRejectModalSubmit,
  whitelistContinueModalSubmit,
  whitelistStartFromButton,
} from "../modules/whitelist/whitelist.js";
import {
  setupCommand,
  setupModalOpen,
  setupModalSubmit,
  setupPageButton,
  setupPublishButton,
  setupSectionSelect,
  setupValueSelect,
} from "../modules/setup/setup.js";

export async function handleInteraction(interaction: Interaction) {
  try {
    if (interaction.isChatInputCommand()) {
      await handleSlash(interaction);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "setup:section") {
      return setupSectionSelect(interaction);
    }

    if ((interaction.isChannelSelectMenu() || interaction.isRoleSelectMenu()) && interaction.customId.startsWith("setup:set:")) {
      return setupValueSelect(interaction as any);
    }

    if (interaction.isButton()) {
      await handleButton(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith("wl:step:")) return whitelistContinueModalSubmit(interaction);
      if (interaction.customId.startsWith("wl:reject_reason:")) return staffRejectModalSubmit(interaction);
      if (interaction.customId.startsWith("setup:modal_submit:")) return setupModalSubmit(interaction);
    }
  } catch (e) {
    console.error("Interaction error:", e);
    if (interaction.isRepliable()) {
      const msg = "❌ Ocorreu um erro ao processar.";
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
      }
    }
  }
}

async function handleSlash(interaction: ChatInputCommandInteraction) {
  const { commandName } = interaction;

  await interaction.deferReply({ ephemeral: true });

  if (commandName === "ping") {
    await interaction.editReply("🏓 Pong! Bot online.");
    return;
  }

  if (commandName === "setup") {
    // /setup replies itself
    return setupCommand(interaction);
  }

  if (commandName === "painel") {
    // optional quick publish (admin)
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.editReply("❌ Apenas administradores podem usar este comando.");
    }

    const tipo = interaction.options.getString("tipo", true);

    if (tipo === "tickets") {
      const msg = await publishTicketPanel(interaction.channel as TextChannel);
      // save in DB as convenience if configured
      await prisma.guildConfig.upsert({
        where: { guildId: interaction.guildId! },
        update: { ticketPanelChannelId: interaction.channelId, ticketPanelMessageId: msg.id },
        create: { guildId: interaction.guildId!, ticketPanelChannelId: interaction.channelId, ticketPanelMessageId: msg.id },
      });
      await interaction.editReply("✅ Painel de tickets publicado.");
      return;
    }

    if (tipo === "whitelist") {
      // publish both messages in current channel (quick mode)
      const res = await publishWhitelistPanels(interaction.channel as TextChannel, interaction.channel as TextChannel);
      await prisma.guildConfig.upsert({
        where: { guildId: interaction.guildId! },
        update: {
          whitelistPanelChannelId: interaction.channelId,
          whitelistPanelMessageId: res.panelMessageId,
          whitelistStartPanelChannelId: interaction.channelId,
          whitelistStartPanelMessageId: res.startMessageId,
        },
        create: {
          guildId: interaction.guildId!,
          whitelistPanelChannelId: interaction.channelId,
          whitelistPanelMessageId: res.panelMessageId,
          whitelistStartPanelChannelId: interaction.channelId,
          whitelistStartPanelMessageId: res.startMessageId,
        },
      });
      await interaction.editReply("✅ Painéis de whitelist publicados.");
      return;
    }

    await interaction.editReply("⚠️ Tipo de painel não reconhecido.");
    return;
  }

  await interaction.editReply("❓ Comando não reconhecido.");
}

async function handleButton(interaction: ButtonInteraction) {
  const id = interaction.customId;

  // Setup navigation/buttons
  if (id.startsWith("setup:page:")) return setupPageButton(interaction);
  if (id.startsWith("setup:modal:")) return setupModalOpen(interaction);
  if (id.startsWith("setup:publish:")) return setupPublishButton(interaction);

  // Tickets
  if (id.startsWith("ticket:create:")) return createTicketFromButton(interaction);
  if (id.startsWith("ticket:close:")) return closeTicketFromButton(interaction);

  // Whitelist
  if (id === "wl:request") return whitelistStartFromButton(interaction);
  if (id === "wl:start") return whitelistStartFromButton(interaction, { startQuestions: true });

  // Staff decisions
  if (id.startsWith("wl:approve:") || id.startsWith("wl:reject:")) return staffDecisionButton(interaction);

  return interaction.reply({ content: "⚠️ Botão desconhecido.", ephemeral: true });
}
