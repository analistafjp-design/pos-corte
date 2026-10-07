---
name: pos-corte-regras
description: Regras de negócio e fórmulas do painel Pós-Corte Interior (Exec, Exoc, percorrido, termos, negociações, assertividade, efetividade, recortes, categoria, equipes, frentes). Use antes de criar, alterar ou explicar qualquer indicador, card ou tabela do painel.
---

# Regras dos indicadores — Pós-Corte Interior

Os indicadores sempre saem dos registros importados; nunca de valores fixos.
Em dúvida, confira em `src/core.js` (`classify`, `summarize`, `agrupar`) e em
`Prompt_Projeto_Pos_Corte.md`.

## O que entra

- **Status:** só contam `Finalizada` (Exec) e `Encerrada com Ocorrência`
  (Exoc). Os demais status são ignorados. Versão mais nova de uma atividade
  pode anular a mais velha.
- **Serviços:** só entram atividades cujo `Código/Descrição` começa com
  110010, 110011, 110012, 210010, 210011, 210012, 310010, 310011 ou 310012.
- **Colunas lidas:** só as usadas (19 obrigatórias/principais + 2 opcionais de
  recorte). Coluna ausente = indicador **indisponível**, nunca zero silencioso.
- **Não somar** as abas "Pós Corte com Termo" e "Pós Corte com Negociação" à
  Base: já estão contidas nela.

## Fórmulas

| Indicador | Regra |
|---|---|
| Percorrido | Exec + Exoc |
| Total de Exec / Exoc | Status Finalizada / Encerrada com Ocorrência |
| Termos aplicados | `Serviço adicionais resposta` contém o código completo 110013 (Serviços) ou 310013 (VCG), sem dígito colado antes ou depois; uma atividade conta uma vez |
| Assertividade | Termos ÷ Exec |
| Negociações | `Negociou O Débito?` = Sim |
| Efetividade | Negociações ÷ Exec |
| Sem Desdobro | Negociação com `Serviço adicionais resposta` vazio (subconjunto das negociações). **Os cards de Sem Desdobro foram retirados do painel a pedido do usuário**; não recrie cards. |
| Débito informado | Soma de `Valor Total dos Débitos` das negociações. **Nunca chamar de "arrecadação"** |
| Valor negociado (% do débito) | O valor é o débito informado acima; o % é valor negociado ÷ soma de `Valor Total dos Débitos` de **todas** as atividades do filtro (negociadas ou não). Fica no bloco "Valores negociados" da Visão geral |
| Economias recuperadas | Matrículas **distintas** com negociação (chave normalizada: sem espaços e zeros à esquerda; negociação sem matrícula não conta). % = economias ÷ Exec. Sem a coluna `Matrícula` aparece como indisponível. Definição dada pelo usuário |
| Equipes que trabalharam | Recursos distintos com atividade no dia ou período |
| Recorte | `Fez o corte novamente` = Sim; o tipo vem de `Onde Foi Feito O Corte?` (Ramal, Cavalete Simples, Rede). % por tipo = tipo ÷ total de recortes; % geral = Total recorte ÷ Exec |
| Categoria | Coluna `Categoria`; vazia = "(sem categoria)". Ordenar pelo maior percorrido |
| Frente | Prefixo do `Recurso` contra o mapeamento Nomenclatura → Frente; **o prefixo mais longo vence**; sem correspondência = "Não mapeada" |

## Cuidados

- Produtividade (percorrido ÷ equipe-dias) **não aparece no painel** por
  pedido do usuário; o título é "Resultados por cidade".
- Arquivo marcado "só completa" (complementar) tem prioridade mais baixa e é
  descartado em duplicidade.
- Idioma da interface e das respostas: português do Brasil.
