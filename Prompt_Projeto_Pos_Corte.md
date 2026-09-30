# Prompt completo — Acompanhamento de Pós Corte

Copie o texto abaixo para continuar o projeto. Anexe (ou aponte para o repositório) `Acompanhamento_Pos_Corte.html`, `Projeto_Pos_Corte.md` e, quando necessário, uma planilha de exemplo.

---

Você é responsável por desenvolver e manter meu painel de **Acompanhamento de Pós Corte**, da identidade **AnalistaFJP**. Meu nome é **Fábio Passos**. Quero um sistema funcional, moderno, responsivo e fácil de utilizar, com indicadores confiáveis e atualização por arquivos Excel em uma pasta sincronizada do OneDrive. Responda sempre em português do Brasil.

## Objetivo e forma de trabalho

Analise o repositório (ou o HTML e os documentos anexados) antes de alterar. Continue a implementação existente, preservando o que funciona. Execute o trabalho até entregar os arquivos finais e informar os testes realizados e as limitações reais.

Não trate dados de referência como resultados fixos. Os indicadores são calculados a partir dos registros importados. Não invente dados, frentes, nomes de colunas ou resultados de testes.

O entregável principal é **um arquivo `.html` único e independente** (`Acompanhamento_Pos_Corte.html`) que abre por duplo clique no Chrome ou Edge, sem servidor, Python, Node ou bibliotecas, e **sem requisições de rede**. Ele é gerado por `node build.mjs` a partir de `src/`:

- `src/core.js`: leitor de `.xlsx`, regras, deduplicação, frentes, filtros/agregações, CSV (roda no navegador e no Node);
- `src/app.js`, `src/styles.css`, `src/template.html`: interface;
- `src/frentes-padrao.js`: mapeamento padrão Nomenclatura → Frente (52 linhas, sem dados pessoais);
- `tests/core.test.mjs` (Node) e `tests/ui.test.cjs` (Chromium/Playwright); `tools/make_fixtures.py` gera planilhas **sintéticas** em `tests/fixtures/` (ignorada pelo git). `npm test` roda tudo.

Depois de alterar `src/`, rode `node build.mjs` e os testes; entregue o HTML regenerado.

## Dados e privacidade

A base real contém nomes, matrículas e débitos. **Não a incorpore ao HTML, não a versione e não a envie a hospedagem, repositório ou serviço externo sem minha autorização específica.** Não inclua chaves, credenciais ou tokens. O único conteúdo de negócio embutido é o mapeamento padrão de frentes. Testes usam planilhas sintéticas; a planilha real só entra em um teste opcional por variável de ambiente (`POSCORTE_AMOSTRA`).

## Fonte e abas

A fonte de referência é `Acompanhamento - Pós Corte.xlsx`:

- `Base`: 8.136 registros e 296 colunas (A:KJ); fonte principal.
- `Pós Corte com Termo`: 389 registros; recorte para conferência.
- `Pós Corte com Negociação`: 230 registros; recorte para conferência.
- `Frente de Serviço`: 52 registros, com `Frente` e `Nomenclatura`.

As abas de termos e negociações estão contidas na Base. **Não some essas abas à Base** (duplicaria atividades). Não presuma que os recortes continuam conciliados: o painel os compara e informa.

**Os arquivos que vou usar podem ser menos detalhados** (menos colunas, outra aba principal, sem as abas de apoio, título antes do cabeçalho). O leitor deve continuar aceitando isso: prefere a aba "Base"; sem ela, usa a única aba com o cabeçalho esperado (mínimo de 4 das 19 colunas), recusando ambiguidade; aceita o arquivo se existir ao menos uma coluna de indicador; marca como **indisponível** (nunca zero silencioso) o indicador cuja coluna falta; não classifica "Sem Desdobro" sem a coluna `Serviço adicionais resposta`; permite cadastrar nomes alternativos de colunas.

Analise todas as colunas na leitura (auditoria de preenchimento) e mantenha no modelo só os campos necessários:

1. Recurso
2. Cód. Protocolo Origem
3. ID da Atividade
4. Matrícula
5. Código/Descrição
6. Data
7. Status da Atividade
8. Nome do Solicitante
9. Cidade
10. Início do SLA
11. Fim do SLA
12. Tipo do Corte Realizado
13. Qual a situação do imóvel?
14. Irregularidade Encontrada?
15. Valor Total dos Débitos
16. Negociou O Débito?
17. Categoria
18. Situação Do Imóvel
19. Serviço adicionais resposta

Não una `Qual a situação do imóvel?` com `Situação Do Imóvel`.

## Regras obrigatórias dos indicadores

- **Atividades:** registros da Base após deduplicação e filtros. Não use só a matrícula para identificar uma atividade (há matrículas com várias visitas).
- **Finalizadas — Exec:** `Status da Atividade = Finalizada`.
- **Encerradas com Ocorrência — Exoc:** `Status da Atividade = Encerrada com Ocorrência`. Outros status devem aparecer, não ser escondidos.
- **Negociações:** somente quando `Negociou O Débito?` for **Sim** (espaços externos e caixa normalizados). Não deduza negociação de códigos, texto livre, valor ou desdobro.
- **Sem Desdobro:** negociação Sim com `Serviço adicionais resposta` vazio, nulo ou só espaços. Continua sendo negociação: é subconjunto, não indicador a somar.
- **Termos aplicados (irregularidade identificada):** `Serviço adicionais resposta` contém o código completo `110013` (time de Serviços) ou `310013` (VCG), em qualquer posição, com **limites numéricos** (`1100130` e `9310013` não contam). Uma atividade conta no máximo uma vez. `Irregularidade Encontrada? = Sim` sozinho não conta.
- Negociação e termo podem ocorrer na mesma atividade; não somar para obter visitas. Sem filtro adicional de status (mudar só com minha orientação).
- **Valores:** o valor das negociações é o **débito informado** (`Valor Total dos Débitos`, texto no padrão brasileiro como `R$ 1049,6`, `R$ ,03`, `R$ ` = vazio). Nunca rotular como arrecadação, valor recebido ou pago.

## Frentes de serviço

- `Nomenclatura` é o prefixo de `Recurso`; `Frente` é o nome exibido; sem diferenciar caixa; prefixo mais longo vence.
- Sem correspondência: **Não mapeada**, com a quantidade disponível para conferência (na amostra, 430 atividades: `RIOGCLNT-*` e `RIOCOBB1-*`). Não invente classificações.
- Preserve mapeamentos já carregados quando o novo arquivo não os trouxer; para a mesma nomenclatura, o mapeamento mais recente substitui.

## Deduplicação

1. Ignore arquivos `~$`.
2. Ordene por data de modificação.
3. Chave principal: `ID da Atividade`; sem ID: `Cód. Protocolo Origem + Matrícula + Código/Descrição + Data + Recurso` — se algum desses campos estiver vazio, a linha não é unida a nenhuma outra (e o painel avisa).
4. Chave repetida: prevalece o arquivo modificado mais recentemente.
5. Informe as duplicatas removidas. Documente que a data de modificação é critério operacional, não garantia de atualidade.

## Atualização por OneDrive

A pasta é sincronizada no computador; digitar `C:\...` em uma página não a conecta. Preserve:

- seleção da pasta pelo usuário (subpastas incluídas), botão Atualizar e leitura a cada 60 s **só** com a página visível e permissão de acesso contínuo;
- importação manual de arquivos; seleção manual de pasta quando a API não existe (sem monitoramento automático nesse modo);
- lembrar a última pasta (guarda o acesso, **não** os dados) e oferecer "Reconectar pasta";
- mensagens claras de carregamento, conclusão e erro; nome dos arquivos que falharam, com o motivo; aviso explícito de importação parcial; base anterior preservada quando nenhuma base válida for carregada;
- reaproveitar a leitura de arquivos inalterados (nome + tamanho + data).

Não prometa que o HTML salva os dados importados nem que atualiza com a página fechada.

## Leitura robusta do Excel

Houve a falha `Cannot read properties of null (reading 'getElementsByTagName')`. O leitor atual usa ZIP por `Blob.slice`, `DecompressionStream` e **XML incremental** (sem árvore DOM), resolvendo as partes pelos relacionamentos internos. Preserve isso: a Base tem ~96 MB de XML descompactado. Suporta `.xlsx` sem senha; **não** suporta `.xls`, `.xlsb`, senha nem ZIP64 — não anuncie o contrário sem implementar e testar. Lê o resultado gravado das fórmulas. Valide estrutura e cabeçalhos e nunca mascare arquivo inválido como base vazia.

## Interface e gráficos

Visual moderno e profissional, identidade AnalistaFJP; navegação Visão geral / Analítico / Base e regras; cartões de atividades, Exec, Exoc, negociações, termos e Sem Desdobro; barras horizontais com rótulos completos; produção mensal e rankings por frente, cidade e equipe; gráfico separado de negociações e termos com a mesma escala; tabela dos valores mensais; layout responsivo sem sobreposição; mouse, teclado e toque. Cores por indicador validadas para daltonismo (`validate_palette`). Não acrescente metas, previsões, arrecadação ou funcionalidades fictícias.

## Filtros e analítico

Data inicial/final, cidade, frente, equipe, seletor do indicador dos gráficos; "julho mostra só julho"; cliques em cards/meses/rankings previsíveis (clicar de novo limpa); busca por matrícula, protocolo/O.S., ID e nome; paginação de 50 sem reduzir a exportação; CSV UTF-8 com BOM, `;`, todas as linhas filtradas e proteção contra fórmulas. Mantenha todas as cidades da fonte; não aplique restrições de municípios de outros projetos.

## Validação

Resultados de referência da amostra (calculados, não fixos): Atividades 8.136 · Exec 7.461 · Exoc 675 · Negociações 230 · Termos 389 (382 + 7) · Sem Desdobro 2 · débito informado R$ 252.027,39 · período 02/01/2026 a 28/09/2026.

Rode `npm test` (gera planilhas sintéticas, roda o núcleo no Node e a interface no Chromium). Com a planilha real: `POSCORTE_AMOSTRA=/caminho/arquivo.xlsx npm run test:core`. Não afirme ter testado no Windows, no Edge ou no OneDrive real se isso não foi executado (até agora **não** foi).

## Entrega e continuidade

Entregue: (1) o HTML completo e independente, regenerado; (2) a documentação atualizada; (3) um resumo curto de alterações, validações e limitações. Se eu pedir publicação online, verifique a versão efetivamente publicada e informe o endereço só depois de confirmar; o endereço existente é `https://acompanhamento-pos-corte.analistafjp.chatgpt.site` e **não** foi atualizado por esta versão.

Comece lendo o repositório e a documentação e faça as alterações que eu pedir em seguida, mantendo estas regras como referência.
