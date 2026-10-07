# Pós-Corte Interior — instruções para a Claude

Painel em **um único arquivo HTML** (`Acompanhamento_Pos_Corte.html`). Ele lê
planilhas `.xlsx` de uma pasta do OneDrive, no navegador, e mostra:
- Exec e Exoc;
- negociações e termos aplicados (110013/310013);
- Sem Desdobro;
- frentes de serviço;
- produtividade por cidade;
- Bases de campo.

Nenhum dado sai do computador do usuário. O dono é **Fábio Passos**
(AnalistaFJP).

**Leia antes de mexer:** `Prompt_Projeto_Pos_Corte.md` (regras completas e
forma de trabalho) e `Projeto_Pos_Corte.md` (formatos aceitos, limites e
validações).

## Como trabalhar com o usuário

- Converse sempre em **português do Brasil**, de forma direta.
- Preserve o que já funciona. Não mude indicador, aba ou regra além do que
  foi pedido.
- **Não invente** dados, frentes, nomes de colunas nem resultados de testes.
  Os indicadores sempre vêm dos registros importados, nunca de valores fixos.
- Para cada pedido, crie um branch a partir da `main`, abra o PR como
  **draft** e **só mescle quando o usuário disser "Pode mesclar"** (ou
  "Pode").
- Escreva as mensagens de commit e as descrições de PR em português.

## Regras que não podem ser quebradas

- **O entregável é um HTML único e independente**: abre com duplo clique no
  Chrome ou no Edge, sem servidor, sem bibliotecas externas e **sem
  requisições de rede**.
- **Dados pessoais**: a base real (nomes, matrículas, débitos) nunca entra no
  HTML, no repositório (`.gitignore` bloqueia `.xlsx` e `.csv`) nem em
  serviço externo.
  - O navegador guarda só as colunas usadas de cada arquivo lido (IndexedDB),
    e há um botão para apagar.
  - Os testes usam planilhas **sintéticas**.
- **Não some** as abas "Pós Corte com Termo"/"Com Negociação" à Base: elas já
  estão contidas nela e somar duplicaria as atividades.
- **Indicador sem coluna** aparece como **indisponível**, nunca como zero
  silencioso.
- **Leia só as 19 colunas usadas** (a lista está no prompt).
  - Exceção 1: o **Serviço avulso** (CSV do faturamento, um por mês), lido só
    pela matrícula (`N. da Ligacao`), pelas colunas `Qtd. Economia ...` e pelo mês;
    é a fonte principal das economias recuperadas e o Cadastro completa o que faltar.
  - Exceção 2: o arquivo **Cadastro** (colunas `NUM_LIGACAO` e `TOTAL_ECO`; "cadastro"
    no nome do arquivo ou da pasta é só dica), lido à parte só pelas
    colunas `NUM_LIGACAO` e `TOTAL_ECO`, para as economias recuperadas. Ele não
    é base de atividades, só guarda matrícula, total e mês (coluna opcional
    `Mês/Ano`), e matrícula repetida nele é desconsiderada (dentro do mesmo mês,
    quando o arquivo tem vários meses).
- **Bases de campo**: o cruzamento é pela Matrícula e só considera os
  serviços de pós-corte (110010/11/12, 210010/11/12 e 310010/11/12).

## Estrutura e checagens

- **Código-fonte** em `src/`:
  - `core.js`: leitor de `.xlsx`, regras e agregações (roda no navegador e
    no Node);
  - `app.js`: interface;
  - `exportar.js`: exportação Excel;
  - `styles.css` e `template.html`;
  - `frentes-padrao.js`.
- **Build**: `node build.mjs` gera o `Acompanhamento_Pos_Corte.html` e o
  `docs/index.html`, que é publicado pelo GitHub Pages a partir de
  `main`/`docs`. **Depois de alterar `src/`, rode o build e envie o HTML
  regenerado.**
- **Testes**: `npm test`. Ele gera as fixtures sintéticas com Python
  (`xlsxwriter`/`openpyxl`), roda os testes do núcleo no Node e os de
  interface no Chromium/Playwright.
