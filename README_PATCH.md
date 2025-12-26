# Blackbot — Atualização Rádio (canal fixo + cargo fixo)

## Configurações (já fixas no código)
- Canal do rádio (único): `1453867021140754543`
- Cargo que pode publicar: `1453868618172596509`

## 1) Copie os arquivos
Copie a pasta `src/modules/radio/` para o seu projeto em `src/modules/radio/`.

## 2) Registrar o comando /radio
No arquivo onde você registra os Slash Commands (onde já registra `/setup`), importe e adicione:

```ts
import { radioCommandData } from "./modules/radio/index.js";
// ... inclua `radioCommandData` no array/lista de commands
```

> Se você tem um array `commands`, apenas faça `commands.push(radioCommandData)`.

## 3) Plugar no interactionCreate
No seu `src/handlers/interactionCreate.ts` (ou equivalente), importe:

```ts
import { radioCommand, handleRadioTypeSelect, handleRadioSubmit } from "../modules/radio/index.js";
```

E adicione no fluxo:

```ts
if (interaction.isChatInputCommand()) {
  const i = interaction;
  if (i.commandName === "radio") {
    await radioCommand(i);
    return;
  }
}

if (interaction.isStringSelectMenu()) {
  await handleRadioTypeSelect(interaction);
  return;
}

if (interaction.isModalSubmit()) {
  await handleRadioSubmit(interaction);
  return;
}
```

## 4) Deploy
- Commit no GitHub
- Railway redeploy

## Notas
- O bot bloqueia:
  - uso fora do canal do rádio
  - uso por quem não tem o cargo
  - flood (cooldown 2 min por usuário)
- O bot remove menções e links automaticamente, e desativa allowedMentions.
