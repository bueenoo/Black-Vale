import {
  Interaction,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
} from "discord.js";

import { createLogger } from "../core/logger.js";
import { loadEnv } from "../core/env.js";

import {
  setupCommand,
  setupPageButton,
  setupPublishButton,
  setupValueSelect,
} from "../modules/setup/setup.js";

import { handleTicketButton } from "../modules/tickets/tickets.js";

import {
  whitelistStartButton,
  handleWhitelistAnswerModal,
  handleWhitelistDecisionButton,
  handleWhitelistRejectReasonModal,
  handleWhitelistAdjustReasonModal,
} from "../modules/whitelist/handler.js";

function isSetupButton(id: string) {
  return id.startsWith("setup:");
}

export async function handleInteraction(interaction: Interaction) {
  const env = loadEnv();
  const log = createLogger(env.LOG_LEVEL ?? "info");

  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "setup") {
        await setupCommand(interaction);
      }
      return;
    }

    if (interaction.isButton()) {
      const i = interaction as ButtonInteraction;

      if (i.customId === "whitelist:start") {
        await whitelistStartButton(i);
        return;
      }

      if (
        i.customId.startsWith("wl:approve:") ||
        i.customId.startsWith("wl:reject:") ||
        i.customId.startsWith("wl:adjust:")
      ) {
        await handleWhitelistDecisionButton(i);
        return;
      }

      if (isSetupButton(i.customId)) {
        if (i.customId.includes("publish")) await setupPublishButton(i);
        else await setupPageButton(i);
        return;
      }

      if (i.customId.startsWith("ticket:")) {
        await handleTicketButton(i);
        return;
      }
    }

    if (interaction.isAnySelectMenu()) {
      if (interaction.customId.startsWith("setup_select:")) {
        await setupValueSelect(interaction);
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      const i = interaction as ModalSubmitInteraction;

      if (i.customId.startsWith("whitelist:answer:")) {
        await handleWhitelistAnswerModal(i);
        return;
      }

      if (i.customId.startsWith("wl:reject_reason:")) {
        await handleWhitelistRejectReasonModal(i);
        return;
      }

      if (i.customId.startsWith("wl:adjust_reason:")) {
        await handleWhitelistAdjustReasonModal(i);
        return;
      }
    }
  } catch (err) {
    console.error(err);
    log.error(err);
  }
}
