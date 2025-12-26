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
import { whitelistStartButton } from "../modules/whitelist/handler.js";

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

      // ✅ whitelist start
      if (i.custom
