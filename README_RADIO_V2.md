# Rádio V2 — Blackbot (Vale dos Ossos)

## O que muda nesta versão
- ⏱️ Transmissão expira e some após **10 minutos**
- 🔊 Delay falso de **3–10 segundos** antes de aparecer (mais tensão)
- 🧠 Variação procedural ("IA leve") com glitches + finais alternados
- 📡 Transmissões fantasmas automáticas (bot posta sozinho)
- 🎧 Arquitetura pronta para áudio distorcido (placeholder)

## Configs fixas
- Canal: 1453867021140754543
- Cargo de publicação: 1453868618172596509

## Onde ajustar
- `src/modules/radio/handler.ts`
  - `AUTO_DELETE_MS`
  - `FAKE_DELAY_MIN_MS / FAKE_DELAY_MAX_MS`
- `src/modules/radio/ghost.ts`
  - `GHOST_ENABLED`
  - frequência + banco de frases

## Permissões do bot
Para apagar mensagens após 10 min:
- Dar ao bot: **Gerenciar mensagens** no canal do rádio.

## Deploy
Commit + push e redeploy no Railway.
