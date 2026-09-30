# Análise do relatório "Mensal Comercial"

**Fonte analisada:** PDF exportado do Power BI em 30/09/2026, com 4 páginas, dados do dia **29/09/2026** (filtro de mês: set/2026).
**Não analisado:** o arquivo `.pbix` (grande demais para o envio). Tudo abaixo vem do que está impresso no PDF, com contas de conferência. Onde há dedução, isso está marcado.

Legenda de confiança: **[Confirmado]** = fecha por conta com os números do PDF · **[Inferido]** = deduzido de evidências, a confirmar no modelo · **[Não identificado]** = o PDF não permite saber.

---

## 1. Resumo

O relatório é uma foto operacional de **um dia** de serviços comerciais de campo (corte, religação, pós-corte, vistorias, cobrança, cadastro) e de **negociações de débito** feitas nessas visitas. Ele mistura, nas mesmas telas, números por serviço, por frente (grupo de equipes), por cidade, por equipe e por perfil de cliente.

O que o painel novo (`Dashboard_Mensal_Comercial.html`) faz sobre esse conteúdo:

- separa as informações em 6 abas, cada uma com uma pergunta de decisão (seção 7);
- troca siglas por nomes claros e mantém a sigla original ao lado (Dicionário);
- **recalcula** taxas e proporções em vez de copiar as que estão erradas;
- roda **32 conferências automáticas** sobre os próprios números: 14 fecham, **13 são alertas** e 5 são informativas (seção 5).

**Os três achados que mais importam para quem decide:**

1. **Os totais não fecham entre as páginas.** Negociações: 131 num lugar, 132 noutro (R$ 58.104,64 × R$ 58.427,47). Motivos de não execução somam 66, mas as ocorrências são 45. "Termos": 29, 19 e 20 no mesmo dia.
2. **A coluna "% Ass." de Corte e Religação está com a conta invertida** (passa de 100%, e 5 cidades mostram o mesmo 91,30%). Não deve ser usada.
3. **O realizado é de um dia e a meta ("Orçado") parece ser do mês**, e a linha "Dif" é 0 em todos os cards. O relatório não permite saber se a meta está sendo atingida. Falta o **acumulado do mês**.

---

## 2. Como o relatório está organizado

| # | Página | Papel | Filtros visíveis |
|---|---|---|---|
| 1 | **1. Report** | Página inicial: metas × realizado, serviços, categorias, motivos | Data (29/09/2026), Mês (set/2026) |
| 2 | **1. Corte** | Detalhe de corte, religação e pós-corte por frente, cidade e equipe | Data, Mês |
| 3 | **1. Negociações** | Detalhe das negociações: quantidade, valor, perfil, cidade, equipe | Data, Mês, "Todos" (campo não identificado) |
| 4 | *(sem título)* | Tabela solta: Vendas Meta = 244 · Vendas ALL = 2.261 | Página auxiliar |

**[Inferido]** As páginas 2 e 3 têm o botão "voltar" (seta no canto): são páginas de detalhe (drill-through) da página 1. O prefixo "1." indica o grupo de navegação.

---

## 3. Página a página: visuais, colunas e medidas

### 3.1 "1. Report"

| Visual | Campos / medidas | Observações |
|---|---|---|
| **Cards Orçado / Real / Dif** (10 indicadores × 3 linhas) | Corte Cavalete, Corte Lisc Meta, Corte Ramal Meta, Religação Cavalete, Religação Lisc Meta, Religação Ramal, Meta Negociação, Instalação de H…, Substituição de…, Termos Meta | Nomes cortados no PDF. "Dif" = 0 em todos os cards com realizado. "--" quando não há realizado |
| **Cards de apoio** | Rec. Cavalete (9), Rec. Ramal (38), Vendas (17), Negociação Tot R$ (58.105), Negociação tot qtd (131), Tickt Médio (R$ 443,55) | |
| **Matriz "Serviço real executado"** | Serviço › Prog, Qtd Eq, Exec, Exoc, Perc, % Asser | Linhas expansíveis (+). "Prog" vazio |
| **Tabela por categoria** | Categoria › O.S Exec, Neg Tot, Neg %Ass, Termos, Efet Termos | 3 categorias: Vistoria pós-corte, Vistoria de irregularidade, Corte |
| **Colunas "Motivo de Não Execução"** | 17 motivos × quantidade | Nomes truncados. Soma 66 |
| **Rodapé de regras** | 3 definições (seção 4) | |

Valores do dia: 498 O.S. percorridas = 453 Exec + 45 Exoc; taxa 91,0%; 57 equipes.

### 3.2 "1. Corte"

| Visual | Campos / medidas | Observações |
|---|---|---|
| **Cards** | Corte Meta (1,55 Mil) · Corte Real (42) · Relig. Meta (1,318 Mil) · Relig. Real (73) · Neg. Corte Meta (1,186 Mil) · Neg. Corte (--) · Neg. Corte $ (--) · Ticket Médio (--) | |
| **Tabela Corte por frente** | Frente › Eq, PROG, EXEC, EXOC, NEG., % Ass. | Corte e Religa (36/3), Fiscalização (6/1) |
| **Tabela Religação por frente** | Frente › Qtd Equipes, PROG, EXEC, EXOC, % Asser | 5 frentes, total 73 |
| **Tabela Pós Corte por frente** | Frente › Eq PROG, EXEC, EXOC, … | Tem barra de rolagem: colunas NEG. e % ficam fora da área visível |
| **Tabela Corte por cidade** | Cidade › Eq, PROG, EXEC, EXOC, NEG., % Ass. | 7 cidades |
| **Gráfico "Corte, Religação e Pós Corte por Dia"** | 3 séries por dia | Com filtro de 1 dia mostra 1 ponto: **42, 73, 78** |
| **Top 10 recursos** | Recurso › Ranking Corte, O.S Corte, Negociação tot | 8 equipes |
| **3 roscas** | Corte Aberto (Cavalete 29 / LISC 13) · Religação Aberto (Cavalete 58 / Ramal 12 / LISC 3) · Negociação (Cobrança 124 / Vistoria pós-corte 7 / Religação ≈5) | Fatia "Religação" sem número no PDF, deduzida por percentual |

### 3.3 "1. Negociações"

| Visual | Campos / medidas | Observações |
|---|---|---|
| **5 cards de quantidade** | Principal 124 · Cadastro Desdobro -- · Corte -- · Desdobro 0 · Pós Corte 8 · **Total 132** | |
| **5 cards de valor** | Principal R$ 40.382 · Desdobro Corte -- · Desdobro R$ 0 · Desdobro Pós Corte R$ 18.046 · **Total R$ 58.427** | Rótulos de quantidade e de valor não coincidem ("Pós Corte" × "Desdobro Pós Corte") |
| **Matriz "Negociações Comercial"** | Cluster Perfil › Neg., R$ (perfil › frente) | Total 131 · R$ 58.104,64 |
| **Top 10 Negociações** | Recurso › Top, Neg., R$ | 11 linhas por empate |
| **Negociação × Cidade** | Cidade › Qtd., Neg. Total | 11 cidades. Total exibido 132 |
| **"Motivo da não Execução"** | Gráfico quase vazio (1 item) | Filtrado por negociação |

### 3.4 Página 4

Tabela com **Vendas Meta = 244** e **Vendas ALL = 2.261**. Não há definição de "ALL".

---

## 4. Regras e critérios identificados

### Impressas no rodapé do relatório

1. **Exoc – "Desconsiderando negociação como Exoc."** Uma O.S. encerrada com ocorrência mas com negociação **não** entra em Exoc.
2. **Efetividade – "Considerando as negociações como Exec"**: `Exec ÷ Vistorias realizadas (Exec + Exoc)`.
3. **Assertividade de Negociação e Irregularidade**: `(Negociações ou Irregularidade) ÷ Vistorias realizadas (Exec + Exoc)`. "Quantas visitas são necessárias para efetivar a negociação."

### Deduzidas por conta

| Regra | Evidência | Confiança |
|---|---|---|
| **Perc = Exec + Exoc** | 453 + 45 = 498 | Confirmado |
| **"% Asser" (Report) = Exec ÷ Perc**, por linha | 9 linhas conferidas: 100,0 · 100,0 · 87,9 · 92,3 · 76,3 · 98,3 · 88,6 · 91,8 · 99,2 e total 91,0 | Confirmado |
| **"Qtd Eq" total não é soma** | Linhas somam 93, o total é 57 (equipes distintas: a mesma equipe faz vários serviços) | Confirmado |
| **Realizado dos cards = Exec do serviço** | 29 = "Corte de água no cavalete"; 13 = "…débito (LISC)"; 58, 3 e 12 idem para religação | Confirmado |
| **Meta de Corte = cavalete + LISC + ramal** | 1.200 + 175 + 175 = 1.550 ("1,55 Mil") | Confirmado (valores arredondados no PDF) |
| **Meta de Religação = cavalete + LISC + ramal** | 1.000 + 159 + 159 = 1.318 | Confirmado |
| **Ticket médio = valor ÷ quantidade** | 58.104,64 ÷ 131 = 443,55 (com 132 e 58.427,47 seria 442,63) | Confirmado |
| **"Neg %Ass" = Neg ÷ Perc** | 5 ÷ 85 = 5,88% (pós-corte). Total 5 ÷ 201 = 2,49%, onde 201 = 85 + 70 + 46 | Confirmado |
| **Perfis do cliente somam o total** | 71 + 52 + 5 + 3 = 131 · R$ 58.104,64 | Confirmado |
| **Soma das cidades = card "Negociação tot"** | 131 · R$ 58.104,64 (exato) | Confirmado |
| **Orçado é meta do mês; Real é do dia** | O gráfico "por dia" mostra 1 ponto (42/73/78) igual aos cards; 42 cortes contra "1,55 Mil" só faz sentido se o orçado for mensal | Inferido |
| **Frentes = prefixo do código da equipe** | RIOCERIN → Corte-Religa; RIOFSCIN → Fiscalização; RIOLTRIN → Leitura (mapeamento do projeto Pós-Corte deste repositório). RIOFSCIN-011 fez 6 cortes = linha "Fiscalização" (6) | Inferido, com forte evidência |
| **Filhos do perfil (Leitura, Corte e Religa, Pós Corte, Recadastro) = frente que negociou** | Nomes iguais aos das frentes; as equipes do Top 10 são todas RIOLTRIN (Leitura); Leitura = 114 de 131 | Inferido |
| **"Negociação Principal" = negociação em O.S. de Cobrança** | 124 = 124 | Inferido |

### Não identificados

- Fórmula de **"Efet Termos"** (43%, 34%, "Infinito", 100%).
- Regra de **"Termos"** (29 no card, 19 na tabela, linhas somam 20).
- Significado de **LISC** ("débito (LISC)"), **Desdobro**, **Rec. Cavalete / Rec. Ramal**, **Vendas ALL**.
- Filtro **"Todos"** da página de Negociações.
- O que a linha **"Dif"** calcula.

---

## 5. Conciliação: onde os números do relatório não fecham

Resultado das 32 conferências automáticas do painel: **14 conferem · 13 alertas · 5 informativas.** Cada uma é uma conta feita sobre os dados; ela aparece na aba **Conferência**.

### Alertas

| # | O que | Esperado × encontrado | Leitura |
|---|---|---|---|
| 1 | **Negociações: total exibido** | 132 (página Negociações) × 131 (soma das cidades e card) | 1 negociação a mais no total |
| 2 | **Valor negociado** | R$ 58.427,47 × R$ 58.104,64 | Diferença de **R$ 322,83**: uma negociação que está no total e em nenhuma cidade (provavelmente sem cidade) |
| 3 | **Motivos de não execução** | 66 × 45 (Exoc) | 21 a mais. Provável: inclui O.S. com negociação, que o rodapé manda tirar de Exoc |
| 4 | **"% Ass." em Corte** | Máximo 100% × 99%, 107%, 109,57%, 112,37% e 5 cidades iguais a 91,30% | A coluna divide a taxa do total pela taxa da linha. Reproduz exatamente os 5 valores. Em Religação, 123,7% = 73 ÷ 59 |
| 5 | **Termos** | 29 (card) × 19 (tabela) × 20 (soma das linhas) | Três números para o mesmo dia |
| 6 | **Pós-corte** | 78 (O.S. de vistoria pós-corte) × 61 (frentes de pós-corte) | Duas contagens com o mesmo nome |
| 7 | **"Negociação pós-corte"** | 2 (perfil) · 5 (categoria) · 7 (rosca) · 8 (card) | Quatro recortes com o mesmo rótulo |
| 8 | **Equipes** | 57 (Report) · 10 (Corte por frente) · 61 (Corte por cidade, linhas somam 67) | "Eq" muda de definição. Rio Bonito mostra 23 equipes para 1 corte |
| 9 | **Rosca de negociação por tipo** | 136 (124 + 7 + ≈5) × 131/132 | Passa do total |
| 10 | **Negociações sem perfil** | 5 (3,8%) · R$ 2.249,83 | Linha em branco na hierarquia de perfis |
| 11 | **Negociação do corte** | Card "--" × 4 no ranking de equipes de corte | Definições diferentes |
| 12 | **Coluna "Prog"** | Vazia em todo o relatório | Sem programado no dia |
| 13 | **Linha "Dif"** | 0 em todos os cards | Não é "orçado − realizado" (1,2 Mil − 29) |

### Informativas

Top 10 com 11 linhas (empate no 5º lugar) · nomes truncados (11 motivos e 2 rótulos de meta) · "Orçado" mensal é suposição · falta série diária e acumulado · "Vendas ALL" sem definição.

### O que confere (14)

Soma de Exec, de Exoc e de Perc · taxa total 91,0% · metas de corte e de religação · realizados de corte e de religação · corte por frente = por cidade = por equipe = por serviço (42) · religação por frente (73) · assertividade total 2,49% · principal + pós-corte = total · ticket médio · perfis somam o total.

---

## 6. Padronização adotada no painel

| No relatório | Neste painel | Motivo |
|---|---|---|
| "% Asser", "Efetividade", "% Ass." | **Taxa de execução** = Exec ÷ (Exec + Exoc) | Três nomes e duas contas para a mesma ideia |
| Perc | **O.S. percorridas** | |
| "Dif" | **Atingimento da meta diária de referência** = Real ÷ (Orçado ÷ dias úteis) | "Dif" não informa nada |
| "Pós Corte" (dois sentidos) | **O.S. de vistoria pós-corte** × **frente pós-corte** | Evita somar coisas diferentes |
| "Negociação" (5 sentidos) | **Frente que negociou** × **tipo de O.S. onde negociou** | Idem |
| "Eq" | **Equipes (distintas)**, nunca somadas entre linhas | |
| R$ de negociação | **Valor negociado (débito)**, não "arrecadado" | O PDF não prova pagamento |

**Premissa editável:** o orçado é dividido pelos **dias úteis** (padrão 22 = dias de semana de set/2026, sem feriados) para comparar com o dia. Se o orçado for diário, use 1 na aba Metas.

---

## 7. Decisões de design do painel

| Aba | Pergunta que responde |
|---|---|
| **Resumo do dia** | Como foi o dia? Onde estão os problemas? |
| **Corte e religação** | Quem executou o quê, onde e com que qualidade? |
| **Negociações** | Quanto foi negociado, com quem, onde e por qual equipe? |
| **Metas** | Estamos no ritmo? Quais serviços nem têm meta? |
| **Conferência** | Posso confiar nesse número? |
| **Dicionário** | O que cada número significa e de onde veio? |

Escolhas de visualização (guia de dataviz):

- **Cartões e número grande** para valores únicos; nada de gráfico de uma barra ou rosca para comparar valores próximos.
- **Barras horizontais dentro de tabelas**: o valor está sempre escrito (a tabela é o "gêmeo" acessível), o que também compensa o contraste do verde-água no tema claro.
- **Cor pelo papel**: azul = medida principal, laranja = ocorrência, verde-água = valor negociado. Situação (bom / atenção / crítico) sempre com **ícone + texto**, nunca só cor. Paleta validada para daltonismo nos temas claro e escuro.
- **Um filtro só, acima do conteúdo**: Dia e Cidade em foco. O relatório não traz cruzamentos (cidade × frente × serviço), então a cidade **destaca** as linhas e abre uma ficha, em vez de fingir um filtro que recalcularia tudo.
- Tema claro/escuro, impressão/PDF, cópia de resumo em texto, teclado, celular.

---

## 8. Limites desta versão

- **Um dia, sem acumulado.** Não há atingimento mensal, ritmo necessário nem projeção de fechamento. O painel mostra o que precisaria ser carregado (aba Metas).
- **Sem o modelo.** Tabelas, relacionamentos, medidas DAX e Power Query não foram vistos. As "fórmulas" da seção 4 são deduzidas dos números.
- **Nomes truncados** pelo PDF (motivos, 2 metas). Os rótulos "Instalação/Substituição de hidrômetro" foram completados por dedução e marcados com `*`.
- Este painel **não substitui** o Power BI: é uma visão de leitura para decisão.

## 9. Como obter o restante (sem enviar dados)

O `.pbix` é grande porque leva os dados. Duas saídas:

1. **Power BI Desktop › Arquivo › Exportar › Modelo do Power BI (`.pbit`).** O `.pbit` **não contém dados**: só Power Query, relacionamentos, medidas DAX e páginas. Costuma ter poucos MB e permite documentar tudo com certeza.
2. **Tabular Editor / DAX Studio**: exportar a lista de medidas (nome, expressão DAX, formato) e o dicionário de colunas.

Com qualquer um dos dois, o painel passa a ser alimentado pela série diária real (Fase 2 do prompt).

## 10. Formato dos dados (`dados/AAAA-MM-DD.json`)

O painel é dirigido por dados: o JSON embutido pode ser trocado, ou outro dia pode ser carregado pelo botão **Importar dados** (aceita um objeto ou uma lista de dias; validado antes de entrar). Blocos principais:

| Bloco | Conteúdo |
|---|---|
| `referencia` | data, mês, exportado_em, fonte, observação |
| `premissas` | `dias_uteis`, `orcado_e_mensal`, `limiares` (taxa e meta) |
| `metas[]` | id, grupo, rótulo, orçado, real, serviço vinculado |
| `servicos[]` / `servicos_total` | nome, família, equipes, exec, exoc |
| `categorias[]` | O.S. exec, negociações, termos |
| `motivos_nao_execucao[]` | motivo, quantidade |
| `frentes.{corte,religacao,pos_corte}` | linhas e total |
| `corte_por_cidade`, `ranking_corte` | cidade / equipe |
| `negociacoes.*` | KPIs, valores, por tipo de O.S., por cidade, top equipes, perfis › frentes |
| `totais_relatorio` | totais que o relatório exibe (para conferir) |

Para gerar o HTML com outro JSON: `node mensal-comercial/build.mjs mensal-comercial/dados/OUTRO.json`.
