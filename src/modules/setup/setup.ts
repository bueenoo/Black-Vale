import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  AnySelectMenuInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  EmbedBuilder,
  TextChannel,
} from "discord.js";

import { prisma } from "../../core/prisma.js";
import { publishTicketPanel } from "../tickets/panel.js";
import { publishWhitelistPanel } from "../whitelist/panels.js";

// -----------------------------
// Helpers
// -----------------------------
async function ensureRepliable(i: any) {
  if (!i.deferred && !i.replied) {
    await i.deferReply({ ephemeral: true });
  }
}

async function edit(i: any, payload: any) {
  return i.editReply(payload);
}

function opt(label: string, value: string, description?: string) {
  const o = new StringSelectMenuOptionBuilder().setLabel(label).setValue(value);
  if (description) o.setDescription(description.slice(0, 100));
  return o;
}

// -----------------------------
// Config items
// -----------------------------
type ConfigItem =
  | "welcomeChannelId"
  | "staffRoleId"
  | "modLogChannelId"
  | "brandName"
  | "brandFooter"
  | "brandColor"
  | "whitelistPanelChannelId"
  | "whitelistAccessChannelId"
  | "whitelistStartPanelChannelId"
  | "whitelistStaffChannelId"
  | "whitelistRejectLogChannelId"
  | "whitelistCategoryId"
  | "whitelistRoleId"
  | "whitelistPreResultRoleId"
  | "whitelistApprovedRoleId"
  | "whitelistRejectedRoleId"
  | "ticketPanelChannelId"
  | "ticketCategoryId"
  | "ticketLogChannelId"
  | "ticketDeleteDelaySec";

const CONFIG_ITEMS: Array<{
  key: ConfigItem;
  label: string;
  type: "channel" | "category" | "role" | "text" | "number";
  desc: string;
}> = [
  { key: "welcomeChannelId", label: "👋 Canal de Boas-vindas", type: "channel", desc: "Canal onde o bot dá boas-vindas." },
  { key: "staffRoleId", label: "🛡️ Cargo STAFF", type: "role", desc: "Cargo staff." },
  { key: "modLogChannelId", label: "🧾 Canal de logs", type: "channel", desc: "Canal de logs (opcional)." },

  { key: "brandName", label: "🏷️ Nome da Brand", type: "text", desc: "Nome nos embeds." },
  { key: "brandFooter", label: "📌 Rodapé", type: "text", desc: "Rodapé nos embeds." },
  { key: "brandColor", label: "🎨 Cor", type: "number", desc: "Cor numérica." },

  { key: "whitelistPanelChannelId", label: "📜 Canal painel WL", type: "channel", desc: "Canal para publicar o painel WL." },
  { key: "whitelistAccessChannelId", label: "🔓 Canal WL", type: "channel", desc: "Canal liberado pela WL." },
  { key: "whitelistStartPanelChannelId", label: "🧩 Canal iniciar WL", type: "channel", desc: "Canal do botão iniciar." },
  { key: "whitelistStaffChannelId", label: "👁️ Canal staff WL", type: "channel", desc: "Canal de análise." },
  { key: "whitelistRejectLogChannelId", label: "⛔ Log reprovação", type: "channel", desc: "Log reprovação." },
  { key: "whitelistCategoryId", label: "📁 Categoria WL", type: "category", desc: "Categoria temp WL." },
  { key: "whitelistRoleId", label: "📌 Cargo WL", type: "role", desc: "Cargo whitelist." },
  { key: "whitelistPreResultRoleId", label: "⌛ Cargo aguardando", type: "role", desc: "Aguardando decisão." },
  { key: "whitelistApprovedRoleId", label: "✅ Cargo aprovado", type: "role", desc: "Cargo aprovado." },
  { key: "whitelistRejectedRoleId", label: "❌ Cargo reprovado", type: "role", desc: "Cargo reprovado." },

  { key: "ticketPanelChannelId", label: "🎫 Canal painel Tickets", type: "channel", desc: "Canal painel tickets." },
  { key: "ticketCategoryId", label: "📁 Categoria Tickets", type: "category", desc: "Categoria tickets." },
  { key: "ticketLogChannelId", label: "📄 Log tickets", type: "channel", desc: "Logs tickets." },
  { key: "ticketDeleteDelaySec", label: "⏱️ Delay delete", type: "number", desc: "Delay (segundos)." },
];

// -----------------------------
// UI rows
// -----------------------------
function mainMenuRow() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("setup_select:item")
    .setPlaceholder("Selecione o item")
    .setMinValues(1)
    .setMaxValues(1);

  menu.addOptions(CONFIG_ITEMS.map((x) => opt(x.label, x.key, x.desc)));

  return new ActionRowBuilder<any>().addComponents(menu);
}

function publishRow() {
  const btn = new ButtonBuilder()
    .setCustomId("setup_publish:all")
    .setLabel("🚀 Publicar painéis")
    .setStyle(ButtonStyle.Success);

  return new ActionRowBuilder<any>().addComponents(btn);
}

function backRow() {
  const btn = new ButtonBuilder()
    .setCustomId("setup:home")
    .setLabel("⬅️ Voltar")
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder<any>().addComponents(btn);
}

// -----------------------------
// Save config
// -----------------------------
async function saveConfig(guildId: string, key: ConfigItem, value: any) {
  await prisma.guildConfig.upsert({
    where: { guildId },
    create: { guildId, [key]: value },
    update: { [key]: value },
  });
}

// -----------------------------
// Exports
// -----------------------------
export async function setupCommand(interaction: ChatInputCommandInteraction) {
  await ensureRepliable(interaction);

  const embed = new EmbedBuilder()
    .setTitle("⚙️ Setup — Blackbot")
    .setDescription("Selecione o item para configurar e depois publique os painéis.");

  await edit(interaction, {
    embeds: [embed],
    components: [mainMenuRow(), publishRow()],
  });
}

export async function setupPageButton(interaction: ButtonInteraction) {
  await ensureRepliable(interaction);

  if (interaction.customId === "setup:home") {
    const embed = new EmbedBuilder()
      .setTitle("⚙️ Setup — Blackbot")
      .setDescription("Selecione o item para configurar e depois publique os painéis.");

    await edit(interaction, { embeds: [embed], components: [mainMenuRow(), publishRow()] });
    return;
  }

  await edit(interaction, { content: "⚠️ Botão desconhecido.", components: [mainMenuRow(), publishRow()] });
}

// ✅ AGORA FUNCIONA para StringSelectMenu / ChannelSelectMenu / RoleSelectMenu
export async function setupValueSelect(interaction: AnySelectMenuInteraction) {
  await ensureRepliable(interaction);

  // Escolheu um item
  if (interaction.customId === "setup_select:item") {
    const key = interaction.values[0] as ConfigItem;
    const item = CONFIG_ITEMS.find((x) => x.key === key);

    if (!item) {
      await edit(interaction, { content: "⚠️ Item inválido.", components: [mainMenuRow(), publishRow()] });
      return;
    }

    if (item.type === "channel" || item.type === "category") {
      const select = new ChannelSelectMenuBuilder()
        .setCustomId(`setup_select:value:${key}`)
        .setPlaceholder("Selecione um canal")
        .setMinValues(1)
        .setMaxValues(1);

      select.setChannelTypes(item.type === "category" ? ChannelType.GuildCategory : ChannelType.GuildText);

      const row = new ActionRowBuilder<any>().addComponents(select);

      await edit(interaction, {
        content: `✅ Configure: **${item.label}**\n${item.desc}`,
        embeds: [],
        components: [row, backRow()],
      });
      return;
    }

    if (item.type === "role") {
      const select = new RoleSelectMenuBuilder()
        .setCustomId(`setup_select:value:${key}`)
        .setPlaceholder("Selecione um cargo")
        .setMinValues(1)
        .setMaxValues(1);

      const row = new ActionRowBuilder<any>().addComponents(select);

      await edit(interaction, {
        content: `✅ Configure: **${item.label}**\n${item.desc}`,
        embeds: [],
        components: [row, backRow()],
      });
      return;
    }

    await edit(interaction, {
      content: `ℹ️ Este item é manual (texto/número): **${item.label}**`,
      embeds: [],
      components: [backRow()],
    });
    return;
  }

  // Salvou um valor (channel/role)
  if (interaction.customId.startsWith("setup_select:value:")) {
    const key = interaction.customId.split(":")[2] as ConfigItem;
    const guildId = interaction.guildId!;
    const value = interaction.values[0];

    await saveConfig(guildId, key, value);

    await edit(interaction, {
      content: `✅ Configuração salva: **${key}** = \`${value}\``,
      components: [mainMenuRow(), publishRow()],
    });
    return;
  }

  await edit(interaction, { content: "⚠️ Select desconhecido.", components: [mainMenuRow(), publishRow()] });
}

export async function setupPublishButton(interaction: ButtonInteraction) {
  await ensureRepliable(interaction);

  const guild = interaction.guild;
  if (!guild) {
    await edit(interaction, { content: "⚠️ Isso só funciona dentro do servidor.", components: [] });
    return;
  }

  const cfg = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });

  try {
    if (cfg?.ticketPanelChannelId) {
      const ch = await guild.channels.fetch(cfg.ticketPanelChannelId).catch(() => null);
      if (ch && ch.type === ChannelType.GuildText) {
        await publishTicketPanel(ch as TextChannel);
      }
    }

    if (cfg?.whitelistPanelChannelId) {
      const ch = await guild.channels.fetch(cfg.whitelistPanelChannelId).catch(() => null);
      if (ch && ch.type === ChannelType.GuildText) {
        await publishWhitelistPanel(ch as TextChannel);
      }
    }

    await edit(interaction, { content: "🚀 Painéis publicados com sucesso.", components: [mainMenuRow(), publishRow()] });
  } catch (err) {
    console.error("publish error:", err);
    await edit(interaction, { content: "⚠️ Erro ao publicar painéis.", components: [mainMenuRow(), publishRow()] });
  }
}
