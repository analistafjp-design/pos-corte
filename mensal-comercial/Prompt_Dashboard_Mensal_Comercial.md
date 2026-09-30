# Prompt — Dashboard "Mensal Comercial"

Este arquivo tem três partes:

1. **Sua solicitação original** e **o que foi melhorado** (e por quê).
2. **Prompt completo**: cole em outra conversa ou ferramenta para desenvolver o projeto.
3. **Prompt curto**: versão enxuta para quando o contexto já existe.

Anexe ao prompt: o `.pbit` do relatório (ver "Como enviar o modelo"), o PDF de referência e, se existirem, os arquivos deste repositório em `mensal-comercial/`.

---

## 1. Sua solicitação → o que mudou

**Original:**
> Preciso que analise detalhadamente este arquivo pbix, entenda toda estrutura, regras e critérios, depois atue como um desenvolvedor sênior especialista para transformar este arquivo em um dashboard profissional, dinâmico e moderno para que seja consultado em momentos de tomada de decisões. Analise cada coluna, medida e abas para que seja um visual claro e esclarecedor. Não precisa ser no mesmo modelo mas, que todas as informações sejam separadas para que qualquer pessoa que olhar entenda os números.

| Ponto | Problema no original | Como ficou |
|---|---|---|
| **Insumo** | Um `.pbix` grande demais para enviar | Pede o `.pbit` (sem dados, pequeno) + PDF, e diz o que extrair de cada um |
| **"Analise detalhadamente"** | Não diz o que entregar da análise | Exige dicionário de colunas/medidas e **matriz de rastreabilidade** (visual → medida → coluna → fonte) |
| **"Entenda regras e critérios"** | Deixa implícito que o relatório está certo | Manda **conciliar**: todo total que aparece em mais de um lugar deve fechar; divergência é reportada, não escondida |
| **"Profissional, moderno"** | Subjetivo | Critérios verificáveis: paleta validada para daltonismo, tema claro/escuro, contraste, celular, teclado, impressão |
| **"Para decisões"** | Não diz quais decisões | Cada aba responde uma **pergunta de decisão**; há destaques e alertas gerados dos dados |
| **"Dinâmico"** | Ambíguo | Definido: filtros, foco, ordenação, comparação de períodos, acumulado do mês, projeção, importação de novos dados |
| **"Qualquer pessoa entenda"** | Bom, mas sem regra | Regras de linguagem: sem sigla sem explicação, nome padronizado, "o que significa" em cada indicador |
| **Sem critério de pronto** | Não há como saber quando acabou | **Critérios de aceite** numerados e testes automatizados |
| **Risco de invenção** | Nada impede o modelo de "completar" dados | Proíbe inventar; marca o que é dedução; nunca zero silencioso |
| **Dados sensíveis** | Não menciona | Regras de privacidade |

---

## 2. Prompt completo

```text
Você é um(a) desenvolvedor(a) sênior de BI e front-end, com experiência em Power BI (DAX, Power Query,
modelagem) e em visualização de dados para decisão. Responda sempre em português do Brasil.

## 1. Objetivo

Transformar o relatório Power BI "Mensal Comercial" em um dashboard profissional, moderno, dinâmico e
fácil de entender, para ser consultado na hora de tomar decisões. Não precisa copiar o layout original.
O que importa: (a) cada número separado e explicado, de modo que qualquer pessoa entenda o que está vendo;
(b) números confiáveis; (c) um visual claro que aponte onde agir.

Público: gestores e analistas comerciais/operacionais que decidem sobre equipes de campo, metas,
negociação de débitos e qualidade da execução. Nem todos conhecem as siglas do relatório.

## 2. Insumos

- Modelo do relatório (.pbit, sem dados) e/ou lista de medidas DAX e colunas.
- PDF exportado do relatório (páginas: "1. Report", "1. Corte", "1. Negociações" e uma página auxiliar de Vendas).
- Repositório com o que já existe em `mensal-comercial/`: análise, dados de exemplo, painel e testes.
Leia tudo antes de propor qualquer coisa. Não peça de novo o que já está nos arquivos.

## 3. Método (nesta ordem; entregue o resultado de cada fase antes de seguir)

### Fase 0: Descoberta e documentação
Extraia do modelo e documente:
1. Tabelas, colunas (nome, tipo, origem), relacionamentos (cardinalidade, direção do filtro) e passos do Power Query.
2. TODAS as medidas DAX: nome, expressão, formato, onde é usada. Explique em linguagem simples o que cada uma faz.
3. Páginas, visuais, filtros/segmentações, drill-through, marcadores, dicas de ferramenta, páginas ocultas e
   filtros de página/visual (inclusive as interações entre visuais).
4. Regras de negócio embutidas (filtros na medida, exclusões, tratamento de "em branco", periodicidade da meta).
Entregue: (a) dicionário de colunas e medidas; (b) matriz de rastreabilidade visual → medida → coluna → tabela;
(c) lista de dúvidas que só o dono do relatório responde.

### Fase 1: Conciliação (obrigatória antes de desenhar)
- Todo total que aparece em mais de um lugar precisa fechar. Verifique por conta, não por leitura.
- Cada divergência vira um item com: o que era esperado, o que foi encontrado, a diferença, a causa provável
  e a medida canônica proposta. Nunca "corrija" em silêncio, nunca esconda.
- Classifique: ERRO (a conta está errada) · DEFINIÇÃO DIFERENTE (dois recortes com o mesmo nome) · DADO (cadastro
  incompleto) · INFORMATIVO.
- Escolha uma definição única por indicador e padronize o nome.

### Fase 2: Desenho
- Defina 4 a 6 áreas (abas). Cada uma responde UMA pergunta de decisão, escrita no topo. Sugestão de partida:
  Resumo do dia · Operação (corte, religação, pós-corte) · Negociações · Metas · Conferência · Dicionário.
- Hierarquia: primeiro o número que resume, depois o que explica, por último o detalhe.
- Cada indicador tem nome claro, e a sigla original ao lado quando ajuda. Sem sigla sem explicação.
- Onde o relatório mostrar "--", "Infinito", vazio ou zero, decida caso a caso: "sem dado" é diferente de zero.
- Gere destaques e alertas em frases, calculados dos dados (nunca fixos no código), com link para o detalhe.

### Fase 3: Implementação
- Entregável principal: UM arquivo `.html` independente (sem servidor, sem bibliotecas externas, sem
  requisições de rede), gerado por um script a partir de um modelo + um JSON de dados. Siga o padrão do
  repositório (`mensal-comercial/build.mjs`).
- O painel é dirigido por dados: trocar o JSON (ou importar outro arquivo) muda tudo. Nenhum número fixo no código.
- Todo texto vindo dos dados entra na página por `textContent` (nunca `innerHTML`).
- Dinâmico, no mínimo: seletor de dia; foco em cidade/equipe que destaca as linhas em todo o painel; ordenação
  de tabelas; alternância de métrica; expandir/recolher hierarquias; dica ao passar o mouse ou focar com teclado
  (todo valor da dica também está visível na tabela); importar novos dias; copiar resumo; imprimir/PDF.
- Meta: além de "realizado do dia", mostre **acumulado do mês**, **atingimento**, **ritmo necessário**
  ((meta − acumulado) ÷ dias úteis restantes) e **projeção de fechamento**. Se o acumulado não existir nos dados,
  mostre isso explicitamente e não invente.

### Fase 4: Verificação
- Testes automatizados (Node + Chromium/Playwright): números da tela = números da fonte; cada conferência com o
  resultado esperado; filtros; ordenação; importação (válida, inválida, com HTML malicioso); tema; teclado;
  celular sem rolagem horizontal; nenhuma chamada de rede; nenhum erro de console.
- Olhe o resultado renderizado (capturas em desktop, celular e tema escuro) antes de declarar pronto.
- Reporte o que foi e o que NÃO foi testado.

## 4. Regras de negócio já identificadas (não redescobrir; confirmar no modelo)

Confirmadas por conta no PDF de 29/09/2026:
- O.S. percorridas (Perc) = Exec + Exoc. Taxa de execução = Exec ÷ (Exec + Exoc); no total 453 ÷ 498 = 91,0%.
- Exoc não inclui O.S. com negociação (rodapé do relatório): negociação conta como Exec.
- "Qtd Eq" é contagem DISTINTA de equipes: o total (57) não é a soma das linhas (93). Nunca somar equipes.
- Realizado dos cards de meta = Exec do serviço correspondente (29 corte no cavalete, 13 corte LISC, 58, 3 e 12 de religação).
- Meta de Corte = cavalete + LISC + ramal (1.200 + 175 + 175 ≈ 1.550); Religação = 1.000 + 159 + 159 = 1.318.
- Ticket médio = valor negociado ÷ quantidade (R$ 58.104,64 ÷ 131 = R$ 443,55).
- Assertividade de negociação = Neg ÷ (Exec + Exoc) da categoria (5 ÷ 85 = 5,88%). Visitas por negociação = inverso.
- Perfil do cliente (Adimplente, Inadimplente, Nunca Pagou, em branco) soma o total de negociações.

Inferidas (marcar como suposição até confirmar):
- "Orçado" é a meta do MÊS e "Real" é do DIA filtrado. Para comparar, use meta diária de referência = orçado ÷ dias úteis
  (parâmetro editável; se o orçado for diário, use 1).
- A "frente" da equipe vem do prefixo do código do recurso (RIOCERIN → Corte-Religa, RIOFSCIN → Fiscalização,
  RIOLTRIN → Leitura, RIOPCRIN → Pós Corte); os "filhos" de cada perfil de cliente são as frentes que negociaram.
- "Negociação Principal" = negociação em O.S. de Cobrança (124 = 124).

Problemas conhecidos do relatório (resolver na Fase 1, não copiar):
1. Coluna "% Ass." de Corte/Religação: divide a taxa do total pela taxa da linha (passa de 100%; cinco cidades
   mostram 91,30%). Trocar por Exec ÷ (Exec + Exoc) por linha.
2. Negociações: 131 (soma das cidades, card) × 132 ("Total Negociações"); R$ 58.104,64 × R$ 58.427,47.
   A diferença de R$ 322,83 é 1 negociação sem cidade.
3. Motivos de não execução somam 66; ocorrências (Exoc) são 45.
4. Termos: 29 (card) × 19 (tabela) × 20 (soma das linhas).
5. "Pós Corte" tem dois sentidos (78 O.S. de vistoria pós-corte × 61 da frente) e "Negociação pós-corte" tem quatro
   números (2, 5, 7, 8): são recortes diferentes com o mesmo rótulo.
6. "Eq" muda de definição entre visuais (57, 10 e 61).
7. Coluna "Prog" (programado) vazia; linha "Dif" sempre 0; 5 negociações sem perfil de cliente.
8. Sem série diária nem acumulado do mês; "Vendas ALL" (2.261) sem definição.

## 5. Padrões de visualização

- Escolha a forma pelo trabalho do dado: número único → cartão; comparar magnitudes → barras; parte de um todo →
  barra empilhada (rosca só para poucos itens, sem comparar valores próximos); ranking → tabela com barras.
- Nunca eixo duplo. Sem gráfico de uma barra. Sem 3D.
- Cor pelo papel, fixa por entidade (uma medida não muda de cor entre gráficos). Categóricas em ordem fixa,
  no máximo 8. Sequencial = um tom. Divergente = dois tons com neutro no meio.
- Valide a paleta com o validador de daltonismo (diferença mínima entre pares e contraste) nos dois temas.
- Situação (bom/atenção/crítico) SEMPRE com ícone + texto, nunca só cor. Cores de status não são cores de série.
- Todo gráfico tem o valor escrito (rótulo ou tabela). Barras finas, grade recessiva, 2 px de separação, sem borda.
- Texto nunca usa a cor da série. Contraste mínimo 4,5:1 no texto, 3:1 nos elementos gráficos.
- Tema claro e escuro (padrão do sistema + botão), impressão em A4, celular a partir de 360 px, navegação por teclado,
  respeitar "reduzir movimento".
- Números em pt-BR (1.234,5 · R$ 1.234,56 · 91,0%), dia da semana junto da data.

## 6. Restrições

- Não invente dados, nomes de coluna, medidas, metas ou resultados de teste. Marque cada dedução como tal.
- Nunca mostre zero no lugar de "sem dado".
- Privacidade: a base real pode ter nome de cliente, matrícula e débito. Não a incorpore ao HTML nem ao
  repositório, não a envie a serviço externo e não a publique (inclusive em páginas públicas do GitHub) sem
  autorização específica. O painel usa só agregados. Não inclua chaves, senhas ou tokens.
- Valor de negociação é DÉBITO NEGOCIADO, não "arrecadado" nem "pago", salvo confirmação do modelo.
- Preserve o que já funciona no repositório. Faça alterações pequenas e verificáveis.

## 7. Critérios de aceite (todos devem ser verdadeiros)

1. Dicionário cobre 100% das colunas e medidas usadas; a matriz de rastreabilidade não tem visual sem fonte.
2. Nenhum total aparece com valores diferentes em duas telas; toda divergência da fonte está listada na aba
   Conferência, com esperado × encontrado × causa provável × o que fazer.
3. Cada aba tem a pergunta de decisão no topo e responde a ela sem precisar abrir outra.
4. Cada indicador tem nome claro, definição, fórmula e origem acessíveis a 1 clique.
5. Dia, foco (cidade/equipe), ordenação, alternância de métrica e importação funcionam e têm teste automatizado.
6. Acumulado do mês, atingimento, ritmo necessário e projeção aparecem quando há série diária; quando não há,
   o painel diz o que falta.
7. Paleta validada nos dois temas; situação sempre com ícone + texto; sem rolagem horizontal da página em 390 px.
8. Sem chamadas de rede, sem `eval`, sem `innerHTML` com dados; HTML malicioso nos dados aparece como texto.
9. `npm test` passa; capturas de desktop, celular e tema escuro foram vistas e revisadas.

## 8. Como trabalhar comigo

- Se uma dúvida mudar o resultado (ex.: "Orçado é mensal ou diário?"), pergunte UMA vez, com a sua recomendação.
  Para o resto, escolha um padrão sensato, avise e siga.
- Entregue por fases, mostrando o que descobriu e o que decidiu. No fim: o que foi feito, como usar, o que foi
  testado, o que NÃO foi testado e as limitações reais.
- Envie os arquivos finais e o comando para regenerá-los.
```

---

## 3. Prompt curto (contexto já existente)

```text
Continue o projeto "Mensal Comercial" em `mensal-comercial/` (leia a análise, os dados e o painel antes).
Objetivo: dashboard claro e dinâmico para decisão, com cada número separado e explicado.
Próximo passo: <descreva, ex.: "usar o modelo (.pbit) anexo para trocar as fórmulas deduzidas pelas medidas reais,
incluir acumulado do mês, atingimento, ritmo necessário e projeção">.
Regras: não invente dados; marque o que for suposição; nunca zero no lugar de "sem dado"; concilie todo total que
aparece em mais de um lugar e liste divergências na aba Conferência; texto dos dados só por textContent;
sem rede; paleta validada; situação com ícone + texto; tema claro/escuro; celular 390 px.
Ao terminar: `node mensal-comercial/build.mjs && node --test tests/mensal.ui.test.cjs`, veja as capturas e
reporte o que foi e o que não foi testado.
```

---

## Como enviar o modelo (o `.pbix` é grande demais)

O `.pbix` é grande porque leva os **dados**. Para documentar o relatório não é preciso ter os dados:

1. **Power BI Desktop › Arquivo › Exportar › Modelo do Power BI (`.pbit`).** O `.pbit` guarda só Power Query, relacionamentos, medidas DAX e páginas. Costuma ter poucos MB.
2. Alternativa: **Tabular Editor** ou **DAX Studio**, para exportar a lista de medidas (nome, expressão, formato) e o dicionário de colunas.
3. Se o modelo tiver segmentação por linha (RLS) ou dados pessoais, confirme antes de enviar qualquer arquivo com dados.
