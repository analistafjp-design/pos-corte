---
name: pos-corte-bases-campo
description: Como funciona a aba Bases de campo do painel Pós-Corte Interior (subir base, cruzamento por matrícula, data da base, aba Pós Corte, linhas repetidas, o que falta, Excel) e como diagnosticar uma base que mostra 0% percorrido ou total diferente do esperado.
---

# Bases de campo

São as bases geradas pela estratégia que saem para as equipes. O painel
cruza cada uma com as atividades já carregadas (Exec/Exoc) e calcula os
indicadores dela.

## Regras (não mude sem o usuário pedir)

- **Cruzamento pela Matrícula**, sempre só com os serviços de pós-corte
  (110010/11/12, 210010/11/12, 310010/11/12).
- A coluna de matrícula pode se chamar `Matrícula` ou `NUM_LIGACAO` (e
  variações como "Número da Ligação").
- **Aba:** com várias abas, o painel prefere a de "Pós Corte", depois a
  chamada "base", depois a primeira que tenha coluna de matrícula. O cartão
  mostra a aba usada. Já houve erro por ler a primeira aba (Unijato, serviço
  204005, que não é pós-corte).
- **Data da base:** vem do nome do arquivo (`Base 25.09` vira 25/09 do ano em
  curso) e é editável no cartão. Com data, só conta atividade a partir dela;
  limpando o campo, vale qualquer data.
- **Total da base** = matrículas distintas. Linhas repetidas (mesmo imóvel
  cortado mais de uma vez) contam uma só vez, e o cartão mostra "N matrículas
  distintas de M linhas (K repetidas)". Linhas sem matrícula contam como
  faltantes.
- De cada matrícula vale a atividade mais recente.
- Cada base mostra: total, data que subiu, percorrido, faltam, Exec, Exoc,
  termos, assertividade, negociações, efetividade, total de equipes e o card
  de recortes (total, % sobre o Exec e tipos). Sem card de Sem Desdobro.
- "Baixar o que falta (Excel)" exporta as linhas não percorridas com todas as
  colunas originais, mais uma aba de resumo.
- As bases ficam no IndexedDB do navegador, organizadas em pastas por mês e
  pela data em que subiram; "Limpar dados gravados" não as apaga.
- Base já subida **não se recalcula a leitura**: se a aba/coluna lida estava
  errada, o usuário precisa excluir e subir de novo.

## Diagnóstico quando dá 0% ou número estranho

1. Qual aba foi lida? (cartão: `aba "..."`.) Se não for a de pós-corte, a
   correção é a escolha da aba em `readBaseCampo` (`src/core.js`).
2. A coluna de matrícula foi reconhecida? Os nomes aceitos estão em
   `BASE_MATRICULA`.
3. A data da base está filtrando demais? Limpe o campo e compare.
4. O realizado foi carregado? Sem a pasta conectada tudo aparece como falta.
5. Confirme com contagem independente (skill `pos-corte-conferir-numeros`).
6. Se a matrícula tem visitas só de outro serviço ou status ignorado, ela
   realmente não conta.
