import {
  Interaction,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
} from "discord.js";

import { createLogger } from "../core/logger.js";
import { loadEnv } from "../core/env.js";

// setup
import {
  setupCommand,
  setupPageButton,
  setupPublishButton,
  setupValueSelect,
} from "../modules/setup/setup.js";

// tickets
import { handleTicketButton } from "../modules/tickets/tickets.js";

// whitelist
import {
  whitelistStartButton,
  handleWhitelistAnswerModal,
  handleWhitelistDecisionButton,
  handleWhitelistRejectReasonModal,
} from "../modules/whitelist/handler.js";

// radio
import { radioCommand } from "../modules/radio/command.js";
import { handleRadioTypeSelect, handleRadioSubmit } from "../modules/radio/handler.js";

function isSetupButton(id: string) {
  return id.startsWith("setup:") || id.startsWith("setup_page:") || id.startsWith("setup_publish:");
}

export async function handleInteraction(interaction: Interaction) {
  const env = loadEnv();
  const log = createLogger(env.LOG_LEVEL ?? "info");

  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      const i = interaction as ChatInputCommandInteraction;

      if (i.commandName === "setup") {
        await setupCommand(i);
        return;
      }

      if (i.commandName === "radio") {
        await radioCommand(i);
        return;
      }

      return;
    }

    // Buttons
    if (interaction.isButton()) {
      const i = interaction as ButtonInteraction;

      // whitelist start
      if (i.customId === "whitelist:start") {
        await whitelistStartButton(i);
        return;
      }

      // whitelist: next step + staff decisions
      if (
        i.customId.startsWith("wl:next:") ||
        i.customId.startsWith("wl:approve:") ||
        i.customId.startsWith("wl:reject:")
      ) {
        await handleWhitelistDecisionButton(i);
        return;
      }

      // setup buttons
      if (isSetupButton(i.customId)) {
        if (i.customId.startsWith("setup:") || i.customId.startsWith("setup_page:")) {
          await setupPageButton(i);
          return;
        }
        if (i.customId.startsWith("setup_publish:")) {
          await setupPublishButton(i);
          return;
        }
      }

      // ticket buttons
      if (i.customId.startsWith("ticket:")) {
        await handleTicketButton(i);
        return;
      }

      return;
    }

    // Select menus
    if (interaction.isAnySelectMenu()) {
      if (interaction.customId.startsWith("setup_select:")) {
        await setupValueSelect(interaction);
        return;
      }

      // radio select
      if (interaction.isStringSelectMenu() && interaction.customId === "radio:type_select") {
        await handleRadioTypeSelect(interaction);
        return;
      }

      return;
    }

    // Modals
    if (interaction.isModalSubmit()) {
      const i = interaction as ModalSubmitInteraction;

      if (i.customId.startsWith("wl:answer:")) {
        await handleWhitelistAnswerModal(i);
        return;
      }

      if (i.customId.startsWith("wl:reject_reason:")) {
        await handleWhitelistRejectReasonModal(i);
        return;
      }

      // radio
      if (i.customId.startsWith("radio:submit:")) {
        await handleRadioSubmit(i);
        return;
      }

      return;
    }
  } catch (err) {
    console.error("Interaction error:", err);
    log.error({ err }, "Interaction error");

    // opcional: se quiser responder um erro genérico sem quebrar
    try {
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "⚠️ Ocorreu um erro ao processar a interação.", ephemeral: true });
      }
    } catch {
      // ignore
    }
  }
}
