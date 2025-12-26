import { prisma } from "./prisma.js";

export async function ensureGuildConfig(guildId: string) {
  const defaults = {
    guildId,
    brandName: "Blackbot",
    brandColor: 0x111111,
    brandFooter: "Black — Vale dos Ossos",
    welcomeChannelId: "1453865850112180316",

    whitelistRoleId: "1453883715179647028",
    whitelistAccessChannelId: "1453866418347970612",
    whitelistStaffChannelId: "1453867163612872824",
    whitelistPreResultRoleId: "1453868701492445204",
    whitelistApprovedRoleId: "1453868618172596509",
    whitelistRejectedRoleId: "1453868766222880921",
    staffRoleId: "1453868542809083965",
    whitelistRejectLogChannelId: "1453911181936033822",

    ticketPanelChannelId: "1453866734728515636",
    ticketCategoryId: "1453866709512355890",
    ticketLogChannelId: "1453867187243712542",
    ticketDeleteDelaySec: 10,
  };

  await prisma.guildConfig.upsert({
    where: { guildId },
    create: defaults,
    update: defaults,
  });
}
