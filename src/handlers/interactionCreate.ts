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
  handleWhitelistAdjustNoteModal,
} from "../modules/whitelist/handler.js";

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

      return;
    }

    // Buttons
    if (interaction.isButton()) {
      const i = interaction as ButtonInteraction;
      const id = i.customId;

      // setup module buttons
      if (isSetupButton(id)) {
        if (id.startsWith("setup_page:")) return setupPageButton(i);
        if (id.startsWith("setup_publish:")) return setupPublishButton(i);
        return;
      }

      // select-like buttons (if you use it)
      if (id.startsWith("setup_value_select:")) {
        return setupValueSelect(i as any);
      }

      // tickets
      if (id.startsWith("ticket:")) return handleTicketButton(i);

      // whitelist start
      if (id === "wl:start" || id.startsWith("wl:start")) return whitelistStartButton(i);

      // staff decisions
      if (id.startsWith("wl:approve:") || id.startsWith("wl:reject:") || id.startsWith("wl:adjust:")) {
        return handleWhitelistDecisionButton(i);
      }

      return;
    }

    // Modals
    if (interaction.isModalSubmit()) {
      const i = interaction as ModalSubmitInteraction;

      if (i.customId.startsWith("wl:answer:")) return handleWhitelistAnswerModal(i);
      if (i.customId.startsWith("wl:reject_reason:")) return handleWhitelistRejectReasonModal(i);
      if (i.customId.startsWith("wl:adjust_note:")) return handleWhitelistAdjustNoteModal(i);

      return;
    }
  } catch (err: any) {
    log.error({ err }, "interaction handler error");
    try {
      if (interaction.isRepliable()) {
        await interaction.reply({ content: "❌ Erro interno. Tente novamente.", ephemeral: true });
      }
    } catch {}
  }
}
