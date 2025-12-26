export function sanitizeRadioText(input: string) {
  let t = input.trim();

  // remove @everyone/@here e menções diretas
  t = t.replace(/@everyone|@here/gim, "[...]");
  t = t.replace(/<@!?([0-9]+)>/g, "[...]");
  t = t.replace(/<@&([0-9]+)>/g, "[...]");

  // remove links (mantém imersão)
  t = t.replace(/https?:\/\/\S+/gim, "[sinal perdido]");

  // remove excesso de espaços
  t = t.replace(/[ \t]{2,}/g, " ");
  return t;
}

// força “frases curtas” estilo rádio
export function breakIntoRadioLines(text: string, maxLine = 42) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const w of words) {
    if ((line + " " + w).trim().length > maxLine) {
      if (line.trim()) lines.push(line.trim());
      line = w;
    } else {
      line = (line + " " + w).trim();
    }
  }
  if (line.trim()) lines.push(line.trim());

  // no máximo 10 linhas (anti-textão)
  return lines.slice(0, 10).join("\n");
}
