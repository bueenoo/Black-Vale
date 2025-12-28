import {
  Interaction,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  InteractionType,
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

/**
 * IMPORTANT
 * This handler is intentionally defensive:
 * - It logs every component customId (buttons/modals/selects)
 * - It ACKs unknown components so the user doesn't see "Esta interação falhou"
 * - It routes multiple legacy/customId variants so old published buttons still work
 */

function isSetupButton(id: string) {
  return (
    id.startsWith("setup:") ||
    id.startsWith("setup_page:") ||
    id.startsWith("setup_publish:") ||
    id.startsWith("setup_value:")
  );
}

function isWhitelistButtonId(id: string) {
  // Accept NEW + legacy ids (old panels won't be republished sometimes)
  return (
    id === "wl:start" ||
    id === "whitelist:start" ||
    id === "whitelistStart" ||
    id.startsWith("wl:start") ||
    id.startsWith("whitelist:start") ||

    // NEW staff actions (current code)
    id.startsWith("wl:approve:") ||
    id.startsWith("wl:reject:") ||

    // Legacy staff actions (older versions)
    id.startsWith("wl:decision:") ||
    id.startsWith("whitelist:decision:")
  );
}


function isWhitelistModalId(id: string) {
  return (
    id.startsWith("wl:answer:") ||
    id.startsWith("wl:reject_reason:") ||
    id.startsWith("wl:adjust_note:") ||
    id.startsWith("whitelist:answer:") ||
    id.startsWith("whitelist:reject_reason:") ||
    id.startsWith("whitelist:adjust_note:")
  );
}

export async function handleInteraction(interaction: Interaction) {
  const env = loadEnv();
  const log = createLogger(env.LOG_LEVEL ?? "info");

  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      const i = interaction as ChatInputCommandInteraction;

      if (i.commandName === "setup") return await setupCommand(i);

      // other commands...
      return;
    }

    // Buttons
    if (interaction.isButton()) {
      const i = interaction as ButtonInteraction;
      const id = i.customId;

      log.info({ customId: id, user: i.user.id, guild: i.guildId }, "button interaction");

      // Setup buttons
      if (isSetupButton(id)) {
        if (id.startsWith("setup_page:")) return await setupPageButton(i);
        if (id.startsWith("setup_publish:")) return await setupPublishButton(i);
        if (id.startsWith("setup_value:")) return await setupValueSelect(i as any);
        // fallback
        return;
      }

      // Ticket buttons
      if (id.startsWith("ticket:")) return await handleTicketButton(i);

      // Whitelist buttons (start + staff decisions)
      if (isWhitelistButtonId(id)) {
        // Start variants (new + legacy)
        if (
          id === "wl:start" ||
          id === "whitelist:start" ||
          id === "whitelistStart" ||
          id.startsWith("wl:start") ||
          id.startsWith("whitelist:start")
        ) {
          return await whitelistStartButton(i);
        }

        // Staff actions (new + legacy)
        if (
          id.startsWith("wl:approve:") ||
          id.startsWith("wl:reject:") ||
          id.startsWith("wl:decision:") ||
          id.startsWith("whitelist:decision:")
        ) {
          return await handleWhitelistDecisionButton(i);
        }
      }

      // If nothing matched, ACK the button so the user doesn't see "Esta interação falhou"
      if (!i.deferred && !i.replied) {
        await i.reply({
          content:
            "⚠️ Botão não reconhecido por este bot.\n" +
            "Isso normalmente acontece quando o painel foi publicado por uma versão antiga.\n" +
            "➡️ Peça para a staff rodar **/setup** e **Publish** novamente.",
          ephemeral: true,
        });
      }
      return;
    }

    // Modals
    if (interaction.isModalSubmit()) {
      const i = interaction as ModalSubmitInteraction;
      const id = i.customId;

      log.info({ customId: id, user: i.user.id, guild: i.guildId }, "modal interaction");

      if (isWhitelistModalId(id)) {
        if (id.startsWith("wl:answer:") || id.startsWith("whitelist:answer:")) return await handleWhitelistAnswerModal(i);
        if (id.startsWith("wl:reject_reason:") || id.startsWith("whitelist:reject_reason:")) return await handleWhitelistRejectReasonModal(i);
        if (id.startsWith("wl:adjust_note:") || id.startsWith("whitelist:adjust_note:")) return await handleWhitelistAdjustNoteModal(i);
      }

      // Unknown modal: ACK
      if (!i.deferred && !i.replied) {
        await i.reply({
          content:
            "⚠️ Este formulário não está mais ativo (provavelmente de um painel antigo).\n" +
            "➡️ Peça para a staff republicar o painel via **/setup**.",
          ephemeral: true,
        });
      }
      return;
    }

    // Select menus (if you use them in setup)
    if ((interaction as any).isStringSelectMenu?.()) {
      const i = interaction as any;
      const id = i.customId as string;

      log.info({ customId: id, user: i.user.id, guild: i.guildId }, "select interaction");

      if (id.startsWith("setup_value:") || id.startsWith("setup_select:")) return await setupValueSelect(i);

      if (!i.deferred && !i.replied) {
        await i.reply({ content: "⚠️ Seletor não reconhecido.", ephemeral: true });
      }
      return;
    }

    // Other interaction types: do nothing
    if (interaction.type === InteractionType.ApplicationCommandAutocomplete) return;
  } catch (err: any) {
    // Always try to ACK so user doesn't see "interaction failed"
    try {
      if ((interaction as any).isRepliable?.()) {
        const i = interaction as any;
        if (!i.deferred && !i.replied) {
          await i.reply({
            content: "❌ Erro ao processar interação: `" + (err?.message ?? String(err)) + "`",
            ephemeral: true,
          });
        } else if (i.deferred && !i.replied) {
          await i.editReply("❌ Erro ao processar interação: `" + (err?.message ?? String(err)) + "`");
        }
      }
    } catch {}
    log.error({ err }, "handleInteraction failed");
  }
}
