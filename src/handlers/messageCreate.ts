import { Message } from "discord.js";
import { handleWhitelistThreadMessage } from "../modules/whitelist/handler.js";

export async function handleMessageCreate(message: Message) {
  await handleWhitelistThreadMessage(message);
}
