import { Message } from "discord.js";
import { handleWhitelistThreadMessage } from "../modules/whitelist/handler.js";

/**
 * Ligue isso no seu index:
 * client.on("messageCreate", handleMessageCreate)
 */
export async function handleMessageCreate(message: Message) {
  await handleWhitelistThreadMessage(message);
}
