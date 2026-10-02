---
name: pos-corte-entrega
description: Fluxo de trabalho para alterar o painel Pós-Corte Interior e entregar (branch, build, testes, conferência visual, PR em rascunho, mesclar só com autorização, GitHub Pages). Use sempre que for mudar código, texto ou visual do painel.
---

# Fluxo de entrega

1. **Entenda o pedido** e preserve o que já funciona. Não mude indicador,
   aba ou regra além do que foi pedido. Dúvida real de negócio: pergunte;
   caso contrário, escolha o padrão mais sensato e diga qual escolheu.
2. **Branch** a partir da `main` atualizada (`git fetch origin main`).
3. **Edite em `src/`** (`core.js`, `app.js`, `exportar.js`, `styles.css`,
   `template.html`). Nunca edite o HTML gerado à mão.
4. **Build:** `node build.mjs` (gera `Acompanhamento_Pos_Corte.html` e
   `docs/index.html`). Envie o HTML regenerado no commit.
5. **Testes:** `npm test` (núcleo no Node + interface no Chromium). Atualize
   ou crie testes para o que mudou. Fixtures são **sintéticas**
   (`tools/make_fixtures.py`); a planilha real nunca entra no repositório.
6. **Confira de verdade:** abra o HTML no Chromium (Playwright), tire captura
   de tela no desktop e em 390 px, verifique que não há rolagem horizontal e,
   quando houver número novo, compare com contagem independente (skill
   `pos-corte-conferir-numeros`).
7. **Commit** e **push** no branch; abra o **PR como rascunho** em português
   e assine a descrição como pede o ambiente.
8. **Só mescle** quando o usuário disser "Pode mesclar" (ou "Pode"/"Mescle").
   Se o branch ficou com histórico já mesclado, recrie-o da `main`.
9. **Depois de mesclar:** o GitHub Pages leva de 1 a 2 minutos
   (https://analistafjp-design.github.io/pos-corte/); peça Ctrl+F5. Se o
   painel passou a ler colunas novas (`PARSER_VERSION` sobe), avise que os
   arquivos serão relidos uma vez.

## Regras fixas

- Um único HTML, sem rede, sem bibliotecas externas.
- Dados pessoais nunca vão ao repositório (`.gitignore` bloqueia `.xlsx` e
  `.csv`).
- Textos da interface e respostas em português do Brasil, diretos.
- Relate resultados de teste como foram; se algo falhar ou não foi
  verificado, diga.
