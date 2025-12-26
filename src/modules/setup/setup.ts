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
  MentionableSelectMenuBuilder,
  EmbedBuilder,
  TextChannel,
  PermissionFlagsBits,
} from "discord.js";

import { prisma } from "../../core/prisma.js";

// (Opcional) publishers dos painéis — se você já tem esses arquivos, deixa.
// Se não tiver, comente os imports e o publish vai só responder OK.
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
  // Sempre editar a resposta deferred
  return i.editReply(payload);
}

function opt(label: string, value: string, description?: string) {
  const o = new StringSelectMenuOptionBuilder().setLabel(label).setValue(value);
  if (description) o.setDescription(description.slice(0, 100));
  return o;
}

// -----------------------------
// Config items (LIMITADO a 25!)
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
  { key: "modLogChannelId", label: "🧾 Canal de logs (moderação)", type: "channel", desc: "Opcional: logs gerais de moderação." },

  { key: "brandName", label: "🏷️ Nome (Brand)", type: "text", desc: "Nome usado nos embeds/painéis." },
  { key: "brandFooter", label: "📌 Rodapé (Brand)", type: "text", desc: "Texto do rodapé dos embeds." },
  { key: "brandColor", label: "🎨 Cor (Brand)", type: "number", desc: "Cor numérica (ex: 0x000000 -> 0 / 0xFF0000 -> 16711680)." },

  // whitelist
  { key: "whitelistPanelChannelId", label: "📜 Canal do painel Whitelist", type: "channel", desc: "Onde publicar o painel da whitelist." },
  { key: "whitelistAccessChannelId", label: "🔓 Canal de acesso Whitelist", type: "channel", desc: "Canal que o cargo whitelist libera." },
  { key: "whitelistStartPanelChannelId", label: "🧩 Canal do botão Iniciar WL", type: "channel", desc: "Canal onde fica o botão Iniciar Whitelist." },
  { key: "whitelistStaffChannelId", label: "👁️ Canal staff (análise WL)", type: "channel", desc: "Canal onde staff recebe as respostas." },
  { key: "whitelistRejectLogChannelId", label: "⛔ Canal log reprovação WL", type: "channel", desc: "Opcional: canal para logs de reprovação." },
  { key: "whitelistCategoryId", label: "📁 Categoria Whitelist (temp)", type: "category", desc: "Categoria onde criar canais temporários da whitelist." },
  { key: "whitelistRoleId", label: "📌 Cargo: Whitelist (acesso)", type: "role", desc: "Cargo que libera o canal de whitelist." },
  { key: "whitelistPreResultRoleId", label: "⌛ Cargo: Aguardando aprovação", type: "role", desc: "Cargo enquanto aguarda a decisão." },
  { key: "whitelistApprovedRoleId", label: "✅ Cargo: Aprovado", type: "role", desc: "Cargo quando aprovado." },
  { key: "whitelistRejectedRoleId", label: "❌ Cargo: Reprovado", type: "role", desc: "Cargo quando reprovado (opcional)." },

  // tickets
  { key: "ticketPanelChannelId", label: "🎫 Canal do painel Tickets", type: "channel", desc: "Onde publicar o painel de tickets." },
  { key: "ticketCategoryId", label: "📁 Categoria Tickets", type: "category", desc: "Categoria onde criar canais de ticket." },
  { key: "ticketLogChannelId", label: "📄 Canal logs/transcripts", type: "channel", desc: "Canal para enviar transcript HTML ao fechar." },
  { key: "ticketDeleteDelaySec", label: "⏱️ Delay para deletar canal", type: "number", desc: "Segundos até deletar o canal após fechar (ex: 10)." },
];

// ✅ Garantia: não passa de 25
if (CONFIG_ITEMS.length > 25) {
  throw new Error("CONFIG_ITEMS excede 25 opções. Reduza a lista.");
}

// -----------------------------
// Menu builders
// -----------------------------
function mainMenuRow() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("setup_select:item")
    .setPlaceholder("Selecione o item que deseja definir")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      CONFIG_ITEMS.map((x) => opt(x.label, x.key, x.desc))
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function publishRow() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("setup_publish:all")
      .setLabel("🚀 Publicar painéis (Tickets + Whitelist)")
      .setStyle(ButtonStyle.Success),
  );
}

function backRow() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("setup:home")
      .setLabel("⬅️ Voltar")
      .setStyle(ButtonStyle.Secondary),
  );
}

// -----------------------------
// Prisma save helper
// -----------------------------
async function saveConfig(guildId: string, key: ConfigItem, value: any) {
  // upsert com create/update dinâmico
  const data: any = {};
  data[key] = value;

  await prisma.guildConfig.upsert({
    where: { guildId },
    create: { guildId, ...data },
    update: data,
  });
}

// -----------------------------
// Public API (exports)
// -----------------------------
export async function setupCommand(interaction: ChatInputCommandInteraction) {
  await ensureRepliable(interaction);

  const embed = new EmbedBuilder()
    .setTitle("⚙️ Setup — Blackbot")
    .setDescription(
      [
        "Selecione o item que deseja configurar.",
        "✅ O valor salvo será aplicado para este servidor (guild).",
        "",
        "Dica: comece definindo **Cargo STAFF**, **Categoria Tickets** e **Categoria Whitelist**.",
      ].join("\n")
    );

  await edit(interaction, {
    embeds: [embed],
    components: [mainMenuRow(), publishRow()],
  });
}

export async function setupPageButton(interaction: ButtonInteraction) {
  await ensureRepliable(interaction);

  // Por enquanto só temos home/back
  if (interaction.customId === "setup:home") {
    const embed = new EmbedBuilder()
      .setTitle("⚙️ Setup — Blackbot")
      .setDescription("Selecione o item que deseja configurar.");

    await edit(interaction, {
      embeds: [embed],
      components: [mainMenuRow(), publishRow()],
    });
    return;
  }

  await edit(interaction, {
    content: "⚠️ Botão de setup desconhecido.",
    components: [mainMenuRow(), publishRow()],
  });
}

export async function setupValueSelect(interaction: StringSelectMenuInteraction) {
  await ensureRepliable(interaction);

  // menu principal: escolher item
  if (interaction.customId === "setup_select:item") {
    const key = interaction.values[0] as ConfigItem;
    const item = CONFIG_ITEMS.find((x) => x.key === key);
    if (!item) {
      await edit(interaction, { content: "⚠️ Item inválido.", components: [mainMenuRow(), publishRow()] });
      return;
    }

    // dependendo do tipo, abre um seletor apropriado
    if (item.type === "channel" || item.type === "category") {
      const ch = new ChannelSelectMenuBuilder()
        .setCustomId(`setup_select:value:${key}`)
        .setPlaceholder("Selecione um canal")
        .setMinValues(1)
        .setMaxValues(1);

      if (item.type === "category") {
        ch.setChannelTypes(ChannelType.GuildCategory);
      } else {
        ch.setChannelTypes(ChannelType.GuildText);
      }

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

    // text/number: instrução manual
    await edit(interaction, {
      content:
        `✅ Configure: **${item.label}**\n` +
        `${item.desc}\n\n` +
        `➡️ **Envie o valor neste chat** usando o comando:\n` +
        `\`/setup_set key:${key} value:...\`\n\n` +
        `⚠️ (Se você não tem /setup_set, me avise e eu te envio também.)`,
      embeds: [],
      components: [backRow()],
    });
    return;
  }

  // menu de valor (channel/role)
  if (interaction.customId.startsWith("setup_select:value:")) {
    const key = interaction.customId.split(":")[2] as ConfigItem;
    const guildId = interaction.guildId!;
    if (!guildId) {
      await edit(interaction, { content: "⚠️ Isso só funciona dentro do servidor.", components: [] });
      return;
    }

    const item = CONFIG_ITEMS.find((x) => x.key === key);
    if (!item) {
      await edit(interaction, { content: "⚠️ Chave inválida.", components: [mainMenuRow(), publishRow()] });
      return;
    }

    const selected = interaction.values[0]; // id do canal/cargo
    await saveConfig(guildId, key, selected);

    await edit(interaction, {
      content: `✅ Configuração salva: **${key}** = \`${selected}\``,
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

  // carrega cfg
  const cfg = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });

  // publica painéis onde estiver configurado
  try {
    // tickets
    if (cfg?.ticketPanelChannelId) {
      const ch = await guild.channels.fetch(cfg.ticketPanelChannelId).catch(() => null);
      if (ch && ch.type === ChannelType.GuildText) {
        await publishTicketPanel(ch as TextChannel, cfg);
      }
    }

    // whitelist
    if (cfg?.whitelistPanelChannelId) {
      const ch = await guild.channels.fetch(cfg.whitelistPanelChannelId).catch(() => null);
      if (ch && ch.type === ChannelType.GuildText) {
        await publishWhitelistPanel(ch as TextChannel, cfg);
      }
    }

    await edit(interaction, {
      content: "🚀 OK! Se os canais estiverem configurados, os painéis foram publicados/atualizados.",
      components: [mainMenuRow(), publishRow()],
    });
  } catch (err) {
    console.error("publish error:", err);
    await edit(interaction, {
      content: "⚠️ Erro ao publicar painéis. Verifique os logs.",
      components: [mainMenuRow(), publishRow()],
    });
  }
}
