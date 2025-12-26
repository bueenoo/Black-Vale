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
      if (i.customId === "whitelist:start") {
        await whitelistStartButton(i);
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

    // ✅ Select menus (StringSelect + ChannelSelect + RoleSelect)
    if (interaction.isAnySelectMenu()) {
      if (interaction.customId.startsWith("setup_select:")) {
        await setupValueSelect(interaction);
        return;
      }
      return;
    }

    // Modals
    if (interaction.isModalSubmit()) {
      const _i = interaction as ModalSubmitInteraction;
      return;
    }
  } catch (err) {
    console.error("Interaction error:", err);
    log.error({ err }, "Interaction error");

    try {
      if (
        (interaction as any).isRepliable?.() &&
        !(interaction as any).replied &&
        !(interaction as any).deferred
      ) {
        await (interaction as any).reply({
          content: "⚠️ Erro interno ao processar a interação. Verifique os logs.",
          ephemeral: true,
        });
      }
    } catch {
      // ignore
    }
  }
}
