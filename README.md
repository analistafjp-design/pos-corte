# Acompanhamento de Pós Corte (AnalistaFJP)

Painel em **um único arquivo HTML** que lê planilhas Excel (`.xlsx`) de uma pasta do OneDrive e mostra Exec, Exoc, negociações, termos aplicados (110013/310013), Sem Desdobro e frentes de serviço. Tudo roda no navegador: nenhum dado sai do computador.

## Usar

1. Abra `Acompanhamento_Pos_Corte.html` no Chrome ou no Edge (duplo clique).
2. **Conectar pasta** → escolha a pasta sincronizada do OneDrive (ou **Importar Excel** para escolher arquivos).
3. **Atualizar** para reler; com acesso contínuo, a leitura é automática a cada 60 s com a página visível.

Regras, formatos aceitos, limites e validações: veja [`Projeto_Pos_Corte.md`](Projeto_Pos_Corte.md). Prompt para continuar o desenvolvimento: [`Prompt_Projeto_Pos_Corte.md`](Prompt_Projeto_Pos_Corte.md).

> A base real tem dados pessoais. Ela **não** está no HTML nem no repositório (`.gitignore` bloqueia `.xlsx` e `.csv`).

## Desenvolver

```bash
node build.mjs                     # gera Acompanhamento_Pos_Corte.html a partir de src/
npm test                           # planilhas sintéticas + testes do núcleo (Node) + interface (Chromium)
npm run test:core                  # só o núcleo
POSCORTE_AMOSTRA="/caminho/Acompanhamento - Pós Corte.xlsx" npm run test:core   # inclui a planilha real (opcional)
```

Requisitos de desenvolvimento: Node 20+, Python 3 com `xlsxwriter` e `openpyxl` (só para gerar planilhas de teste) e Playwright com Chromium (testes de interface; `CHROMIUM_PATH` opcional).

```
src/core.js      leitor .xlsx (ZIP + XML incremental), regras, deduplicação, frentes, filtros, CSV
src/app.js       interface (Visão geral, Analítico, Base e regras), pasta/OneDrive, mensagens
src/styles.css   estilos          src/template.html   casca da página
src/frentes-padrao.js  mapeamento padrão Nomenclatura → Frente
build.mjs        junta tudo em um HTML único
tests/           core.test.mjs (Node) · ui.test.cjs (Chromium) · fixtures/ (geradas, ignoradas)
tools/make_fixtures.py  gera planilhas sintéticas (296 colunas × 8.136 linhas e casos-limite)
```
