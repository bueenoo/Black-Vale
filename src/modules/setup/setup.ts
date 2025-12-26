import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
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
// Config items (máx 25)
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
  { key: "staffRoleId", label: "🛡️ Cargo STAFF", type: "role", desc: "Cargo que terá acesso aos tickets/whitelist." },
  { key: "modLogChannelId", label: "🧾 Canal de logs", type: "channel", desc: "Logs gerais." },

  { key: "brandName", label: "🏷️ Nome da Brand", type: "text", desc: "Nome usado nos embeds." },
  { key: "brandFooter", label: "📌 Rodapé", type: "text", desc: "Rodapé dos embeds." },
  { key: "brandColor", label: "🎨 Cor", type: "number", desc: "Cor numérica." },

  { key: "whitelistPanelChannelId", label: "📜 Canal painel WL", type: "channel", desc: "Publicação da whitelist." },
  { key: "whitelistAccessChannelId", label: "🔓 Canal WL", type: "channel", desc: "Canal liberado." },
  { key: "whitelistStartPanelChannelId", label: "🧩 Canal iniciar WL", type: "channel", desc: "Botão iniciar." },
  { key: "whitelistStaffChannelId", label: "👁️ Canal staff WL", type: "channel", desc: "Análise staff." },
  { key: "whitelistRejectLogChannelId", label: "⛔ Log reprovação", type: "channel", desc: "Logs reprovação." },
  { key: "whitelistCategoryId", label: "📁 Categoria WL", type: "category", desc: "Categoria temp." },
  { key: "whitelistRoleId", label: "📌 Cargo WL", type: "role", desc: "Acesso WL." },
  { key: "whitelistPreResultRoleId", label: "⌛ Cargo aguardando", type: "role", desc: "Pré resultado." },
  { key: "whitelistApprovedRoleId", label: "✅ Cargo aprovado", type: "role", desc: "Aprovado." },
  { key: "whitelistRejectedRoleId", label: "❌ Cargo reprovado", type: "role", desc: "Reprovado." },

  { key: "ticketPanelChannelId", label: "🎫 Canal painel Tickets", type: "channel", desc: "Publicação tickets." },
  { key: "ticketCategoryId", label: "📁 Categoria Tickets", type: "category", desc: "Categoria tickets." },
  { key: "ticketLogChannelId", label: "📄 Log tickets", type: "channel", desc: "Logs tickets." },
  { key: "ticketDeleteDelaySec", label: "⏱️ Delay delete", type: "number", desc: "Delay em segundos." },
];

function mainMenuRow() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("setup_select:item")
    .setPlaceholder("Selecione o item")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(CONFIG_ITEMS.map((x) => opt(x.label, x.key, x.desc)));

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function publishRow() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("setup_publish:all").setLabel("🚀 Publicar painéis").setStyle(ButtonStyle.Success),
  );
}

function backRow() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("setup:home").setLabel("⬅️ Voltar").setStyle(ButtonStyle.Secondary),
  );
}

async function saveConfig(guildId: string, key: ConfigItem, value: any) {
  await prisma.guildConfig.upsert({
    where: { guildId },
    create: { guildId, [key]: value },
    update: { [key]: value },
  });
}

// -----------------------------
// Exports esperados pelo handler
// -----------------------------
export async function setupCommand(interaction: ChatInputCommandInteraction) {
  await ensureRepliable(interaction);

  const embed = new EmbedBuilder()
    .setTitle("⚙️ Setup — Blackbot")
    .setDescription("Selecione o item que deseja configurar e depois publique os painéis.");

  await edit(interaction, {
    embeds: [embed],
    components: [mainMenuRow(), publishRow()],
  });
}

export async function setupPageButton(interaction: ButtonInteraction) {
  await ensureRepliable(interaction);

  if (interaction.customId === "setup:home") {
    const embed = new EmbedBuilder().setTitle("⚙️ Setup — Blackbot").setDescription("Selecione o item que deseja configurar.");
    await edit(interaction, { embeds: [embed], components: [mainMenuRow(), publishRow()] });
    return;
  }

  await edit(interaction, { content: "⚠️ Botão desconhecido.", components: [mainMenuRow(), publishRow()] });
}

export async function setupValueSelect(interaction: StringSelectMenuInteraction) {
  await ensureRepliable(interaction);

  // escolher item
  if (interaction.customId === "setup_select:item") {
    const key = interaction.values[0] as ConfigItem;
    const item = CONFIG_ITEMS.find((x) => x.key === key);

    if (!item) {
      await edit(interaction, { content: "⚠️ Item inválido.", components: [mainMenuRow(), publishRow()] });
      return;
    }

    if (item.type === "channel" || item.type === "category") {
      const ch = new ChannelSelectMenuBuilder()
        .setCustomId(`setup_select:value:${key}`)
        .setPlaceholder("Selecione um canal")
        .setMinValues(1)
        .setMaxValues(1)
        .setChannelTypes(item.type === "category" ? ChannelType.GuildCategory : ChannelType.GuildText);

      const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(ch);

      await edit(interaction, {
        content: `✅ Configure: **${item.label}**\n${item.desc}`,
        embeds: [],
        components: [row, backRow()],
      });
      return;
    }

    if (item.type === "role") {
      const r = new RoleSelectMenuBuilder()
        .setCustomId(`setup_select:value:${key}`)
        .setPlaceholder("Selecione um cargo")
        .setMinValues(1)
        .setMaxValues(1);

      const row = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(r);

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

  // salvar valor
  if
