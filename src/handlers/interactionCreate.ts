import {
  Interaction,
  ChatInputCommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
} from "discord.js";

import { createLogger } from "../core/logger.js";
import { loadEnv } from "../core/env.js";

// ✅ setup: importe só o que existe no seu setup.js
import {
  setupCommand,
  setupPageButton,
  setupPublishButton,
  setupValueSelect,
} from "../modules/setup/setup.js";

// tickets
import { handleTicketButton } from "../modules/tickets/tickets.js";

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
    if (interaction.isStringSelectMenu()) {
      const i = interaction as StringSelectMenuInteraction;

      if (i.customId.startsWith("setup_select:")) {
        await setupValueSelect(i);
        return;
      }

      return;
    }

    // Modals (se seu projeto usa modal no setup, trate aqui quando existir export)
    if (interaction.isModalSubmit()) {
      const i = interaction as ModalSubmitInteraction;
      // sem handlers por enquanto
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
