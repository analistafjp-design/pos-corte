# Projeto — Pós-Corte Interior

**Responsável:** Fábio Passos / AnalistaFJP  
**Versão do documento:** 30/09/2026 (revisão 3)  
**Entrega:** painel HTML independente, documentação e prompt para continuidade.

## 1. Objetivo

Acompanhar as visitas de Pós Corte, diferenciando atividades finalizadas (Exec), encerradas com ocorrência (Exoc), negociações e irregularidades identificadas por termos aplicados. Permitir análise por período, cidade, recurso/equipe e frente de serviço, com atualização por arquivos Excel em uma pasta sincronizada do OneDrive.

O foco são as **negociações** e os **termos aplicados** vindos da O.S. mãe de pós-corte.

## 2. Arquivos desta entrega

| Arquivo | Finalidade |
|---|---|
| `Acompanhamento_Pos_Corte.html` | Painel completo, com estilos, scripts, leitor de Excel e mapeamento padrão de frentes incorporados. **Não contém registros da base.** |
| `docs/index.html` | Cópia idêntica do painel para publicar no GitHub Pages (ver seção 13). Gerada por `node build.mjs`. |
| `Projeto_Pos_Corte.md` | Regras, estrutura, funcionamento, validações e limites desta versão. |
| `Prompt_Projeto_Pos_Corte.md` | Prompt completo para continuar o desenvolvimento em outra conversa ou ferramenta. |
| `README.md` | Como gerar o HTML e rodar os testes. |
| `src/`, `build.mjs` | Código-fonte (`core.js` = leitor/regras; `app.js` = interface) e o script que gera o HTML único. |
| `tests/`, `tools/make_fixtures.py` | Testes automatizados e o gerador de planilhas **sintéticas** de teste. |

O HTML abre por duplo clique no Chrome ou no Edge. Não depende de Python, Node, servidor, internet ou arquivos auxiliares. Não faz nenhuma requisição de rede: todo o processamento acontece no computador.

### Decisão sobre os dados

A base real tem nomes de solicitantes, matrículas e débitos. Por isso **o HTML não traz a base incorporada** e nenhum arquivo `.xlsx`/`.csv` é versionado (o `.gitignore` bloqueia). Os dados entram somente pela pasta do OneDrive (ou por importação manual). Para não reler tudo a cada abertura, o painel **grava no próprio navegador, neste computador (IndexedDB), o resultado de cada arquivo já lido, só com os campos usados**; isso nunca é enviado a lugar nenhum e pode ser apagado em "Base e regras → Limpar dados gravados" (ou limpando os dados do site no navegador). O único conteúdo de negócio embutido é o mapeamento padrão **Nomenclatura → Frente** (52 linhas, sem dados pessoais), copiado da aba "Frente de Serviço" da planilha de amostra de 29/09/2026.

## 3. Como usar

1. Abra `Acompanhamento_Pos_Corte.html` no Chrome ou no Edge.
2. Clique em **Conectar pasta** e escolha a pasta sincronizada do OneDrive que recebe os arquivos `.xlsx` (as subpastas também são lidas). Ou use **Importar Excel** para escolher um ou vários arquivos.
3. Use **Atualizar** quando houver arquivos novos. Só arquivos **novos ou modificados** (nome + tamanho + data de modificação) são lidos do disco; os demais vêm do que já foi lido, inclusive depois de recarregar a página. Com acesso contínuo à pasta, o painel também relê sozinho a cada 60 s enquanto a página está visível.
4. Filtre por data inicial/final, cidade, frente e equipe; escolha o indicador dos gráficos.
5. Clique em um cartão para abrir o analítico daquele indicador; clique em um mês ou em um item de ranking para filtrar (clicar de novo limpa).
6. No **Analítico**, busque por matrícula, protocolo/O.S., ID ou nome e exporte o resultado em CSV (todas as linhas filtradas).
7. Em **Base e regras**, confira arquivos lidos, conferências automáticas, colunas reconhecidas, frentes e regras.

### Funcionamento da pasta

- **Acesso contínuo** (Chrome/Edge com a API de pastas): o painel guarda o *acesso* à última pasta (não os dados). Ao reabrir, recarrega sozinho se a permissão ainda valer; caso contrário mostra o botão **Reconectar pasta**. A leitura a cada 60 s só ocorre com a página visível e a permissão concedida; se a permissão expirar, aparece um aviso e a base atual é mantida.
- **Seleção manual** (navegadores sem a API): "Conectar pasta" abre o seletor de pasta e "Atualizar" pede a pasta de novo. Não há monitoramento automático nesse modo.
- Arquivos temporários `~$` são ignorados; `.xls`, `.xlsb` e `.xlsm` são listados como ignorados (formato não suportado).
- **Leitura incremental:** só os arquivos novos ou alterados (nome + tamanho + data de modificação) são lidos do arquivo; os demais reaproveitam a leitura anterior (memória da página ou o que ficou gravado no navegador). A mensagem ao final informa "lidos agora" e "reaproveitados". Trocar a versão das regras ou cadastrar nome alternativo de coluna invalida o que estava gravado.
- **Pasta grande:** mais de 40 arquivos para ler, ou mais de 800 MB, exigem confirmação ("Ler mesmo assim") antes da leitura, inclusive ao reabrir a última pasta.
- O painel **não grava** no OneDrive, não altera os arquivos, não atualiza com a página fechada e não guarda dados dentro do HTML. Ao reabrir, ele recarrega a última pasta (se a permissão valer) reaproveitando o que já foi lido.
- **OneDrive:** deixe os arquivos disponíveis neste computador (opção "Sempre manter neste dispositivo"). Arquivos apenas na nuvem ou ainda sincronizando podem falhar e aparecem pelo nome com o motivo.

## 4. Fonte analisada (planilha de amostra)

Arquivo: **Acompanhamento - Pós Corte.xlsx** (12,8 MB; a aba Base tem ~96 MB de XML descompactado).

| Aba | Registros sem cabeçalho | Colunas | Uso |
|---|---:|---:|---|
| Base | 8.136 | 296 (A:KJ) | Fonte principal das contagens. |
| Pós Corte com Termo | 389 | 296 | Recorte da Base, só para conferência. |
| Pós Corte com Negociação | 230 | 296 | Recorte da Base, só para conferência. |
| Frente de Serviço | 52 | 2 | Mapeamento Nomenclatura → Frente. |

**Período da amostra:** 02/01/2026 a 28/09/2026.

Verificado na amostra: as linhas das abas de Termos e Negociações são exatamente as que as regras calculam sobre a Base (mesmos IDs). Elas **não são somadas à Base**; o painel só as compara (seção "Base e regras"). Para arquivos futuros a conciliação é apenas informativa.

### Como os dados aparecem na amostra (detalhes que o leitor trata)

- Células vazias vêm como texto vazio; `Negociou O Débito?` traz `SIM` (230), `NÃO` (1) ou vazio.
- `Valor Total dos Débitos` é **texto**: `R$ 1049,6`, `R$ 1634,79`, `R$ 101640,48`, `R$ ,03`, `R$ ` (54 sem valor). Sem separador de milhar e com uma ou duas casas.
- `Data`, `Início do SLA` e `Fim do SLA` são datas do Excel com formato de data; o leitor usa o estilo da célula para saber que são datas.
- `Serviço adicionais resposta` traz textos como `110013 - IRREGULARIDADE IDENTIFICADA;` ou vários serviços separados por `;`.
- Não há cabeçalhos repetidos entre as 19 colunas usadas.

## 5. Campos mantidos no painel

Só estas 19 colunas são lidas e gravadas; as outras (277 na amostra) **nem são carregadas**. A auditoria de preenchimento das demais colunas foi removida a pedido.

| Campo | Uso principal |
|---|---|
| Recurso | Equipe, filtros e classificação da frente. |
| Cód. Protocolo Origem | Identificação da O.S./protocolo, busca e chave alternativa. |
| ID da Atividade | Chave preferencial de deduplicação. |
| Matrícula | Identificação, busca e chave alternativa. |
| Código/Descrição | Serviço de origem e chave alternativa. |
| Data | Período, mês e filtros. |
| Status da Atividade | Exec e Exoc. |
| Nome do Solicitante | Busca e detalhamento. |
| Cidade | Filtro e ranking. |
| Início do SLA / Fim do SLA | Consulta no analítico. |
| Tipo do Corte Realizado | Contexto da visita. |
| Qual a situação do imóvel? | Resposta de campo. |
| Irregularidade Encontrada? | Consulta; **não** determina o indicador de termos. |
| Valor Total dos Débitos | Débito informado. |
| Negociou O Débito? | Evidência de negociação. |
| Categoria | Consulta. |
| Situação Do Imóvel | Campo distinto de "Qual a situação do imóvel?"; não são unidos. |
| Serviço adicionais resposta | Evidência de termo aplicado e de "Sem Desdobro". |

A comparação de cabeçalhos ignora maiúsculas, acentos e pontuação.

## 6. Regras dos indicadores

| Indicador | Regra |
|---|---|
| Percorrido (= Atividades) | Exec + Exoc: registros da aba principal **dos serviços e status considerados** (abaixo), após deduplicação e filtros. |
| Assertividade | Termos aplicados ÷ Exec. Sem Exec no filtro, mostra "—". |
| Efetividade | Negociações ÷ Exec. Sem Exec no filtro, mostra "—". |
| Equipes que trabalharam | Recursos distintos com ao menos uma atividade no dia ou no período filtrado. Também mostra a média de equipes por dia e os dias com atividade. |
| Produtividade por cidade | Percorrido ÷ equipe-dias, isto é, visitas por equipe por dia trabalhado (uma equipe trabalhando um dia = 1 equipe-dia). É uma definição adotada por mim, a confirmar. |
| Finalizadas — Exec | `Status da Atividade = Finalizada`. |
| Encerradas com Ocorrência — Exoc | `Status da Atividade = Encerrada com Ocorrência`. |
| Negociações | `Negociou O Débito? = Sim` (espaços nas pontas e caixa ignorados). Códigos, texto livre, valor ou desdobro não criam negociação. |
| Negociações Sem Desdobro | Negociação com `Serviço adicionais resposta` vazio, nulo ou só espaços. **Subconjunto** das negociações (não somar). |
| Termos aplicados (irregularidade identificada) | `Serviço adicionais resposta` contém o código completo `110013` (Serviços) ou `310013` (VCG) em qualquer posição. |
| Débito das negociações (valor negociado) | Soma de `Valor Total dos Débitos` das negociações no filtro. É o **débito informado**; não é arrecadação nem valor pago. O % mostrado ao lado é esse valor ÷ a soma de `Valor Total dos Débitos` de todas as atividades do filtro (débito total informado). |
| Economias recuperadas | Soma do `TOTAL_ECO` do arquivo **Cadastro** (cruzado pela matrícula, coluna `NUM_LIGACAO`) das matrículas **distintas** com negociação no filtro: cada matrícula conta uma vez (zeros à esquerda e espaços ignorados). Matrícula que aparece **mais de uma vez no Cadastro é desconsiderada**; a que não está no Cadastro (ou está sem `TOTAL_ECO`) não entra; negociação sem matrícula não conta. O % é economias recuperadas ÷ total de Exec. Definição indicada pelo usuário. Sem o arquivo Cadastro ou sem a coluna `Matrícula`, o indicador aparece como indisponível. |

### Status considerados

**Só entram atividades Finalizada (Exec) ou Encerrada com Ocorrência (Exoc).** Cancelada, Paralisada, Pendente, Iniciada, Em Rota etc. não contam (Atividades = Exec + Exoc). Decisão de 30/09/2026: a pasta de 272 arquivos trazia 7.936 atividades desses outros status que a base de referência não tem. Como a deduplicação usa a versão mais nova, uma atividade cujo arquivo mais recente a traz como Cancelada (por exemplo) **deixa de contar**, mesmo que um arquivo antigo a traga como Finalizada; o painel informa quantas foram anuladas. Sem a coluna `Status da Atividade` o filtro não pode ser aplicado (o arquivo entra inteiro, com aviso, e Exec/Exoc ficam indisponíveis).

### Serviços considerados

Só entram atividades cujo `Código/Descrição` **começa** com um destes códigos (os demais não são carregados nem gravados; a quantidade ignorada aparece por arquivo em "Base e regras"):

| Código | Códigos | Códigos |
|---|---|---|
| 110010 | 210010 | 310010 |
| 110011 | 210011 | 310011 |
| 110012 | 210012 | 310012 |

O código precisa ter exatamente 6 dígitos no início (`1100100-...` não vale). Linhas sem código também ficam de fora. Se o arquivo não tiver a coluna `Código/Descrição`, o filtro não pode ser aplicado: o arquivo é carregado inteiro e o painel avisa. Na amostra, todas as 8.136 linhas já estão nesses códigos, por isso os números não mudam. Observação: na planilha, 110011 é "INTERMEDIÁRIO" e 110012 é "AVANÇADO" (o quadro enviado lista o contrário); o painel usa só o código, não o nome.

Regras essenciais:

- Limites numéricos: `1100130`, `9310013` etc. não contam.
- Cada atividade conta uma vez em Termos, mesmo com os dois códigos (o painel também mostra quantas têm 110013 e quantas têm 310013).
- `Irregularidade Encontrada? = Sim` isolado não conta como termo (na amostra são 362 "SIM"; 3 delas sem código e 30 atividades com código sem "SIM").
- Negociação e termo podem ocorrer na mesma atividade (3 na amostra); não some os dois para obter visitas.
- Não há filtro adicional de status para negociações e termos. Qualquer mudança exige decisão explícita.
- Matrículas repetidas com IDs distintos são visitas diferentes e são preservadas (1.618 matrículas repetidas na amostra).

## 7. Arquivos "não tão detalhados"

O painel aceita arquivos com menos colunas, outra estrutura de abas e sem as abas de apoio:

- **Aba principal:** usa "Base"; se não existir, usa a **única** aba cujo cabeçalho tenha pelo menos 4 das 19 colunas esperadas (aviso registrado). Com mais de uma candidata, recusa e pede para renomear a principal para "Base".
- **Cabeçalho** em qualquer uma das 30 primeiras linhas (títulos acima são ignorados).
- **Colunas ausentes:** o arquivo é aceito se existir ao menos uma das colunas de indicador (`Status da Atividade`, `Negociou O Débito?`, `Serviço adicionais resposta`). O indicador que depende da coluna ausente fica **indisponível** (marcado nos cartões e no aviso), nunca como zero silencioso. Sem `Serviço adicionais resposta`, ninguém é classificado como "Sem Desdobro". Sem `Data`, os registros ficam "Sem data"; sem `Recurso`, a frente é "Não mapeada".
- **Só o necessário é lido:** as colunas fora das 19 são ignoradas já na leitura do XML (mais rápido e com menos memória).
- **Nomes de coluna diferentes:** em "Base e regras" é possível cadastrar nomes alternativos (ex.: "Situação" para "Status da Atividade"); ficam salvos no navegador e todos os arquivos são relidos.
- **Sem aba de frentes:** vale o mapeamento já carregado (padrão incorporado ou de arquivos anteriores).
- **Sem `ID da Atividade`:** usa a chave alternativa. Se algum dos cinco campos da chave estiver vazio, a linha **não é unida a nenhuma outra**, e o painel avisa quantas linhas estão nessa condição. Nesse caso, arquivos acumulados que se sobrepõem **duplicam** contagens; prefira arquivos com o ID.
- Arquivos que contêm só um recorte (ex.: só negociações) são contados como atividades; Atividades, Exec e Exoc só ficam completos com a Base completa na pasta.

Testado com versões da própria amostra: (a) só as 19 colunas em uma aba "Dados"; (b) só 7 colunas, com título antes do cabeçalho, aba "Resumo" e sem ID. Ambas reproduzem exatamente os mesmos números da Base completa.

## 8. Deduplicação e frentes

### Vários arquivos na mesma pasta

1. Ignorar arquivos temporários `~$`.
2. Ordenar por data de modificação (do mais antigo ao mais recente).
3. Chave principal: `ID da Atividade`; sem ID: `Cód. Protocolo Origem + Matrícula + Código/Descrição + Data + Recurso`.
4. Chave repetida: prevalece o registro do arquivo modificado mais recentemente. **Exceção — arquivo complementar:** em "Base e regras → Fonte e arquivos lidos" cada arquivo tem a opção "só completa". Um arquivo assim (normalmente a base completa de referência) só preenche o que não existe nos demais; em duplicidade a linha dele é descartada, qualquer que seja a data de modificação. A marcação é guardada no navegador pelo nome do arquivo e reprocessa sem reler os arquivos.
5. A quantidade de duplicatas removidas é informada.

A data de modificação é um critério operacional, não garante que o conteúdo seja o mais atual. Evite misturar snapshots conflitantes. Um registro que some de um snapshot novo continua contado se estiver em um mais antigo que permanece na pasta.

Se um arquivo falha em uma leitura (bloqueado, corrompido, sincronizando), ele fica **fora** daquela consolidação e o painel avisa (importação parcial); se nenhum arquivo for válido, a base anterior é mantida.

### Classificação da frente

- `Nomenclatura` é o prefixo do campo `Recurso`; `Frente` é o nome exibido. Comparação sem diferenciar caixa; se mais de um prefixo casar, vale o mais longo.
- Sem correspondência: **Não mapeada** (contagem disponível em "Base e regras", com os recursos envolvidos).
- Mapeamento importado para a mesma nomenclatura substitui o anterior; ausência da aba mantém o que já estava carregado.
- **Na amostra, 430 atividades ficam "Não mapeada"**: os recursos `RIOGCLNT-*` (299) e `RIOCOBB1-*` (131) não têm Nomenclatura na aba Frente de Serviço. O painel não inventa frente para eles; para classificá-los, inclua a Nomenclatura na aba do arquivo.

Cidades e equipes são unificadas por caixa/acento/espaços (mantendo a grafia mais frequente). Todas as cidades da fonte são mantidas, sem restrição de municípios.

## 9. Resultados de referência

Calculados pelo painel a partir da planilha de amostra (não são valores fixos; qualquer outra base gera outros números):

| Indicador | Resultado |
|---|---:|
| Atividades | 8.136 |
| Exec | 7.461 |
| Exoc | 675 |
| Negociações | 230 |
| Termos aplicados | 389 (382 com 110013 · 7 com 310013) |
| Negociações Sem Desdobro | 2 |
| Débito informado nas negociações | R$ 252.027,39 |

Exec + Exoc = 8.136 porque essa base só tem esses dois status; em outras bases o painel evidencia os demais.

## 10. Interface

- Navegação: **Visão geral**, **Analítico**, **Base e regras** (menu lateral no computador; barra inferior no celular).
- Cartões em destaque, em dois grupos: **Percorrido, Total de Exec, Total de Exoc, Equipes que trabalharam** e **Termos, Assertividade, Negociações, Efetividade, Sem Desdobro**, só com rótulo e valor (sem legendas). Assertividade, Efetividade e Equipes são informativos; os demais abrem o Analítico.
- **Produtividade por cidade**: tabela com percorrido, Exec, Exoc, termos, assertividade, negociações, efetividade, equipes, equipe-dias e produtividade; clicar na cidade filtra.
- **Exportar Excel**: baixa um `.xlsx` (sem bibliotecas externas) com as planilhas Resumo, Mensal, Produtividade por cidade, Equipes, Frentes e Registros do filtro atual. Textos iniciados por `=`, `+`, `-` ou `@` ficam como texto, não como fórmula.
- **Exportar PDF**: abre a impressão do navegador com o layout da Visão geral em A4 paisagem (cerca de 3 páginas); escolha "Salvar como PDF". O PDF não é gerado por biblioteca própria.
- Abas: **Visão geral**, **Analítico** (auditoria linha a linha, busca e CSV) e **Arquivos e regras** (arquivos lidos, prioridade "só completa", conferências, frentes sem mapeamento e, recolhidos, colunas/nomes alternativos e regras).
- **Valores negociados** logo abaixo de "Recortes realizados", em largura total: dois quadros, **Valor negociado** (débito informado das negociações) e **Economias recuperadas** (matrículas distintas que negociaram), cada um em valor e % (com aviso quando há negociação sem valor informado ou sem matrícula). Depois, gráfico separado de negociações e termos com a mesma escala, resultados por cidade, pós-corte por categoria e rankings por frente e equipe ("Mostrar todos"). A produção mensal, a distribuição dos status e a tabela de valores mensais saíram da Visão geral; a planilha Mensal do Excel continua trazendo os valores por mês.
- Cores fixas por indicador (paleta validada quanto a daltonismo); valores sempre em texto ao lado das barras; dica com os valores ao passar o mouse ou focar por teclado.
- Filtros valem para cartões, gráficos, analítico e exportação; o foco do teclado é mantido ao filtrar.
- Analítico com 50 linhas por página, detalhe expansível com os 19 campos e exportação de **todas** as linhas filtradas.
- CSV em UTF-8 com BOM, separador `;`, com proteção contra fórmulas (valores iniciados por `=`, `+`, `-`, `@` recebem apóstrofo).

## 11. Estrutura técnica

- `src/core.js`: leitor de `.xlsx` (ZIP por `Blob.slice` + `DecompressionStream`, XML **incremental estilo SAX**, sem árvore DOM), regras, deduplicação, frentes, filtros/agregações e CSV. Roda no navegador e no Node.
- `src/app.js`, `src/styles.css`, `src/template.html`: interface. Todo texto de dados entra por `textContent` (sem `innerHTML` com dados).
- `build.mjs`: gera `Acompanhamento_Pos_Corte.html` (~155 KB).
- O leitor resolve os caminhos internos pelos relacionamentos do próprio arquivo, lê `sharedStrings`, estilos (para identificar datas) e `workbookPr/date1904`; usa o resultado gravado das fórmulas.
- **Cadastro de economias:** arquivo `.xlsx` com "cadastro" no nome (na pasta ou nas subpastas), aba `Export`, colunas `NUM_LIGACAO` (matrícula) e `TOTAL_ECO`. É lido à parte, só nessas duas colunas (nome, endereço etc. nem são lidos), e guarda apenas matrícula e total. Havendo mais de um, vale o mais recente. Matrícula que aparece mais de uma vez no arquivo é desconsiderada. A planilha real nunca entra no repositório.
- Formatos: `.xlsx` válido, sem senha. **Não** lê `.xls`, `.xlsb`, arquivos com senha nem ZIP64, e não recalcula fórmulas. Mensagens próprias para cada caso e para arquivo vazio, truncado ou sem estrutura de planilha.
- Desempenho medido: a amostra (12,8 MB; 96 MB de XML) carrega em ~2,6 s no Node e ~4 s no Chromium, com a interface respondendo. Cada arquivo lido retém cerca de 9 MB de memória (textos são copiados para não prender pedaços do XML).
- Gravação: `IndexedDB` (`poscorte`), loja `arquivos` (resultado por arquivo, com chave = versão das regras + nomes alternativos + caminho + tamanho + data) e loja `kv` (acesso à última pasta). Entradas de arquivos que saíram da pasta são apagadas.

## 12. Verificação realizada

| O quê | Como | Resultado |
|---|---|---|
| Regras (termos, negociação, Sem Desdobro, Exec/Exoc), serviços dos 9 códigos, valores, datas, XML em pedaços de 1 caractere, frentes, deduplicação, filtros/rankings, CSV | 34 testes automatizados no Node (`npm run test:core`; 1 deles é opcional e usa a planilha real) | Passam |
| Planilha de amostra real | Comparada a um cálculo **independente** em Python/openpyxl: totais, frente por frente, meses, débito e conciliação com as abas de Termos/Negociações | Idênticos |
| Planilhas sintéticas de 296 colunas × 8.136 linhas (xlsxwriter com textos compartilhados e inline; openpyxl; datas 1900/1904/texto) | Node | Reproduzem 8.136 / 7.461 / 675 / 230 / 389 / 2 |
| Arquivos inválidos: vazio, texto disfarçado, `.xls`/senha (OLE2), truncado, `.xlsb`, ZIP sem planilha, sem partes, sem cabeçalho, abas ambíguas, sem colunas de indicador, ZIP64 | Node e interface | Mensagem clara, sem virar base vazia |
| Leitura incremental: Atualizar sem mudanças (0 arquivos lidos), arquivo novo (1), arquivo alterado (1), recarga da página (0, tudo reaproveitado do gravado), limpar dados gravados, pasta com mais de 40 arquivos | Chromium (Playwright) | Passam |
| Interface: filtros, mês/ranking, chips, analítico, busca, paginação, CSV, lote misto, pasta manual, pasta com acesso contínuo (handle real do sistema de arquivos do navegador), arquivo novo/removido/corrompido/pasta vazia, leitura a cada 60 s (relógio simulado), aba oculta, permissão expirada, última pasta lembrada, nomes alternativos, teclado, layout 390/820/1440 px | 27 testes no Chromium 141 (Playwright) (`npm run test:ui`, incluindo os da linha acima) | Passam |
| Sem chamadas de rede e sem execução dinâmica no HTML | Busca no arquivo gerado | Nenhuma |

### O que NÃO foi testado

- Windows, Microsoft Edge e uma pasta real do OneDrive (nem "Arquivos Sob Demanda"). Os testes de pasta usam uma pasta do próprio navegador (OPFS) entregue no lugar do seletor.
- O diálogo real do seletor de pasta e o comportamento real das permissões persistentes do Chrome/Edge.
- Firefox e Safari (o modo manual foi verificado no Chromium removendo a API de pastas).
- Arquivos `.xlsx` gravados por outros programas além do Excel (amostra), xlsxwriter e openpyxl (o LibreOffice do ambiente não tinha o Calc).

## 13. Publicação por URL

O painel é só código, sem dados; pode ficar em uma URL fixa e continuar lendo a pasta do OneDrive **no computador de quem abre a página**. Opção preparada: **GitHub Pages** a partir de `docs/index.html`.

1. Settings → Pages → Source "Deploy from a branch" → Branch `main`, pasta `/docs` → Save.
2. Endereço esperado: `https://analistafjp-design.github.io/pos-corte/` (só vale depois de ativado; não foi verificado).

Cuidados: a página publicada é pública (mostra apenas o painel vazio); em repositório privado o GitHub Pages exige plano pago; os dados gravados no navegador ficam ligados ao endereço, então abrir por outra URL começa sem eles. Outras opções (SharePoint/OneDrive Web, Netlify, Cloudflare Pages) servem igualmente, por ser um arquivo estático em HTTPS.

Endereço antigo do projeto: https://acompanhamento-pos-corte.analistafjp.chatgpt.site. **Nada foi publicado por mim**; não presuma que ele esteja na mesma versão deste arquivo.

## 14. Continuidade

Para retomar o projeto, use este repositório (ou envie o HTML, este documento, `Prompt_Projeto_Pos_Corte.md` e uma planilha de exemplo). Preserve os resultados de referência e rode `npm test` antes de alterar visual ou integração.
