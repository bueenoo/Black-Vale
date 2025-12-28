import { Interaction, ButtonInteraction, ModalSubmitInteraction } from "discord.js";
import {
  whitelistStartButton,
  handleWhitelistDecisionButton,
  handleWhitelistRejectReasonModal,
  handleWhitelistAdjustNoteModal,
  handleWhitelistAnswerModal,
} from "../modules/whitelist/handler.js";

export async function handleWhitelistInteraction(interaction: Interaction) {
  if (interaction.isButton()) {
    const i = interaction as ButtonInteraction;
    const id = i.customId;

    if (id === "wl:start" || id === "whitelist:start" || id === "whitelistStart" || id.startsWith("wl:start") || id.startsWith("whitelist:start")) {
      return whitelistStartButton(i);
    }

    if (id.startsWith("wl:decision:")) {
      return handleWhitelistDecisionButton(i);
    }
  }

  if (interaction.isModalSubmit()) {
    const i = interaction as ModalSubmitInteraction;
    const id = i.customId;

    if (id.startsWith("wl:reject_reason:")) return handleWhitelistRejectReasonModal(i);
    if (id.startsWith("wl:adjust_note:")) return handleWhitelistAdjustNoteModal(i);
    if (id.startsWith("wl:answer:")) return handleWhitelistAnswerModal(i);
  }
}
