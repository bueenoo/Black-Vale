import { Message, TextChannel } from "discord.js";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function buildTranscriptHTML(channel: TextChannel, limit = 200) {
  let lastId: string | undefined;
  const all: Message[] = [];

  while (all.length < limit) {
    const batch = await channel.messages.fetch({ limit: Math.min(100, limit - all.length), before: lastId });
    if (batch.size === 0) break;
    const msgs = [...batch.values()];
    all.push(...msgs);
    lastId = msgs[msgs.length - 1]?.id;
    if (batch.size < 100) break;
  }

  const messages = all.reverse();
  const rows = messages
    .map((m) => {
      const time = new Date(m.createdTimestamp).toISOString().replace("T", " ").replace("Z", "");
      const author = esc(m.author.tag);
      const content = esc(m.content || "");
      const attachments = [...m.attachments.values()]
        .map((a) => `<a href="${a.url}" target="_blank">${esc(a.name ?? "attachment")}</a>`)
        .join(" | ");
      return `<div class="msg">
  <div class="meta"><span class="time">${time}</span> <span class="author">${author}</span></div>
  <div class="content">${content ? content.replace(/\n/g, "<br/>") : ""}</div>
  ${attachments ? `<div class="att">${attachments}</div>` : ""}
</div>`;
    })
    .join("\n");

  const title = esc(`#${channel.name} — Transcript`);
  return `<!doctype html>
<html><head><meta charset="utf-8"/>
<title>${title}</title>
<style>
body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;background:#0b0b0f;color:#eaeaf0;margin:0}
header{padding:16px 20px;border-bottom:1px solid #222}
h1{font-size:16px;margin:0}
.wrap{padding:16px 20px}
.msg{padding:10px 12px;border:1px solid #222;border-radius:10px;margin:10px 0;background:#12121a}
.meta{font-size:12px;color:#9aa0aa;margin-bottom:6px}
.author{font-weight:600;color:#fff;margin-left:8px}
.content{font-size:14px;line-height:1.4}
.att{margin-top:6px;font-size:12px}
a{color:#7fb3ff;text-decoration:none}
a:hover{text-decoration:underline}
</style></head>
<body>
<header><h1>${title}</h1></header>
<div class="wrap">
${rows || "<em>Sem mensagens.</em>"}
</div>
</body></html>`;
}
