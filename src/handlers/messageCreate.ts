import { Message } from "discord.js";
import { handleWhitelistThreadMessage } from "../modules/whitelist/handler.js";

export async function handleMessageCreate(message: Message) {
  // whitelist contínua (thread)
  await handleWhitelistThreadMessage(message);
}
