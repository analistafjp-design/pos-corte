---
name: projeto-pos-corte
description: Visão geral do projeto Pós-Corte Interior (analistafjp-design/pos-corte): painel em um único HTML que lê planilhas Excel de uma pasta do OneDrive e mostra Exec, Exoc, termos, negociações, recortes, categorias e Bases de campo. Use ao começar qualquer trabalho nele.
---

# Projeto: Pós-Corte Interior

- **Repositório:** analistafjp-design/pos-corte (público). Site:
  https://analistafjp-design.github.io/pos-corte/ (GitHub Pages, `main`/`docs`).
- **O que é:** painel de **um único arquivo HTML**, sem servidor e sem rede,
  que lê `.xlsx` de uma pasta do OneDrive no navegador. Nenhum dado sai do
  computador do usuário.
- **Abas:** Visão geral (indicadores, produção mensal em colunas com linha,
  recortes, cidades, categorias, frentes e equipes), Bases de campo,
  Analítico e Arquivos e regras.
- **Código:** `src/` (`core.js`, `app.js`, `exportar.js`, `styles.css`,
  `template.html`, `frentes-padrao.js`); `node build.mjs` gera o HTML e
  `docs/index.html`; `npm test` roda núcleo (Node) e interface (Playwright).
- **Skills relacionadas:** `pos-corte-regras` (fórmulas),
  `pos-corte-bases-campo`, `pos-corte-entrega` (fluxo),
  `pos-corte-conferir-numeros`.
- **Leia antes:** `CLAUDE.md`, `Prompt_Projeto_Pos_Corte.md` e
  `Projeto_Pos_Corte.md`.
- **Dono:** Fábio Passos (AnalistaFJP). Responder em português do Brasil.
- **Fluxo:** branch da `main`, PR em rascunho, mesclar só com "Pode mesclar".
- **Cuidado central:** dados reais (nomes, matrículas, débitos) nunca entram
  no HTML nem no repositório; testes só com planilhas sintéticas.
