import {
  Interaction,
  ChatInputCommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
} from "discord.js";

import { createLogger } from "../core/logger.js";
import { loadEnv } from "../core/env.js";

// setup (se você já tem, mantém seus imports)
import {
  setupCommand,
  setupPageButton,
  setupPublishButton,
  setupValueSelect,
  setupModalSubmit,
  setupModalOpen,
} from "../modules/setup/setup.js";

// tickets
import { handleTicketButton } from "../modules/tickets/tickets.js";

// whitelist (se você já tem, mantém seus imports)
// import { handleWhitelistButton } from "../modules/whitelist/whitelist.js";

function isSetupButton(id: string) {
  return (
    id.startsWith("setup:") ||
    id.startsWith("setup_page:") ||
    id.startsWith("setup_publish:")
  );
}

export async function handleInteraction(interaction: Interaction) {
  const env = loadEnv();
  const log = createLogger(env.LOG_LEVEL ?? "info");

  try {
    // Slash Commands
    if (interaction.isChatInputCommand()) {
      const i = interaction as ChatInputCommandInteraction;

      if (i.commandName === "setup") {
        await setupCommand(i);
        return;
      }

      // se você tiver outros comandos (ping/painel), trate aqui
      // if (i.commandName === "painel") ...
      return;
    }

    // Buttons
    if (interaction.isButton()) {
      const i = interaction as ButtonInteraction;

      // Setup buttons
      if (isSetupButton(i.customId)) {
        if (i.customId.startsWith("setup:")) {
          await setupPageButton(i);
          return;
        }
        if (i.customId.startsWith("setup_page:")) {
          await setupPageButton(i);
          return;
        }
        if (i.customId.startsWith("setup_publish:")) {
          await setupPublishButton(i);
          return;
        }
      }

      // Ticket buttons
      if (i.customId.startsWith("ticket:")) {
        await handleTicketButton(i);
        return;
      }

      // Whitelist buttons (se existir)
      // if (i.customId.startsWith("whitelist:")) { await handleWhitelistButton(i); return; }

      return;
    }

    // Select Menus
    if (interaction.isStringSelectMenu()) {
      const i = interaction as StringSelectMenuInteraction;

      if (i.customId.startsWith("setup_select:")) {
        await setupValueSelect(i);
        return;
      }

      return;
    }

    // Modals
    if (interaction.isModalSubmit()) {
      const i = interaction as ModalSubmitInteraction;

      if (i.customId.startsWith("setup_modal:")) {
        await setupModalSubmit(i);
        return;
      }

      return;
    }

    // Modal open trigger (se você usa botão que abre modal)
    // (normalmente fica no botão; mas deixei aqui se sua implementação usa)
    if ((interaction as any).isModalSubmit?.() === false) {
      // no-op
    }
  } catch (err) {
    console.error("Interaction error:", err);
    log.error({ err }, "Interaction error");

    // tenta responder sem quebrar o fluxo
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
      // ignora
    }
  }
}
