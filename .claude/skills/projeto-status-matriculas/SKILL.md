---
name: projeto-status-matriculas
description: Visão geral e regras de negócio do projeto Gestão de Alvos de Campo (analistafjp-design/status-matriculas, público): cruza histórico de visitas do field com a base cadastral para gerar bases de alvos, com resfriamento por status e consumo Social/Comércio. Use ao trabalhar nesse repositório.
---

# Projeto: Gestão de Alvos de Campo (status-matriculas)

- **Repositório:** analistafjp-design/status-matriculas (público). O
  `README.md` tem todas as regras e é a referência principal.
- **O que é:** cruza o **histórico de visitas do field** com a **base
  cadastral** para gerar bases de alvos **sem repetir endereços já visitados
  sem sucesso**. Planilhas lidas **no navegador** (File System Access API;
  melhor no Chrome/Edge); histórico acumulado no IndexedDB; nada sai do
  computador.
- **Branch padrão:** `claude/practical-archimedes-umwsya` (não `main`). Crie
  branches a partir dele e abra os PRs (rascunho) contra ele.
- **Regras já combinadas**
  - Arquivos classificados **pelo conteúdo (colunas)**, não pelo nome. Field:
    `Matrícula`, `Status da Atividade`, `Motivo de Não Execução`. Base
    cadastral: `NUM_LIGACAO`, `CON_MEDIDO`, `Mês/Ano`.
  - **Resfriamento:** cada status tira a matrícula da base de alvos por N
    dias. Status sem regra aparece incluído por padrão, nunca some em
    silêncio.
  - **Consumo Social/Comércio:** limites Social até 15 m³ e Pequeno Comércio
    até 10 m³. Só é estouro quando **medido E faturado** passam do limite. A
    base são os **2 meses fechados mais recentes** (mês fechado = ≥ 70% das
    leituras do mês mais completo), nunca o corrente. O 3º mês entra **por
    matrícula**, se ela tiver leitura dele (estourou de novo = lista de 3
    meses; voltou ao limite = radar). Cada matrícula pelo próprio histórico.
    **Conjuntos habitacionais ficam fora.** Social e Pequeno Comércio em
    cards separados.
  - **IA (Interpretar com IA):** `worker.js` faz a ponte com a API da
    Anthropic em `/api/interpretar-parecer`; só o texto do Parecer de Campo
    passa por ele, e só funciona no site publicado.
- **Stack:** Next.js com export estático (`out/`); interface em
  `app/dashboard-client.tsx`; regras em `lib/` (`parse.ts`, `classify.ts`,
  `matching.ts`, `consumo-social.ts`, `oportunidades.ts`,
  `buscar-matriculas.ts`, `idb.ts`, `fs-access.ts`, `export-xlsx.ts`,
  `ai.ts`). Publicação: Cloudflare Workers (`wrangler.jsonc`, `worker.js`).
- **Checagens:** `npm run lint` e `npm run build`. Não há testes
  automatizados: ao mudar regra de `lib/`, confira com um caso pequeno antes
  de dizer que está certo.
- **Segredos:** `ANTHROPIC_API_KEY` é secret do Worker na Cloudflare; nunca
  versionar. Mesclar só com "Pode mesclar".
