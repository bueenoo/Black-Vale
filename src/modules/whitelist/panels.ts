import { ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel, Client } from "discord.js";

/**
 * Publica o painel de whitelist no canal informado.
 * Aceita um segundo argumento (client) apenas por compatibilidade com chamadas antigas.
 */
export async function publishWhitelistPanels(channel: TextChannel, _client?: Client) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("whitelist:start")
      .setLabel("📜 Iniciar Whitelist")
      .setStyle(ButtonStyle.Primary),
  );

  const message = await channel.send({
    content:
      "📜 **Whitelist — Início**\n\n" +
      "Clique no botão abaixo para iniciar o interrogatório.\n" +
      "Responda com atenção — o Vale não perdoa mentiras.",
    components: [row],
  });

  return message;
}

/**
 * Alias (singular) para compatibilidade com imports antigos:
 * import { publishWhitelistPanel } from "../whitelist/panels.js";
 */
export const publishWhitelistPanel = publishWhitelistPanels;
