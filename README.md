# Pós-Corte Interior

Painel em **um único arquivo HTML** que lê planilhas Excel (`.xlsx`) de uma pasta do OneDrive e mostra Exec, Exoc, negociações, termos aplicados (110013/310013), Sem Desdobro e frentes de serviço. Tudo roda no navegador: nenhum dado sai do computador.

## Usar

1. Abra `Acompanhamento_Pos_Corte.html` no Chrome ou no Edge (duplo clique).
2. **Conectar pasta** → escolha a pasta sincronizada do OneDrive (ou **Importar Excel** para escolher arquivos).
3. **Atualizar** para reler; com acesso contínuo, a leitura é automática a cada 60 s com a página visível.

Regras, formatos aceitos, limites e validações: veja [`Projeto_Pos_Corte.md`](Projeto_Pos_Corte.md). Prompt para continuar o desenvolvimento: [`Prompt_Projeto_Pos_Corte.md`](Prompt_Projeto_Pos_Corte.md).

> A base real tem dados pessoais. Ela **não** está no HTML nem no repositório (`.gitignore` bloqueia `.xlsx` e `.csv`). Para não reler tudo, o painel grava no navegador deste computador o resultado de cada arquivo lido (só as colunas usadas); há botão para apagar.

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
src/exportar.js  exportação para Excel (.xlsx gerado sem bibliotecas)
src/app.js       interface (Visão geral, Analítico, Base e regras), pasta/OneDrive, mensagens
src/styles.css   estilos          src/template.html   casca da página
src/frentes-padrao.js  mapeamento padrão Nomenclatura → Frente
build.mjs        junta tudo em um HTML único
tests/           core.test.mjs (Node) · ui.test.cjs (Chromium) · fixtures/ (geradas, ignoradas)
tools/make_fixtures.py  gera planilhas sintéticas (296 colunas × 8.136 linhas e casos-limite)
```

## Publicar por URL (GitHub Pages)

O painel é só código (sem dados), então pode ficar em uma URL fixa. O `node build.mjs` gera também `docs/index.html`.

1. No GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, **Branch: `main`**, **Folder: `/docs`**, Save.
2. Em alguns minutos o painel abre em `https://analistafjp-design.github.io/pos-corte/`.
3. Os arquivos continuam sendo lidos **no computador de quem abre a página**: nada da pasta do OneDrive é enviado ao GitHub.

Observações: a página publicada é pública (quem tiver a URL a vê, mas só vê o painel vazio). Em repositório privado, o GitHub Pages exige plano pago (Pro/Team). Os dados gravados no navegador ficam ligados ao endereço da página; abrir por outra URL (ou pelo arquivo local) começa sem eles.

## Bases de campo

A aba **Bases de campo** recebe as bases geradas pela estratégia que saem para campo (precisam ter a coluna **Matrícula**). O cruzamento é pela matrícula com o histórico da base principal, sempre só com os serviços de pós-corte (110010/110011/110012, 210010/210011/210012 e 310010/310011/310012): a matrícula está percorrida quando há atividade Exec/Exoc dela (vale a mais recente). Havendo "Data da base" (tirada do nome do arquivo, editável no cartão), conta só atividade a partir dela. Por base, o painel mostra total da base, data que subiu, percorrido, quanto falta, Exec, Exoc, termos, assertividade, negociações, efetividade, sem desdobro, total de equipes e os **recortes** (Fez o corte novamente = Sim), com o tipo (Onde Foi Feito O Corte?) e a porcentagem sobre o Exec. **Baixar o que falta (Excel)** exporta as linhas ainda não percorridas. As bases ficam gravadas no navegador, por mês e pela data em que subiram.
