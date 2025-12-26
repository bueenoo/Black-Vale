import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  ChannelSelectMenuInteraction,
  RoleSelectMenuInteraction,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { prisma } from "../../core/prisma.js";
import { publishTicketPanel } from "../tickets/panel.js";
import { publishWhitelistPanels } from "../whitelist/panels.js";

const SECTIONS = [
  { label: "🏠 Início", value: "home" },
  { label: "👋 Boas-vindas", value: "welcome" },
  { label: "📜 Whitelist", value: "whitelist" },
  { label: "🎫 Tickets", value: "tickets" },
  { label: "🎨 Branding", value: "branding" },
  { label: "🚀 Publicar painéis", value: "publish" },
] as const;

type SectionValue = (typeof SECTIONS)[number]["value"];

function sectionMenu(selected: SectionValue = "home") {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("setup:section")
    .setPlaceholder("Escolha uma seção do setup")
    .addOptions(
      SECTIONS.map((s) => ({
        label: s.label,
        value: s.value,
        default: s.value === selected,
      }))
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function homeEmbed() {
  return new EmbedBuilder()
    .setTitle("⚙️ Setup do Blackbot (por servidor)")
    .setDescription(
      [
        "Configure canais, cargos e categorias sem copiar IDs.",
        "",
        "Use o menu abaixo para navegar pelas seções.",
        "",
        "💡 Dica: após configurar, vá em **🚀 Publicar painéis** para postar/atualizar os painéis.",
      ].join("\n")
    );
}

async function ensureGuildConfig(guildId: string) {
  return prisma.guildConfig.upsert({
    where: { guildId },
    update: {},
    create: { guildId },
  });
}

function requireAdmin(i: ChatInputCommandInteraction | ButtonInteraction | StringSelectMenuInteraction) {
  const perms = i.memberPermissions;
  if (!perms?.has(PermissionFlagsBits.Administrator)) {
    throw new Error("NO_ADMIN");
  }
}

export async function setupCommand(interaction: ChatInputCommandInteraction) {
  try {
    requireAdmin(interaction);
  } catch {
    return interaction.reply({ content: "❌ Apenas administradores podem usar /setup.", ephemeral: true });
  }

  await ensureGuildConfig(interaction.guildId!);

  return interaction.reply({
    embeds: [homeEmbed()],
    components: [sectionMenu("home")],
  });
}

export async function setupSectionSelect(interaction: StringSelectMenuInteraction) {
  try {
    requireAdmin(interaction);
  } catch {
    return interaction.reply({ content: "❌ Apenas administradores podem usar o setup.", ephemeral: true });
  }

  const section = interaction.values[0] as SectionValue;
  await ensureGuildConfig(interaction.guildId!);

  if (section === "home") {
    return interaction.update({ embeds: [homeEmbed()], components: [sectionMenu("home")] });
  }

  if (section === "welcome") {
    const embed = new EmbedBuilder()
      .setTitle("👋 Boas-vindas")
      .setDescription("Selecione o canal onde o bot enviará a mensagem de boas-vindas ao entrar no servidor.");

    const ch = new ChannelSelectMenuBuilder()
      .setCustomId("setup:set:welcomeChannelId")
      .setPlaceholder("Selecionar canal de boas-vindas")
      .addChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1);

    return interaction.update({
      embeds: [embed],
      components: [sectionMenu("welcome"), new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(ch)],
    });
  }

  if (section === "whitelist") {
    const embed = new EmbedBuilder()
      .setTitle("📜 Whitelist")
      .setDescription(
        [
          "Selecione canais/cargos usados no fluxo de whitelist.",
          "",
          "**Campos:**",
          "• Canal do painel público (botão Whitelist)",
          "• Canal do painel 'Iniciar Whitelist'",
          "• Canal staff (recebe respostas)",
          "• Canal de log de reprovação",
          "• Cargos: whitelist / pré-resultado / aprovado / reprovado / staff",
        ].join("\n")
      );

    const chPanel = new ChannelSelectMenuBuilder()
      .setCustomId("setup:set:whitelistPanelChannelId")
      .setPlaceholder("Canal do painel público (Whitelist)")
      .addChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1);

    const chAccess = new ChannelSelectMenuBuilder()
      .setCustomId("setup:set:whitelistAccessChannelId")
      .setPlaceholder("Canal de whitelist (onde o usuário responde)")
      .addChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1);


    const chStart = new ChannelSelectMenuBuilder()
      .setCustomId("setup:set:whitelistStartPanelChannelId")
      .setPlaceholder("Canal do painel 'Iniciar Whitelist'")
      .addChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1);

    const chStaff = new ChannelSelectMenuBuilder()
      .setCustomId("setup:set:whitelistStaffChannelId")
      .setPlaceholder("Canal staff (respostas)")
      .addChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1);

    const chRejectLog = new ChannelSelectMenuBuilder()
      .setCustomId("setup:set:whitelistRejectLogChannelId")
      .setPlaceholder("Canal log de reprovação")
      .addChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1);

    const roleWhitelist = new RoleSelectMenuBuilder()
      .setCustomId("setup:set:whitelistRoleId")
      .setPlaceholder("Cargo Whitelist (acesso)")
      .setMinValues(1)
      .setMaxValues(1);

    const rolePre = new RoleSelectMenuBuilder()
      .setCustomId("setup:set:whitelistPreResultRoleId")
      .setPlaceholder("Cargo Pré-resultado")
      .setMinValues(1)
      .setMaxValues(1);

    const roleApproved = new RoleSelectMenuBuilder()
      .setCustomId("setup:set:whitelistApprovedRoleId")
      .setPlaceholder("Cargo Aprovado")
      .setMinValues(1)
      .setMaxValues(1);

    const roleRejected = new RoleSelectMenuBuilder()
      .setCustomId("setup:set:whitelistRejectedRoleId")
      .setPlaceholder("Cargo Reprovado")
      .setMinValues(1)
      .setMaxValues(1);

    const roleStaff = new RoleSelectMenuBuilder()
      .setCustomId("setup:set:staffRoleId")
      .setPlaceholder("Cargo Staff (aprova/tickets)")
      .setMinValues(1)
      .setMaxValues(1);

    return interaction.update({
      embeds: [embed],
      components: [
        sectionMenu("whitelist"),
        new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(chPanel),
        new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(chAccess),
        new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(chStart),
        new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(chStaff),
        // roles will require another page because discord max 5 rows. We'll offer button to "Próxima (Cargos)"
      ],
    }).then(async () => {
      // Follow-up with roles page button
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("setup:page:whitelist_roles")
        .setLabel("Configurar cargos ➜")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("setup:page:whitelist_logs")
        .setLabel("Configurar logs")
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.followUp({
      ephemeral: true,
      content:
        "➡️ Próximo: configure os cargos da whitelist.\nDepois, configure o canal de log de reprovação (opcional).",
      components: [row],
    });
  });
  }

  if (section === "tickets") {
    const embed = new EmbedBuilder()
      .setTitle("🎫 Tickets")
      .setDescription(
        [
          "Selecione onde o painel ficará e onde os tickets serão criados.",
          "",
          "**Campos:**",
          "• Canal do painel de tickets",
          "• Categoria onde os canais de ticket serão criados",
          "• Canal de logs/transcripts",
          "• Cargo staff (mesmo do whitelist)",
          "• Delay para deletar canal após fechar (opcional)",
        ].join("\n")
      );

    const chPanel = new ChannelSelectMenuBuilder()
      .setCustomId("setup:set:ticketPanelChannelId")
      .setPlaceholder("Canal do painel de tickets")
      .addChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1);

    const cat = new ChannelSelectMenuBuilder()
      .setCustomId("setup:set:ticketCategoryId")
      .setPlaceholder("Categoria de tickets")
      .addChannelTypes(ChannelType.GuildCategory)
      .setMinValues(1)
      .setMaxValues(1);

    const chLog = new ChannelSelectMenuBuilder()
      .setCustomId("setup:set:ticketLogChannelId")
      .setPlaceholder("Canal logs/transcripts")
      .addChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1);

    const delayBtn = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("setup:modal:ticketDelay").setLabel("⏱️ Ajustar delay de delete").setStyle(ButtonStyle.Secondary)
    );

    return interaction.update({
      embeds: [embed],
      components: [
        sectionMenu("tickets"),
        new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(chPanel),
        new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(cat),
        new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(chLog),
        delayBtn,
      ],
    });
  }

  if (section === "branding") {
    const embed = new EmbedBuilder()
      .setTitle("🎨 Branding White-label")
      .setDescription("Defina nome, cor e footer para esse servidor (usado em embeds e mensagens).");

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("setup:modal:branding").setLabel("Editar branding").setStyle(ButtonStyle.Primary)
    );

    return interaction.update({
      embeds: [embed],
      components: [sectionMenu("branding"), row],
    });
  }

  if (section === "publish") {
    const embed = new EmbedBuilder()
      .setTitle("🚀 Publicar / Atualizar painéis")
      .setDescription(
        [
          "Use os botões abaixo para publicar os painéis nos canais configurados.",
          "",
          "• 📜 Whitelist: painel público + painel iniciar",
          "• 🎫 Tickets: painel com botões",
          "",
          "Se já existir painel salvo no banco, o bot tenta **editar**; se não conseguir, ele **reposta** e atualiza o messageId.",
        ].join("\n")
      );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("setup:publish:whitelist").setLabel("📜 Publicar Whitelist").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("setup:publish:tickets").setLabel("🎫 Publicar Tickets").setStyle(ButtonStyle.Success),
    );

    return interaction.update({
      embeds: [embed],
      components: [sectionMenu("publish"), row],
    });
  }

  return interaction.update({ embeds: [homeEmbed()], components: [sectionMenu("home")] });
}

export async function setupPageButton(interaction: ButtonInteraction) {
  try {
    requireAdmin(interaction);
  } catch {
    return interaction.reply({ content: "❌ Apenas administradores podem usar o setup.", ephemeral: true });
  }

  if (interaction.customId === "setup:page:whitelist_roles") {
    const embed = new EmbedBuilder()
      .setTitle("📜 Whitelist — Cargos")
      .setDescription("Selecione os cargos (Whitelist / Pré-resultado / Aprovado / Reprovado / Staff).");

    const roleWhitelist = new RoleSelectMenuBuilder()
      .setCustomId("setup:set:whitelistRoleId")
      .setPlaceholder("Cargo Whitelist (acesso)")
      .setMinValues(1)
      .setMaxValues(1);

    const rolePre = new RoleSelectMenuBuilder()
      .setCustomId("setup:set:whitelistPreResultRoleId")
      .setPlaceholder("Cargo Pré-resultado")
      .setMinValues(1)
      .setMaxValues(1);

    const roleApproved = new RoleSelectMenuBuilder()
      .setCustomId("setup:set:whitelistApprovedRoleId")
      .setPlaceholder("Cargo Aprovado")
      .setMinValues(1)
      .setMaxValues(1);

    const roleRejected = new RoleSelectMenuBuilder()
      .setCustomId("setup:set:whitelistRejectedRoleId")
      .setPlaceholder("Cargo Reprovado")
      .setMinValues(1)
      .setMaxValues(1);

    const roleStaff = new RoleSelectMenuBuilder()
      .setCustomId("setup:set:staffRoleId")
      .setPlaceholder("Cargo Staff (aprova/tickets)")
      .setMinValues(1)
      .setMaxValues(1);

    return interaction.reply({
      embeds: [embed],
      components: [
        new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleWhitelist),
        new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(rolePre),
        new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleApproved),
        new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleRejected),
        new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleStaff),
      ],
    });
  }

  if (interaction.customId === "setup:page:whitelist_logs") {
    const embed = new EmbedBuilder()
      .setTitle("📜 Whitelist — Logs")
      .setDescription("Selecione o canal onde as reprovações (com motivo) serão registradas.");

    const chRejectLog = new ChannelSelectMenuBuilder()
      .setCustomId("setup:set:whitelistRejectLogChannelId")
      .setPlaceholder("Canal log de reprovação")
      .addChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1);

    return interaction.reply({
      embeds: [embed],
      components: [new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(chRejectLog)],
    });
  }

}

export async function setupValueSelect(
  interaction: ChannelSelectMenuInteraction | RoleSelectMenuInteraction
) {
  try {
    requireAdmin(interaction as any);
  } catch {
    return interaction.reply({ content: "❌ Apenas administradores podem usar o setup.", ephemeral: true });
  }

  const [, , field] = interaction.customId.split(":"); // setup:set:<field>
  const value = interaction.values?.[0];
  if (!field || !value) return interaction.reply({ content: "❌ Selecione um valor.", ephemeral: true });

  await prisma.guildConfig.upsert({
    where: { guildId: interaction.guildId! },
    update: { [field]: value } as any,
    create: { guildId: interaction.guildId!, [field]: value } as any,
  });

  return interaction.reply({ content: `✅ Salvo: **${field}**`, ephemeral: true });
}

export async function setupModalOpen(interaction: ButtonInteraction) {
  try {
    requireAdmin(interaction);
  } catch {
    return interaction.reply({ content: "❌ Apenas administradores podem usar o setup.", ephemeral: true });
  }

  if (interaction.customId === "setup:modal:ticketDelay") {
    const modal = new ModalBuilder().setCustomId("setup:modal_submit:ticketDelay").setTitle("Delay para deletar ticket");
    const input = new TextInputBuilder()
      .setCustomId("delaySec")
      .setLabel("Segundos (ex: 10)")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder("10");
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    return interaction.showModal(modal);
  }

  if (interaction.customId === "setup:modal:branding") {
    const modal = new ModalBuilder().setCustomId("setup:modal_submit:branding").setTitle("Branding (white-label)");
    const name = new TextInputBuilder()
      .setCustomId("brandName")
      .setLabel("Nome do bot (no servidor)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setPlaceholder("Blackbot");
    const color = new TextInputBuilder()
      .setCustomId("brandColor")
      .setLabel("Cor (hex) ex: #111111")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setPlaceholder("#111111");
    const footer = new TextInputBuilder()
      .setCustomId("brandFooter")
      .setLabel("Footer (texto)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setPlaceholder("Black RP • Vale dos Ossos");

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(name),
      new ActionRowBuilder<TextInputBuilder>().addComponents(color),
      new ActionRowBuilder<TextInputBuilder>().addComponents(footer),
    );
    return interaction.showModal(modal);
  }
}

export async function setupModalSubmit(interaction: ModalSubmitInteraction) {
  try {
    requireAdmin(interaction as any);
  } catch {
    return interaction.reply({ content: "❌ Apenas administradores podem usar o setup.", ephemeral: true });
  }

  if (interaction.customId === "setup:modal_submit:ticketDelay") {
    const delayRaw = interaction.fields.getTextInputValue("delaySec");
    const delay = Number(delayRaw);
    if (!Number.isFinite(delay) || delay < 3 || delay > 600) {
      return interaction.reply({ content: "❌ Delay inválido. Use 3 a 600 segundos.", ephemeral: true });
    }
    await prisma.guildConfig.upsert({
      where: { guildId: interaction.guildId! },
      update: { ticketDeleteDelaySec: delay },
      create: { guildId: interaction.guildId!, ticketDeleteDelaySec: delay },
    });
    return interaction.reply({ content: `✅ Salvo: ticketDeleteDelaySec = ${delay}`, ephemeral: true });
  }

  if (interaction.customId === "setup:modal_submit:branding") {
    const brandName = interaction.fields.getTextInputValue("brandName")?.trim() || null;
    const brandFooter = interaction.fields.getTextInputValue("brandFooter")?.trim() || null;
    const hex = interaction.fields.getTextInputValue("brandColor")?.trim();

    let brandColor: number | null = null;
    if (hex) {
      const cleaned = hex.replace("#", "");
      if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
        return interaction.reply({ content: "❌ Cor inválida. Use formato #RRGGBB.", ephemeral: true });
      }
      brandColor = parseInt(cleaned, 16);
    }

    await prisma.guildConfig.upsert({
      where: { guildId: interaction.guildId! },
      update: { brandName, brandFooter, brandColor },
      create: { guildId: interaction.guildId!, brandName, brandFooter, brandColor },
    });

    return interaction.reply({ content: "✅ Branding salvo.", ephemeral: true });
  }
}

async function publishOrEditMessage(channelId: string, messageId: string | null, payload: any) {
  const guild = payload.guild;
  const ch = await guild.channels.fetch(channelId).catch(() => null);
  if (!ch || !("send" in ch)) return { ok: false as const, messageId: null as string | null };

  // try edit
  if (messageId) {
    const msg = await (ch as any).messages.fetch(messageId).catch(() => null);
    if (msg) {
      await msg.edit(payload.content ? { ...payload } : payload);
      return { ok: true as const, messageId };
    }
  }
  const sent = await (ch as any).send(payload);
  return { ok: true as const, messageId: sent.id };
}

export async function setupPublishButton(interaction: ButtonInteraction) {
  try {
    requireAdmin(interaction);
  } catch {
    return interaction.reply({ content: "❌ Apenas administradores podem usar o setup.", ephemeral: true });
  }

  const cfg = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId! } });
  if (!cfg) return interaction.reply({ content: "❌ Config não encontrada. Use /setup.", ephemeral: true });

  if (interaction.customId === "setup:publish:tickets") {
    if (!cfg.ticketPanelChannelId) {
      return interaction.reply({ content: "❌ Defina ticketPanelChannelId na seção Tickets.", ephemeral: true });
    }
    // publish fresh using module (we also store messageId by sending and capturing)
    const channel = await interaction.guild!.channels.fetch(cfg.ticketPanelChannelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) {
      return interaction.reply({ content: "❌ Canal de painel inválido.", ephemeral: true });
    }
    // if message exists, delete and repost (simple & reliable)
    if (cfg.ticketPanelMessageId) {
      const old = await (channel as any).messages.fetch(cfg.ticketPanelMessageId).catch(() => null);
      if (old) await old.delete().catch(() => {});
    }
    const msg = await publishTicketPanel(channel as any);
    await prisma.guildConfig.update({
      where: { guildId: interaction.guildId! },
      data: { ticketPanelMessageId: msg.id },
    });
    return interaction.reply({ content: "✅ Painel de tickets publicado e salvo.", ephemeral: true });
  }

  if (interaction.customId === "setup:publish:whitelist") {
    if (!cfg.whitelistPanelChannelId || !cfg.whitelistStartPanelChannelId) {
      return interaction.reply({
        content: "❌ Defina whitelistPanelChannelId e whitelistStartPanelChannelId na seção Whitelist.",
      });
    }
    const ch1 = await interaction.guild!.channels.fetch(cfg.whitelistPanelChannelId).catch(() => null);
    const ch2 = await interaction.guild!.channels.fetch(cfg.whitelistStartPanelChannelId).catch(() => null);
    if (!ch1 || ch1.type !== ChannelType.GuildText || !ch2 || ch2.type !== ChannelType.GuildText) {
      return interaction.reply({ content: "❌ Canais de whitelist inválidos.", ephemeral: true });
    }
    // delete old if exists
    if (cfg.whitelistPanelMessageId) {
      const old = await (ch1 as any).messages.fetch(cfg.whitelistPanelMessageId).catch(() => null);
      if (old) await old.delete().catch(() => {});
    }
    if (cfg.whitelistStartPanelMessageId) {
      const old2 = await (ch2 as any).messages.fetch(cfg.whitelistStartPanelMessageId).catch(() => null);
      if (old2) await old2.delete().catch(() => {});
    }

    const res = await publishWhitelistPanels(ch1 as any, ch2 as any);
    await prisma.guildConfig.update({
      where: { guildId: interaction.guildId! },
      data: { whitelistPanelMessageId: res.panelMessageId, whitelistStartPanelMessageId: res.startMessageId },
    });

    return interaction.reply({ content: "✅ Painéis de whitelist publicados e salvos.", ephemeral: true });
  }
}