---
name: pos-corte-conferir-numeros
description: Como conferir os números do painel Pós-Corte Interior contra a planilha real com uma contagem independente em Python (openpyxl) e com o próprio painel no Chromium (Playwright). Use quando o usuário duvidar de um número, ao criar um indicador novo ou ao validar uma base de campo.
---

# Conferir números

Faça sempre duas medidas separadas e compare: uma **independente** (Python) e
a do **painel**. Só diga que "bate" quando os dois forem calculados e iguais.

## 1. Contagem independente (Python)

```python
import openpyxl, collections
wb = openpyxl.load_workbook(caminho, read_only=True)
ws = wb['Base']                       # a aba da base completa
it = ws.iter_rows(values_only=True)
h = [str(c or '').strip() for c in next(it)]
ix = {n: i for i, n in enumerate(h)}
dados = list(it)
print(collections.Counter(r[ix['Status da Atividade']] for r in dados))
```

- Aplique as mesmas regras do painel (status contados, serviços de pós-corte;
  veja a skill `pos-corte-regras`). Nomes de aba e de cabeçalho podem ter
  espaço no fim: use `.strip()`.
- Para bases de campo, use um `set` das matrículas (`NUM_LIGACAO` ou
  `Matrícula`) e cruze com a coluna `Matrícula` do realizado; aplique a data
  da base se houver.

## 2. Painel no navegador (Playwright)

- Use `/opt/node22/lib/node_modules/playwright` (Chromium já instalado).
- Abra `file:///.../Acompanhamento_Pos_Corte.html`, carregue a planilha com
  `page.setInputFiles('#inp-files', [...])` e espere `.kpi-value`.
- Leia os valores (`[data-fk="kpi:exec"] .kpi-value`, `.card-recorte`,
  `.card-categorias tbody tr`, `.basecard [data-bk]`) e compare.
- Para uma base de campo: `#nav-tabs button[data-view=bases]` e
  `page.setInputFiles('#inp-bases', [...])`.

## Referências já validadas (planilha de referência do usuário)

- Base completa: 8.136 atividades, 7.461 Exec, 675 Exoc, 389 termos,
  230 negociações.
- Recortes: 4.012 (3.700 ramal, 310 cavalete simples, 2 rede), 53,8% do Exec.
- Categorias: R-RESIDENCIAL 6.702; RE-SOCIAL 846; C-COMERCIAL 300;
  CP-PEQ. COMERCIO 181; P-PUBLICA 48; I-INDUSTRIAL 35; RS-SOCIAL ESPECIAL 24.
- Os números da pasta real do usuário mudam com os arquivos carregados e com
  o arquivo-base complementar; não os trate como fixos.

## Cuidados

- Nunca copie dados reais (nomes, matrículas, débitos) para o repositório ou
  para testes; guarde tudo em arquivos temporários fora do projeto.
- Diferença entre painel e planilha costuma vir de: status ignorados, serviços
  fora dos nove códigos, duplicatas entre arquivos, arquivo complementar ou
  data da base.
