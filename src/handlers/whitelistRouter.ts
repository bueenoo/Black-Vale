import { Interaction } from "discord.js";
import {
  whitelistStartButton,
  handleWhitelistDecisionButton,
  handleWhitelistRejectReasonModal,
  handleWhitelistAdjustNoteModal,
  handleWhitelistAnswerModal,
} from "../modules/whitelist/handler.js";

export async function handleWhitelistInteraction(interaction: Interaction) {
  // Buttons
  if (interaction.isButton()) {
    if (interaction.customId === "wl:start") return whitelistStartButton(interaction);
    if (interaction.customId.startsWith("wl:decision:")) return handleWhitelistDecisionButton(interaction);
  }

  // Modals (staff)
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith("wl:reject_reason:")) return handleWhitelistRejectReasonModal(interaction);
    if (interaction.customId.startsWith("wl:adjust_note:")) return handleWhitelistAdjustNoteModal(interaction);

    // Compat: antigo
    if (interaction.customId.startsWith("wl:answer:")) return handleWhitelistAnswerModal(interaction);
  }
}
