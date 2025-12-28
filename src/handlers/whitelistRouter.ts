import { Interaction } from "discord.js";
import {
  whitelistStartButton,
  handleWhitelistDecisionButton,
  handleWhitelistRejectReasonModal,
  handleWhitelistAdjustNoteModal,
  handleWhitelistAnswerModal,
} from "../modules/whitelist/handler.js";

export async function handleWhitelistInteraction(interaction: Interaction) {
  if (interaction.isButton()) {
    const id = interaction.customId;

    // Start (accept legacy ids too)
    if (
      id === "wl:start" ||
      id === "whitelist:start" ||
      id === "whitelistStart" ||
      id.startsWith("wl:start") ||
      id.startsWith("whitelist:start")
    ) {
      return whitelistStartButton(interaction);
    }

    // Staff decisions
    if (id.startsWith("wl:decision:")) {
      return handleWhitelistDecisionButton(interaction);
    }
  }

  if (interaction.isModalSubmit()) {
    const id = interaction.customId;

    if (id.startsWith("wl:reject_reason:")) return handleWhitelistRejectReasonModal(interaction);
    if (id.startsWith("wl:adjust_note:")) return handleWhitelistAdjustNoteModal(interaction);
    if (id.startsWith("wl:answer:")) return handleWhitelistAnswerModal(interaction);
  }
}
