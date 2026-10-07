// Testes de interface no Chromium (Playwright). Executam o HTML único gerado por `node build.mjs`.
// Requisitos: playwright instalado (global ou local) e as planilhas de tests/fixtures.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('/opt/node22/lib/node_modules/playwright'); }
const { chromium } = playwright;

const RAIZ = path.resolve(__dirname, '..');
const HTML = path.join(RAIZ, 'Acompanhamento_Pos_Corte.html');
const FX = path.join(__dirname, 'fixtures');
const fx = (...p) => path.join(FX, ...p);
const FILE_URL = 'file://' + HTML;

let browser;
let server;
let baseUrl;

test.before(async () => {
  assert.ok(fs.existsSync(HTML), 'rode `node build.mjs` antes dos testes');
  assert.ok(fs.existsSync(fx('pequeno_xlsxwriter.xlsx')), 'gere as planilhas: python3 tools/make_fixtures.py tests/fixtures');
  browser = await chromium.launch({ args: ['--no-sandbox'], executablePath: process.env.CHROMIUM_PATH || undefined });
  server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(fs.readFileSync(HTML));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = 'http://127.0.0.1:' + server.address().port + '/';
});
test.after(async () => {
  await browser.close();
  server.close();
});

async function abrir(opts) {
  opts = opts || {};
  const ctx = opts.ctx || (await browser.newContext({ viewport: { width: opts.w || 1440, height: opts.h || 900 }, locale: 'pt-BR', acceptDownloads: true }));
  const page = await ctx.newPage();
  page.errosPagina = [];
  page.on('pageerror', (e) => page.errosPagina.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errosPagina.push('console: ' + m.text()); });
  if (opts.initScript) await page.addInitScript(opts.initScript);
  if (opts.clock) await page.clock.install();
  await page.goto(opts.url || FILE_URL);
  return page;
}
const semErros = (page) => assert.deepEqual(page.errosPagina, [], 'erros no console/página');
// valores dos cartões na ordem antiga: percorrido, exec, exoc, negociações, termos, sem desdobro
const kpis = (page) => page.evaluate(() => ['atividades', 'exec', 'exoc', 'neg', 'termos'].map((k) => document.querySelector(`[data-fk="kpi:${k}"] .kpi-value`).textContent));
const kpiTexto = (page, k) => page.textContent(`[data-fk="kpi:${k}"]`);
async function importar(page, arquivos, esperaKpis = true) {
  await page.setInputFiles('#inp-files', arquivos);
  if (esperaKpis) await page.waitForSelector('.kpi-value');
}
const statusTitulo = (page) => page.textContent('#status .st-title');
const statusTexto = (page) => page.textContent('#status');
const PEQUENO = fx('pequeno_xlsxwriter.xlsx');
const CADASTRO = fx('Cadastro_pequeno.xlsx');
const KPIS_PEQUENO = ['19', '18', '1', '5', '7'];

/* ------------------------------------------------------------------ */
test('estado inicial: sem dados incorporados, com instruções e sem erros', async () => {
  const page = await abrir();
  assert.match(await page.textContent('#view-geral'), /Nenhuma base carregada/);
  for (const [id, t] of [['#btn-pasta', 'Conectar pasta'], ['#btn-atualizar', 'Atualizar'], ['#btn-importar', 'Importar Excel']]) {
    assert.ok(await page.locator(id).isVisible(), t);
    assert.match(await page.textContent(id), new RegExp(t));
  }
  assert.equal(await page.locator('.kpi-groups').count(), 0);
  assert.ok(await page.locator('#filters').isHidden());
  semErros(page);
  await page.context().close();
});

test('importar Excel: cartões, valores negociados e gráficos calculados a partir dos registros', async () => {
  const page = await abrir();
  await importar(page, PEQUENO);
  assert.deepEqual(await kpis(page), KPIS_PEQUENO);
  assert.match(await statusTitulo(page), /Base carregada: 19 atividades de 1 arquivo/);
  // legendas dos cartões removidas: só rótulo e valor (o débito informado fica em "Valores negociados")
  assert.equal(await page.locator('.kpi .kpi-sub').count(), 0, 'cartões sem legenda');
  assert.doesNotMatch(await kpiTexto(page, 'neg'), /Débito informado/);
  assert.doesNotMatch(await kpiTexto(page, 'termos'), /110013 Serviços|Irregularidade identificada/);
  // pós-corte por categoria: todos os 19 registros do fixture são da categoria Residencial
  assert.match(await page.textContent('[data-fk=cat-topo]'), /Categoria com mais pós-corte: Residencial — 19 \(100% do percorrido\)/);
  const cats = await page.$$eval('.card-categorias tbody tr', (trs) => trs.map((tr) => [...tr.children].map((c) => c.textContent.trim())));
  assert.deepEqual(cats, [['Residencial', '19', '100%', '18', '1', '7', '38,9%', '5', '27,8%']]);
  // recortes da Visão geral: 5 recortes (3 ramal, 1 cavalete simples, 1 sem tipo) sobre 18 Exec
  assert.equal(await page.textContent('.card-recorte [data-rk=total]'), '5');
  assert.match(await page.textContent('.card-recorte [data-rk=pct]'), /27,8% do Exec \(Total recorte ÷ Exec\)/);
  assert.match(await page.textContent('.card-recorte .rc-row[data-tipo=RAMAL]'), /Corte no Ramal.*60,0% · 3/);
  assert.match(await page.textContent('.card-recorte .rc-row[data-tipo="CAVALETE SIMPLES"]'), /Corte no Cavalete Simples.*20,0% · 1/);
  assert.match(await page.textContent('.card-recorte .rc-row[data-tipo="NÃO INFORMADO"]'), /Tipo não informado.*20,0% · 1/);
  assert.equal(await page.locator('[data-fk="kpi:semDesdobro"]').count(), 0, 'sem card de desdobro na visão geral');
  // distribuição dos status e tabela mensal seguem fora da Visão geral; a produção mensal voltou, ao lado de negociações e termos
  for (const id of ['h-status', 'h-tm']) assert.equal(await page.locator('#' + id).count(), 0, id + ' removido');
  assert.equal(await page.locator('.card-status').count(), 0);
  assert.equal(await page.textContent('#h-mensal'), 'Produção mensal — Percorrido (Exec + Exoc)');
  const porMes = JSON.parse(fs.readFileSync(fx('pequeno_esperados.json'), 'utf8')).porMes; // contagem independente (Python)
  assert.deepEqual(await page.$$eval('section[aria-labelledby=h-mensal] .cc-val', (els) => els.map((e) => e.textContent)), Object.keys(porMes).sort().map((m) => String(porMes[m].atividades)));
  assert.deepEqual(await page.$$eval('section[aria-labelledby=h-mensal] .cc-label', (els) => els.map((e) => e.textContent)), ['jul/2026', 'ago/2026', 'set/2026']);
  assert.ok(await page.locator('section[aria-labelledby=h-mensal] .legend').isVisible(), 'legenda Exec/Exoc');
  const lado = await page.$$eval('.card-mensal, .card-negtermo', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) }; }));
  assert.equal(lado.length, 2);
  assert.equal(lado[0].y, lado[1].y, 'produção mensal na mesma linha de negociações e termos');
  assert.ok(lado[1].x > lado[0].x + lado[0].w - 2 && Math.abs(lado[0].w - lado[1].w) <= 2, 'lado a lado, metade da largura cada um');
  assert.equal(await page.locator('#view-geral .mini-sub', { hasText: '"Fez o corte novamente" = Sim' }).count(), 0, 'legenda do recorte removida');
  // valores negociados: logo abaixo de "Recortes realizados", em largura total, com valor negociado e economias recuperadas (só o número, sem % nem rótulos)
  const ordem = await page.$$eval('#view-geral > .stack > *', (els) => els.map((e) => e.className));
  const iRec = ordem.findIndex((c) => /card-recorte/.test(c));
  assert.ok(/card-valores/.test(ordem[iRec + 1]), 'valores negociados logo após os recortes: ' + ordem.join(' | '));
  const larg = await page.$$eval('.card-recorte, .card-valores', (els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
  assert.equal(larg[0], larg[1], 'mesma largura do bloco de recortes (tela inteira)');
  // sem a faixa por mês (repetitiva): só os dois quadros
  assert.deepEqual(await page.$$eval('.card-valores .vn-item .vn-mes', (els) => els.map((e) => e.textContent)), ['Valor negociado', 'Economias recuperadas']);
  assert.equal(await page.locator('.card-valores table').count(), 0, 'sem a tabela de indicadores mensais');
  const vn = (k) => page.$$eval(`.card-valores [data-vn=${k}] .vn-valor`, (els) => els.map((e) => e.textContent.replace(/\s/g, ' ')));
  // valores esperados vêm da contagem independente do gerador de fixtures (pequeno_esperados.json)
  const esp = JSON.parse(fs.readFileSync(fx('pequeno_esperados.json'), 'utf8'));
  assert.equal(esp.debito, 2535.06);
  // o valor negociado não tem percentual: só o valor (o % existe apenas nas economias recuperadas)
  assert.deepEqual(await vn('valor'), ['R$ 2.535,06']);
  assert.equal(await page.locator('.card-valores [data-vn=valor] [data-vn=pct]').count(), 0, 'valor negociado sem %');
  assert.equal(await page.locator('.card-valores [data-vn=economias] [data-vn=pct]').count(), 0, 'economias recuperadas também sem %');
  assert.equal(await page.locator('.card-valores .vn-cab').count(), 0, 'sem os rótulos "Valor" e "%" sobre os números');
  assert.doesNotMatch(await page.getAttribute('.card-valores [data-vn=valor]', 'data-tip'), /%|dividido/);
  assert.doesNotMatch(await page.getAttribute('.card-valores [data-vn=economias]', 'data-tip'), /%|dividido/);
  // sem o arquivo Cadastro, cada matrícula que negociou conta o mínimo de 1 economia (as 5 negociações são da matrícula 1001) e o aviso diz isso
  assert.equal(esp.neg, 5);
  assert.equal(esp.matriculasNeg, 1);
  assert.deepEqual(await vn('economias'), [String(esp.matriculasNeg)]);
  assert.deepEqual(await vn('economias'), ['1']);
  assert.match(await page.textContent('.card-valores [data-vn=economias] .kpi-sub'), /sem Cadastro nem Serviço avulso: 1 economia por matrícula/);
  assert.match(await page.textContent('#view-geral'), /Valor negociado/);
  // com o Cadastro na pasta: as 5 negociações são do mesmo imóvel (matrícula 1001), que tem TOTAL_ECO = 3 no Cadastro (contagem independente)
  await page.setInputFiles('#inp-files', [PEQUENO, CADASTRO]);
  await page.waitForFunction(() => document.querySelector('[data-fk="kpi:atividades"] .kpi-value') && /Cadastro: 3 matrículas usadas/.test(document.querySelector('#status').textContent));
  assert.equal(esp.cadastro.economias, 3);
  assert.deepEqual(await vn('economias'), [String(esp.cadastro.economias)]);
  assert.deepEqual(await vn('economias'), ['3']);
  assert.equal(await page.locator('.card-valores [data-vn=economias] .kpi-sub').count(), 0, 'sem aviso quando o Cadastro está carregado');
  assert.deepEqual(await vn('valor'), ['R$ 2.535,06'], 'valor negociado não muda com o Cadastro');
  assert.match(await page.textContent('#status'), /1 repetida desconsiderada/);
  assert.equal(await page.locator('.card-valores [data-act=baixar-fora-cadastro], .card-valores [data-vn=cadastro-repetida]').count(), 0, 'a matrícula negociada está no Cadastro');
  assert.deepEqual(await kpis(page), KPIS_PEQUENO, 'o Cadastro não vira atividade nem muda os cartões');
  // 5 negociações da mesma matrícula: 4 repetidas contam uma vez só (as economias podem ficar abaixo das negociações) e o bloco não traz legendas explicativas
  const repetidas = esp.neg - esp.negSemMatricula - esp.matriculasNeg;
  assert.equal(repetidas, 4);
  assert.equal(await page.locator('.card-valores [data-vn=sem-valor], .card-valores [data-vn=negociacoes-repetidas], .card-valores [data-vn=sem-cadastro]').count(), 0, 'sem as legendas de valor sem informação, negociações repetidas e matrículas fora das fontes');
  // negociações e termos por mês continuam, com legenda
  assert.ok(await page.locator('.card-negtermo .legend').isVisible());
  // rankings conciliam com o total
  for (const id of ['h-frente', 'h-recurso']) {
    const soma = await page.$$eval(`section[aria-labelledby=${id}] .rank-list .rv`, (els) => els.reduce((a, e) => a + parseInt(e.firstChild.textContent.replace(/\./g, ''), 10), 0));
    assert.equal(soma, 19, id);
  }
  // nada de HTML injetado a partir dos dados
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  semErros(page);
  await page.context().close();
});

test('valores negociados: arquivo sem a coluna Matrícula sinaliza economias recuperadas como indisponíveis', async () => {
  const page = await abrir();
  await importar(page, [fx('leve_titulo_linha4.xlsx'), CADASTRO]);
  assert.match(await page.textContent('.card-valores [data-vn=economias]'), /indisponível em 1 arquivo/);
  assert.doesNotMatch(await page.textContent('.card-valores [data-vn=valor]'), /indisponível/);
  assert.match(await page.textContent('.card-valores [data-vn=sem-matricula]'), /5 negociações sem matrícula/);
  semErros(page);
  await page.context().close();
});

test('Cadastro: arquivo inválido é recusado com mensagem clara e não vira atividade; nomes em "Arquivos e regras"', async () => {
  const page = await abrir();
  await importar(page, [PEQUENO, fx('Cadastro_sem_colunas.xlsx')]);
  assert.deepEqual(await kpis(page), KPIS_PEQUENO);
  assert.match(await statusTexto(page), /Importação parcial/);
  assert.match(await statusTexto(page), /Cadastro_sem_colunas\.xlsx — O arquivo Cadastro precisa ter a coluna da matrícula \(NUM_LIGACAO\) e a do total de economias \(TOTAL_ECO\)/);
  assert.match(await page.textContent('.card-valores [data-vn=economias] .kpi-sub'), /sem Cadastro nem Serviço avulso: 1 economia por matrícula/);
  // com um Cadastro válido, a leitura é descrita em "Arquivos e regras"
  await page.setInputFiles('#inp-files', [PEQUENO, CADASTRO]);
  await page.waitForFunction(() => /Cadastro: 3 matrículas usadas/.test(document.querySelector('#status').textContent));
  await page.click('#nav-tabs button[data-view=base]');
  const linha = await page.textContent('dl.kv >> text=Cadastro (economias) >> xpath=following-sibling::dd[1]');
  assert.match(linha, /Cadastro_pequeno\.xlsx — aba "Export" · 7 linhas · 5 matrículas distintas · mês out\/2026 · 1 repetidas \(2 linhas\) desconsideradas · 3 usadas · 1 sem TOTAL_ECO/);
  // o Cadastro não é uma base de atividades: não entra na contagem de arquivos válidos
  assert.match(await page.textContent('dl.kv >> text=Arquivos válidos >> xpath=following-sibling::dd[1]'), /^1 de 1$/);
  semErros(page);
  await page.context().close();
});

test('Serviço avulso (CSV): vale primeiro, o Cadastro completa o que faltar, e outro CSV na pasta é ignorado sem erro', async () => {
  const page = await abrir();
  const AV07 = fx('Servico_avulso_07-2026.csv');
  const economias = () => page.$$eval('.card-valores [data-vn=economias] .vn-valor', (els) => els.map((x) => x.textContent));
  const e = JSON.parse(fs.readFileSync(fx('avulso_esperados.json'), 'utf8'));
  const jul = e.consultas.find((c) => c.mat === '1001' && c.mes === '2026-07');
  assert.deepEqual([jul.motivo, jul.eco], ['ok', 4], 'contagem independente: 1001 vale 4 no avulso de julho (o Cadastro dá 3)');
  // só o avulso: as 5 negociações (julho, matrícula 1001) valem o total do avulso (4), não 1
  await importar(page, [PEQUENO, AV07, fx('outro_relatorio.csv')]);
  await page.waitForFunction(() => /Serviço avulso: 4 matrículas usadas, 1 repetida desconsiderada/.test(document.querySelector('#status').textContent));
  assert.doesNotMatch(await statusTexto(page), /Importação parcial|Não importado/);
  assert.match(await statusTexto(page), /CSV ignorado \(não é o Serviço avulso: faltam N\. da Ligacao e Qtd\. Economia\): outro_relatorio\.csv/);
  assert.match(await statusTitulo(page), /Base carregada: 19 atividades de 1 arquivo/);
  assert.deepEqual(await kpis(page), KPIS_PEQUENO, 'o CSV não vira atividade');
  assert.deepEqual(await economias(), ['4']);
  // CSV vazio (ou ainda sincronizando no OneDrive): aparece como erro, não é ignorado em silêncio
  await page.setInputFiles('#inp-files', [PEQUENO, AV07, fx('vazio.csv')]);
  await page.waitForFunction(() => /Importação parcial/.test(document.querySelector('#status').textContent));
  assert.match(await statusTexto(page), /Não importado: vazio\.csv — O arquivo está vazio\. Se ele está no OneDrive, espere terminar de sincronizar/);
  assert.deepEqual(await economias(), ['4'], 'o resto continua valendo');
  await page.setInputFiles('#inp-files', [PEQUENO, AV07, fx('outro_relatorio.csv')]);
  await page.waitForFunction(() => /CSV ignorado/.test(document.querySelector('#status').textContent) && !/Importação parcial/.test(document.querySelector('#status').textContent));
  assert.equal(await page.locator('.card-valores [data-vn=economias] .kpi-sub').count(), 0);
  assert.match(await page.getAttribute('.card-valores [data-vn=economias]', 'data-tip'), /do Serviço avulso em 1, 1 economia \(mínimo\) em 0/);
  // avulso + Cadastro: o avulso continua valendo (4); o Cadastro só entra onde o avulso não tem a matrícula
  await page.setInputFiles('#inp-files', [PEQUENO, AV07, CADASTRO]);
  await page.waitForFunction(() => /Serviço avulso: .*Cadastro: 3 matrículas usadas/.test(document.querySelector('#status').textContent));
  assert.deepEqual(await economias(), ['4']);
  // "Arquivos e regras" descreve a leitura do avulso e do Cadastro
  await page.click('#nav-tabs button[data-view=base]');
  const linha = await page.textContent('dl.kv >> text=Serviço avulso (economias) >> xpath=following-sibling::dd[1]');
  assert.match(linha, /Servico_avulso_07-2026\.csv — 6 linhas · 5 matrículas distintas · mês jul\/2026 · 1 matrícula repetida no mesmo mês \(2 linhas\) desconsideradas · 4 usadas/);
  assert.match(await page.textContent('dl.kv >> text=Arquivos válidos >> xpath=following-sibling::dd[1]'), /^1 de 1$/);
  // sem nenhum dos dois: mínimo de 1 por matrícula, com o aviso
  await page.setInputFiles('#inp-files', [PEQUENO]);
  await page.waitForFunction(() => !/Serviço avulso|Cadastro:/.test(document.querySelector('#status .st-detail').textContent));
  await page.click('#nav-tabs button[data-view=geral]');
  assert.deepEqual(await economias(), ['1']);
  // dois meses de avulso (UTF-8 com BOM e Windows-1252 sem cabeçalho de mês): o total do mês da negociação
  await page.setInputFiles('#inp-files', [PEQUENO, AV07, fx('Servico_avulso_08-2026.csv')]);
  await page.waitForFunction(() => /Serviço avulso de 2 meses/.test(document.querySelector('#status').textContent));
  assert.deepEqual(await economias(), ['4'], 'as negociações são de julho: vale o total de julho (4), não o de agosto (5)');
  semErros(page);
  await page.context().close();
});

test('Cadastro com todos os meses (coluna Mês/Ano): vale o total do mês da negociação e a matrícula em meses diferentes não é "repetida"', async () => {
  const page = await abrir();
  await importar(page, [PEQUENO, fx('Cadastro_meses.xlsx')]);
  await page.waitForFunction(() => /Cadastro de 3 meses/.test(document.querySelector('#status').textContent));
  assert.match(await statusTexto(page), /Cadastro de 3 meses: 7 registros de matrícula por mês usados, 1 repetido no mesmo mês desconsiderado/);
  // as 5 negociações são de julho/2026, matrícula 1001: vale o total de julho (3), não o de agosto/setembro (4); contagem independente em cadastro_meses_esperados.json
  const e = JSON.parse(fs.readFileSync(fx('cadastro_meses_esperados.json'), 'utf8'));
  const jul = e.consultas.find((c) => c.mat === '1001' && c.mes === '2026-07');
  assert.deepEqual([jul.motivo, jul.eco], ['ok', 3]);
  assert.deepEqual(await page.$$eval('.card-valores [data-vn=economias] .vn-valor', (els) => els.map((x) => x.textContent)), ['3']);
  assert.equal(await page.locator('.card-valores [data-vn=cadastro-repetida], .card-valores [data-act=baixar-fora-cadastro]').count(), 0, '1001 não é repetida só por aparecer em três meses');
  await page.click('#nav-tabs button[data-view=base]');
  const linha = await page.textContent('dl.kv >> text=Cadastro (economias) >> xpath=following-sibling::dd[1]');
  assert.match(linha, /Cadastro_meses\.xlsx — aba "Export" · 11 linhas · 5 matrículas distintas · 3 meses \(jul\/2026 a set\/2026\) · 1 matrícula repetida no mesmo mês \(2 linhas\) desconsideradas · 7 usadas · 1 sem TOTAL_ECO/);
  semErros(page);
  await page.context().close();
});

test('Cadastro: pasta "Cadastro" com o arquivo no nome original (data (16).xlsx) é lida como Cadastro, sem erro', async () => {
  const page = await abrir();
  await page.setInputFiles('#inp-folder', fx('pasta_cadastro'));
  await page.waitForFunction(() => /Cadastro: 3 matrículas usadas/.test(document.querySelector('#status').textContent), null, { timeout: 30000 });
  assert.doesNotMatch(await statusTexto(page), /Importação parcial|Não importado/);
  assert.match(await statusTitulo(page), /Base carregada: 19 atividades de 1 arquivo/);
  assert.deepEqual(await kpis(page), KPIS_PEQUENO, 'o Cadastro não vira atividade');
  assert.deepEqual(await page.$$eval('.card-valores [data-vn=economias] .vn-valor', (els) => els.map((e) => e.textContent)), ['3']);
  // mesmo sem "cadastro" em nenhum nome do caminho, o arquivo é reconhecido pelas colunas
  const xlsx = (nome, arq) => ({ name: nome, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: fs.readFileSync(arq) });
  await page.setInputFiles('#inp-files', [xlsx('atividades.xlsx', PEQUENO), xlsx('data (16).xlsx', CADASTRO)]);
  await page.waitForFunction(() => /Cadastro: 3 matrículas usadas/.test(document.querySelector('#status').textContent) && !/Importação parcial/.test(document.querySelector('#status').textContent));
  assert.deepEqual(await page.$$eval('.card-valores [data-vn=economias] .vn-valor', (els) => els.map((e) => e.textContent)), ['3']);
  semErros(page);
  await page.context().close();
});

test('botão "Baixar matrículas fora do Cadastro": só aparece quando há matrícula fora; o Excel traz as mesmas matrículas da nota e respeita o filtro', { timeout: 120000 }, async () => {
  const cp = require('node:child_process');
  const py = cp.spawnSync('python3', ['-c', 'import openpyxl'], { encoding: 'utf8' });
  const lerXlsx = (arq) => JSON.parse(cp.spawnSync('python3', ['-c', `
import openpyxl, json, sys
wb = openpyxl.load_workbook(sys.argv[1])
ws = wb['Fora do Cadastro']
linhas = [[c.value for c in row] for row in ws.iter_rows(min_row=2)]
print(json.dumps({'abas': wb.sheetnames, 'mats': sorted(str(l[0]) for l in linhas), 'cidades': sorted({l[1] for l in linhas}), 'neg': sum(l[3] for l in linhas), 'valor': round(sum(l[4] for l in linhas), 2), 'resumo': wb['Resumo']['B5'].value}))`, arq], { encoding: 'utf8' }).stdout);
  const page = await abrir();
  // sem Cadastro: nada a baixar (o quadro já avisa que o arquivo não foi encontrado)
  await importar(page, PEQUENO);
  assert.equal(await page.locator('[data-act=baixar-fora-cadastro]').count(), 0, 'sem Cadastro não há botão');
  // Cadastro que cobre as matrículas negociadas (pequeno): nada fora, sem botão
  await page.setInputFiles('#inp-files', [PEQUENO, CADASTRO]);
  await page.waitForFunction(() => /Cadastro: 3 matrículas usadas/.test(document.querySelector('#status').textContent));
  assert.equal(await page.locator('[data-act=baixar-fora-cadastro]').count(), 0, 'nenhuma matrícula fora do Cadastro');
  // base grande com o Cadastro que deixa matrículas de fora
  await page.setInputFiles('#inp-files', [fx('grande_sintetico.xlsx'), fx('Cadastro_grande.xlsx')]);
  await page.waitForFunction(() => /Cadastro: 651 matrículas usadas/.test(document.querySelector('#status').textContent), null, { timeout: 90000 });
  const e = JSON.parse(fs.readFileSync(fx('grande_esperados.json'), 'utf8')).cadastro;
  const btn = page.locator('[data-act=baixar-fora-cadastro]');
  const nota = async () => Number(await btn.getAttribute('data-n')); // matrículas fora das fontes, no filtro
  assert.equal(await nota(), e.negSemCadastro);
  assert.equal(await page.locator('.card-valores [data-vn=sem-valor], .card-valores [data-vn=negociacoes-repetidas], .card-valores [data-vn=sem-cadastro]').count(), 0, 'sem as legendas de valor sem informação, negociações repetidas e matrículas fora das fontes');
  assert.equal(await btn.count(), 1);
  assert.match(await btn.textContent(), /Baixar matrículas fora do Cadastro \(Excel\)/);
  const baixa = async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), btn.click()]);
    assert.match(dl.suggestedFilename(), /^matriculas-fora-do-cadastro_\d{8}\.xlsx$/);
    const arq = require('node:path').join(require('node:os').tmpdir(), 'pc-fora-' + process.pid + '-' + Date.now() + '.xlsx');
    await dl.saveAs(arq);
    assert.equal(fs.readFileSync(arq).subarray(0, 2).toString(), 'PK');
    return arq;
  };
  const arq1 = await baixa();
  if (py.status === 0) {
    const x = lerXlsx(arq1);
    assert.deepEqual(x.abas, ['Resumo', 'Fora do Cadastro']);
    assert.deepEqual(x.mats, e.foraLista.slice().sort(), 'as mesmas matrículas da contagem independente');
    assert.equal(x.neg, e.foraNegociacoes);
    assert.ok(Math.abs(x.valor - e.foraValor) < 0.005);
    assert.equal(x.resumo, 'nenhum');
  }
  fs.unlinkSync(arq1);
  // com filtro de cidade o arquivo tem exatamente as matrículas do botão
  await page.selectOption('#f-cidade', 'Cidade Norte');
  await page.waitForFunction(() => document.querySelector('.card-valores [data-act=baixar-fora-cadastro]'));
  const n = await nota();
  assert.ok(n > 0 && n < e.negSemCadastro, 'o filtro reduz a lista: ' + n);
  const arq2 = await baixa();
  if (py.status === 0) {
    const x = lerXlsx(arq2);
    assert.equal(x.mats.length, n, 'o Excel tem tantas matrículas quanto o botão informa no filtro');
    assert.deepEqual(x.cidades, ['Cidade Norte']);
    assert.match(x.resumo, /Cidade: Cidade Norte/);
  }
  fs.unlinkSync(arq2);
  // com o Serviço avulso também carregado (matrículas diferentes das da base grande), o botão e o Excel falam das duas fontes
  await page.setInputFiles('#inp-files', [fx('grande_sintetico.xlsx'), fx('Servico_avulso_07-2026.csv'), fx('Cadastro_grande.xlsx')]);
  await page.waitForFunction(() => /Serviço avulso: .*Cadastro: 651 matrículas usadas/.test(document.querySelector('#status').textContent), null, { timeout: 90000 });
  assert.match(await btn.textContent(), /Baixar matrículas fora do Serviço avulso e do Cadastro \(Excel\)/);
  const n3 = await nota();
  assert.equal(n3, n, 'o avulso sintético não tem nenhuma matrícula da base grande: a lista continua igual');
  const arq3 = await baixa();
  if (py.status === 0) {
    const o = cp.spawnSync('python3', ['-c', `
import openpyxl, json, sys
wb = openpyxl.load_workbook(sys.argv[1]); ws = wb['Sem total de economias']
print(json.dumps({'abas': wb.sheetnames, 'n': ws.max_row - 1, 'titulo': wb['Resumo']['A1'].value, 'usados': wb['Resumo']['B3'].value}))`, arq3], { encoding: 'utf8' });
    const x3 = JSON.parse(o.stdout);
    assert.deepEqual(x3.abas, ['Resumo', 'Sem total de economias']);
    assert.equal(x3.n, n3);
    assert.match(x3.titulo, /fora do Serviço avulso e do Cadastro/);
    assert.match(x3.usados, /Servico_avulso_07-2026\.csv \+ Cadastro_grande\.xlsx/);
  }
  fs.unlinkSync(arq3);
  semErros(page);
  await page.context().close();
});

test('filtros: mês, ranking, datas, seletores, chips e limpar', async () => {
  const page = await abrir();
  await importar(page, PEQUENO);
  // clicar no mês filtra e clicar de novo limpa
  await page.click('.cc-col[data-fk="mes:2026-07"]');
  assert.deepEqual((await kpis(page))[0], '17');
  await page.click('.cc-col[data-fk="mes:2026-07"]');
  assert.equal((await kpis(page))[0], '19');
  await page.click('.mgroup[data-fk="mesnt:2026-07"]');
  assert.deepEqual((await kpis(page))[0], '17');
  assert.match(await page.textContent('#chips'), /Período: 01\/07\/2026 a 31\/07\/2026/);
  assert.equal(await page.inputValue('#f-from'), '2026-07-01');
  await page.click('.mgroup[data-fk="mesnt:2026-07"]');
  assert.equal((await kpis(page))[0], '19');
  // agosto mostra somente agosto
  await page.fill('#f-from', '2026-08-01');
  await page.fill('#f-to', '2026-08-31');
  assert.deepEqual(await kpis(page), ['1', '1', '0', '0', '0']);
  assert.equal(await page.locator('.mgroup[data-fk^="mesnt:"]').count(), 1);
  await page.click('#chips button.ghost');
  assert.deepEqual(await kpis(page), KPIS_PEQUENO);
  // clicar em item de ranking filtra pela frente; chip remove
  await page.click('.rrow[data-fk="rank:frente:Frente Alfa"]');
  assert.equal(await page.inputValue('#f-frente'), 'Frente Alfa');
  assert.equal((await kpis(page))[0], '17');
  await page.click('#chips .chip button');
  assert.equal(await page.inputValue('#f-frente'), '');
  // frente "Não mapeada" existe e é filtrável
  await page.selectOption('#f-frente', 'Não mapeada');
  assert.equal((await kpis(page))[0], '1');
  await page.selectOption('#f-frente', '');
  // seletor de cidade e de equipe
  await page.selectOption('#f-equipe', 'AL-X-02');
  assert.equal((await kpis(page))[0], '1');
  await page.selectOption('#f-equipe', '');
  // data inicial maior que a final: aviso e nenhum registro
  await page.fill('#f-from', '2026-09-01');
  await page.fill('#f-to', '2026-07-01');
  assert.equal((await kpis(page))[0], '0');
  assert.match(await page.textContent('#chips'), /data inicial é posterior/);
  await page.click('#chips button.ghost');
  // seletor do indicador dos gráficos
  await page.selectOption('#f-ind', 'termos');
  assert.match(await page.textContent('#h-mensal'), /Termos aplicados/);
  assert.deepEqual(await page.$$eval('section[aria-labelledby=h-mensal] .cc-val', (els) => els.map((e) => e.textContent)), ['7', '0', '0']);
  assert.match(await page.textContent('section[aria-labelledby=h-frente] .hint'), /^Termos · 7 no filtro/);
  assert.match(await page.textContent('section[aria-labelledby=h-recurso] .hint'), /^Termos · 7 no filtro/);
  await page.selectOption('#f-ind', 'atividades');
  semErros(page);
  await page.context().close();
});

test('cartão abre o analítico; busca, detalhes e exportação CSV filtrada', async () => {
  const page = await abrir();
  await importar(page, PEQUENO);
  await page.click('.kpi[data-fk="kpi:termos"]');
  await page.waitForSelector('#an-tabela table');
  assert.equal(await page.inputValue('#an-ind'), 'termos');
  assert.match(await page.textContent('#an-contagem'), /^7 registros/);
  // rótulos de termos
  const tags = await page.$$eval('#an-tabela tbody tr td:last-child', (els) => els.map((e) => e.textContent.trim()));
  assert.equal(tags.filter((t) => /110013/.test(t) && /310013/.test(t)).length, 1, 'uma atividade com os dois códigos');
  // detalhes
  await page.click('.expander >> nth=0');
  assert.ok(await page.locator('.detail-inner').first().isVisible());
  assert.match(await page.textContent('.detail-inner'), /Serviço adicionais resposta/);
  // busca por protocolo
  await page.selectOption('#an-ind', 'atividades');
  await page.fill('#an-busca', 'os1');
  await page.waitForFunction(() => /^19 registros/.test(document.querySelector('#an-contagem').textContent));
  await page.fill('#an-busca', 'zzz-nao-existe');
  await page.waitForFunction(() => /^0 registros/.test(document.querySelector('#an-contagem').textContent));
  assert.match(await page.textContent('#an-tabela'), /Nenhum registro/);
  await page.fill('#an-busca', '');
  await page.selectOption('#an-ind', 'termos');
  await page.waitForFunction(() => /^7 registros/.test(document.querySelector('#an-contagem').textContent));
  // exportação: todas as linhas filtradas, BOM, ';'
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('text=Exportar CSV')]);
  assert.match(dl.suggestedFilename(), /^pos-corte_termos_\d{8}\.csv$/);
  const buf = fs.readFileSync(await dl.path());
  assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'BOM UTF-8');
  const linhas = buf.toString('utf8').slice(1).split('\r\n');
  assert.equal(linhas.length, 7 + 2);
  assert.ok(linhas[0].startsWith('Recurso;Cód. Protocolo Origem;ID da Atividade;'));
  // exportar tudo, verificando proteção de fórmulas
  await page.selectOption('#an-ind', 'atividades');
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('text=Exportar CSV')]);
  const csv = fs.readFileSync(await dl2.path(), 'utf8');
  assert.equal(csv.slice(1).split('\r\n').length, 19 + 2);
  assert.match(csv, /'=HYPERLINK\(""x""\)/);
  // o HTML do nome não é interpretado
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.equal(await page.locator('#an-tabela img').count(), 0);
  semErros(page);
  await page.context().close();
});

test('paginação de 50 linhas e exportação completa com 8.136 registros', { timeout: 120000 }, async () => {
  const page = await abrir();
  await importar(page, fx('grande_sintetico.xlsx'));
  assert.deepEqual(await kpis(page), ['8.136', '7.461', '675', '230', '389']);
  await page.click('#nav-tabs button[data-view=analitico]');
  await page.waitForSelector('#an-tabela table');
  assert.equal(await page.locator('#an-tabela tbody tr').count(), 50);
  assert.match(await page.textContent('.pager'), /1–50 de 8\.136 · página 1 de 163/);
  await page.click('text=Próxima ›');
  assert.match(await page.textContent('.pager'), /51–100 de 8\.136 · página 2 de 163/);
  await page.click('text=Última »');
  assert.match(await page.textContent('.pager'), /8\.101–8\.136 de 8\.136 · página 163 de 163/);
  assert.equal(await page.locator('#an-tabela tbody tr').count(), 36);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('text=Exportar CSV')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  assert.equal(csv.slice(1).split('\r\n').length, 8136 + 2, 'a exportação não se limita à página');
  // conferências automáticas
  await page.click('#nav-tabs button[data-view=base]');
  const bad = await page.locator('.checks .bad').count();
  assert.equal(bad, 1, 'só a conferência de frentes mapeadas pode alertar (prefixo ZZ do arquivo sintético)');
  assert.match(await page.textContent('#view-base'), /Termos: conciliado com a aba Pós Corte com Termo \(389\)/);
  assert.match(await page.textContent('#view-base'), /Negociações: conciliado com a aba Pós Corte com Negociação \(230\)/);
  semErros(page);
  await page.context().close();
});

test('lote misto: importa os válidos e nomeia os que falharam; base anterior preservada se todos falharem', async () => {
  const page = await abrir();
  await importar(page, [PEQUENO, fx('vazio.xlsx'), fx('antigo_xls.xlsx'), fx('truncado.xlsx'), fx('xlsb_falso.xlsx')]);
  assert.match(await statusTitulo(page), /Importação parcial: 1 de 5 arquivos/);
  const t = await statusTexto(page);
  for (const n of ['vazio.xlsx', 'antigo_xls.xlsx', 'truncado.xlsx', 'xlsb_falso.xlsx']) assert.ok(t.includes(n), n);
  assert.match(t, /Não importado: vazio\.xlsx — O arquivo está vazio/);
  assert.deepEqual(await kpis(page), KPIS_PEQUENO);
  // agora só inválidos: mantém a base
  await page.setInputFiles('#inp-files', [fx('vazio.xlsx'), fx('sem_cabecalho.xlsx')]);
  await page.waitForFunction(() => /Nenhuma base válida/.test(document.querySelector('#status').textContent));
  assert.match(await statusTexto(page), /A base anterior foi mantida/);
  assert.match(await statusTexto(page), /sem_cabecalho\.xlsx — Cabeçalho não encontrado/);
  assert.deepEqual(await kpis(page), KPIS_PEQUENO);
  semErros(page);
  await page.context().close();
});

test('arquivos enxutos: outra aba, título antes do cabeçalho e colunas ausentes sinalizadas', async () => {
  const page = await abrir();
  await importar(page, fx('leve_titulo_linha4.xlsx'));
  assert.deepEqual(await kpis(page), KPIS_PEQUENO);
  assert.match(await statusTitulo(page), /sem chave de deduplicação|Base carregada/);
  assert.match(await statusTexto(page), /19 linhas sem chave de deduplicação completa/);
  // coluna de indicador ausente: aviso e marcação nos cartões, sem zero silencioso
  await page.setInputFiles('#inp-files', fx('sem_coluna_servadic.xlsx'));
  await page.waitForFunction(() => /indisponível em 1 arquivo/.test(document.querySelector('.kpi-groups').textContent));
  assert.match(await kpiTexto(page, 'termos'), /indisponível em 1 arquivo/);
  assert.match(await kpiTexto(page, 'assertividade'), /indisponível em 1 arquivo/);
  assert.doesNotMatch(await kpiTexto(page, 'neg'), /indisponível/);
  assert.match(await statusTexto(page), /Termos não pôde ser calculado em: sem_coluna_servadic\.xlsx/);
  await page.context().close();
});

test('nomes alternativos de colunas: cadastro na tela reprocessa os arquivos selecionados', async () => {
  const page = await abrir();
  await importar(page, fx('leve_nomes_diferentes.xlsx'), false);
  await page.waitForFunction(() => /Nenhuma base válida/.test(document.querySelector('#status').textContent));
  assert.match(await statusTexto(page), /nenhuma aba tem as colunas esperadas/);
  await page.click('#nav-tabs button[data-view=base]');
  if (!(await page.locator('#al-campo').isVisible())) await page.click('.avancado > summary');
  const alias = { recurso: 'Equipe', data: 'Dt', status: 'Situação', cidade: 'Município', valor: 'Débito', negociou: 'Negociou?', servAdic: 'Serviços adicionais' };
  for (const [campo, nome] of Object.entries(alias)) {
    await page.selectOption('#al-campo', campo);
    await page.fill('#al-nome', nome);
    await page.click('text=Adicionar e reler');
    await page.waitForFunction(() => !document.querySelector('#btn-atualizar svg.spin'));
  }
  await page.click('#nav-tabs button[data-view=geral]');
  await page.waitForSelector('.kpi-value');
  assert.deepEqual(await kpis(page), KPIS_PEQUENO);
  // persiste no navegador
  assert.match(await page.evaluate(() => localStorage.getItem('poscorte.aliases')), /Equipe/);
  await page.context().close();
});

test('pasta pelo seletor manual (webkitdirectory): ignora ~$, .txt e .xls; nomeia o corrompido; remove duplicatas', async () => {
  const page = await abrir();
  await page.evaluate(() => { delete window.showDirectoryPicker; });
  await page.setInputFiles('#inp-folder', fx('pasta_dedup'));
  await page.waitForFunction(() => /Importação parcial|Base carregada/.test(document.querySelector('#status .st-title')?.textContent || ''));
  const meta = JSON.parse(fs.readFileSync(fx('pasta_dedup', '_esperados.json'), 'utf8'));
  const t = await statusTexto(page);
  assert.match(t, /Importação parcial: 2 de 3 arquivos/);
  assert.match(t, /corrompido\.xlsx/);
  assert.doesNotMatch(t, /~\$snapshot_novo/);
  assert.match(t, /antigo\.xls/);
  assert.match(t, new RegExp(meta.duplicatas + ' duplicatas removidas'));
  assert.equal((await kpis(page))[0], String(meta.unicos));
  assert.equal(await page.locator('#side-foot').count(), 0, 'sem etiquetas de fonte no topo');
  semErros(page);
  await page.context().close();
});

test('modo manual: "Atualizar" pede a pasta novamente e não promete monitoramento', async () => {
  const page = await abrir();
  await page.evaluate(() => { delete window.showDirectoryPicker; });
  await page.setInputFiles('#inp-folder', fx('pasta_dedup'));
  await page.waitForSelector('.kpi-value');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#btn-atualizar')]);
  assert.equal(chooser.isMultiple(), true);
  assert.match(await statusTitulo(page), /Selecione a pasta novamente/);
  // sem acesso contínuo, o relógio não dispara leituras
  const antes = await page.evaluate(() => window.__poscorte.state.lastCheck.getTime());
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__poscorte.state.lastCheck.getTime()), antes);
  await page.context().close();
});

/* ------------------------------------------------------------------ */
// Pasta com acesso contínuo: usa uma FileSystemDirectoryHandle real (OPFS) devolvida por um showDirectoryPicker de teste.
const MOCK_PICKER = () => {
  window.showDirectoryPicker = async () => {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle('onedrive', { create: true });
  };
};
async function opfsEscrever(page, nome, buf, sub) {
  await page.evaluate(async ([nome, b64, sub]) => {
    const root = await navigator.storage.getDirectory();
    let dir = await root.getDirectoryHandle('onedrive', { create: true });
    if (sub) dir = await dir.getDirectoryHandle(sub, { create: true });
    const fh = await dir.getFileHandle(nome, { create: true });
    const w = await fh.createWritable();
    await w.write(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    await w.close();
  }, [nome, buf.toString('base64'), sub || null]);
}
async function opfsApagar(page, nome, sub) {
  await page.evaluate(async ([nome, sub]) => {
    const root = await navigator.storage.getDirectory();
    let dir = await root.getDirectoryHandle('onedrive', { create: true });
    if (sub) dir = await dir.getDirectoryHandle(sub);
    await dir.removeEntry(nome);
  }, [nome, sub || null]);
}
const ler = (...p) => fs.readFileSync(fx(...p));
const aguardaTitulo = (page, re) => page.waitForFunction((s) => new RegExp(s).test(document.querySelector('#status .st-title')?.textContent || ''), re.source, { timeout: 30000 });

test('pasta com acesso contínuo: conectar, atualizar, subpastas, arquivo removido e pasta vazia', { timeout: 120000 }, async () => {
  const page = await abrir({ url: baseUrl, initScript: MOCK_PICKER });
  await opfsEscrever(page, 'snapshot_antigo.xlsx', ler('pasta_dedup', 'snapshot_antigo.xlsx'));
  await opfsEscrever(page, '~$snapshot_antigo.xlsx', Buffer.from('lock'));
  await opfsEscrever(page, 'notas.txt', Buffer.from('x'));
  await page.click('#btn-pasta');
  await aguardaTitulo(page, /Base carregada: 200 atividades de 1 arquivo/);
  assert.equal(await page.evaluate(() => window.__poscorte.state.source.mode), 'handle');
  // um segundo arquivo em uma subpasta: soma sem duplicar os 150 repetidos
  await page.waitForTimeout(50);
  await opfsEscrever(page, 'snapshot_novo.xlsx', ler('pasta_dedup', 'sub', 'snapshot_novo.xlsx'), 'sub');
  await page.click('#btn-atualizar');
  const meta = JSON.parse(fs.readFileSync(fx('pasta_dedup', '_esperados.json'), 'utf8'));
  await aguardaTitulo(page, new RegExp(`Base carregada: ${meta.unicos} atividades de 2 arquivos`));
  assert.match(await statusTexto(page), new RegExp(meta.duplicatas + ' duplicatas removidas'));
  assert.equal((await kpis(page))[0], String(meta.unicos));
  // arquivo corrompido entra na pasta: importação parcial, os válidos continuam
  await opfsEscrever(page, 'quebrado.xlsx', ler('truncado.xlsx'));
  await page.click('#btn-atualizar');
  await aguardaTitulo(page, /Importação parcial: 2 de 3 arquivos/);
  assert.match(await statusTexto(page), /quebrado\.xlsx/);
  assert.equal((await kpis(page))[0], String(meta.unicos));
  await opfsApagar(page, 'quebrado.xlsx');
  // arquivo removido da pasta: a base deixa de contá-lo
  await opfsApagar(page, 'snapshot_novo.xlsx', 'sub');
  await page.click('#btn-atualizar');
  await aguardaTitulo(page, /Base carregada: 200 atividades de 1 arquivo/);
  // pasta sem .xlsx: aviso e base anterior mantida
  await opfsApagar(page, 'snapshot_antigo.xlsx');
  await page.click('#btn-atualizar');
  await aguardaTitulo(page, /Nenhum arquivo \.xlsx encontrado/);
  assert.match(await statusTexto(page), /A base anterior foi mantida/);
  assert.equal((await kpis(page))[0], '200');
  semErros(page);
  await page.context().close();
});

test('pasta grande (mais de 40 arquivos): pede confirmação antes de ler e não trava', { timeout: 120000 }, async () => {
  const page = await abrir({ url: baseUrl, initScript: MOCK_PICKER });
  const buf = ler('pequeno_xlsxwriter.xlsx');
  for (let i = 0; i < 41; i++) await opfsEscrever(page, 'copia' + i + '.xlsx', buf);
  await page.click('#btn-pasta');
  await aguardaTitulo(page, /Pasta grande: confirme antes de ler/);
  assert.match(await statusTexto(page), /41 arquivos/);
  assert.equal(await page.locator('.kpi-groups').count(), 0, 'nada é lido antes da confirmação');
  await page.click('#status button:has-text("Ler mesmo assim")');
  await aguardaTitulo(page, /Base carregada: 19 atividades de 41 arquivos/);
  assert.match(await statusTexto(page), /840 duplicatas removidas/);
  // depois de confirmada, atualizações não pedem de novo
  await page.click('#btn-atualizar');
  await page.waitForTimeout(400);
  assert.doesNotMatch(await statusTexto(page), /confirme/);
  semErros(page);
  await page.context().close();
});

test('lê só arquivo novo ou modificado: Atualizar, arquivo novo, arquivo alterado e recarga da página', { timeout: 180000 }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
  const page = await abrir({ ctx, url: baseUrl, initScript: MOCK_PICKER });
  const leitura = () => page.evaluate(() => ({ ...window.__poscorte.state.leitura }));
  // clica em Atualizar e espera a leitura terminar de fato (a data da verificação avança e o painel fica livre)
  const atualizar = async () => {
    const antes = await page.evaluate(() => window.__poscorte.state.lastCheck.getTime());
    await page.click('#btn-atualizar');
    await page.waitForFunction((t) => !window.__poscorte.state.loading && window.__poscorte.state.lastCheck.getTime() > t, antes, { timeout: 30000 });
  };
  await opfsEscrever(page, 'a.xlsx', ler('pasta_dedup', 'snapshot_antigo.xlsx'));
  await opfsEscrever(page, 'b.xlsx', ler('pasta_dedup', 'sub', 'snapshot_novo.xlsx'));
  await page.click('#btn-pasta');
  await aguardaTitulo(page, /Base carregada: \d+ atividades de 2 arquivos/);
  assert.deepEqual(await leitura(), { lidos: 2, salvos: 0, memoria: 0 });

  // Atualizar sem mudanças: nada é lido do disco
  await atualizar();
  assert.deepEqual(await leitura(), { lidos: 0, salvos: 0, memoria: 2 });
  assert.match(await statusTexto(page), /Lidos do arquivo agora: 0 · reaproveitados \(já lidos antes\): 2/);

  // arquivo novo: só ele é lido
  await opfsEscrever(page, 'c.xlsx', ler('pequeno_xlsxwriter.xlsx'));
  await atualizar();
  assert.deepEqual(await leitura(), { lidos: 1, salvos: 0, memoria: 2 });

  // arquivo modificado: só ele é lido de novo
  await opfsEscrever(page, 'c.xlsx', ler('pequeno_1904.xlsx'));
  await atualizar();
  assert.deepEqual(await leitura(), { lidos: 1, salvos: 0, memoria: 2 });

  // recarregar a página: tudo vem do que ficou gravado, nada é lido dos arquivos
  await page.waitForFunction(() => new Promise((res) => {
    const r = indexedDB.open('poscorte', 3);
    r.onsuccess = () => {
      const c = r.result.transaction('arquivos').objectStore('arquivos').getAllKeys();
      c.onsuccess = () => { r.result.close(); const gravadas = new Set(c.result); res([...window.__poscorte.state.cache.keys()].every((k) => gravadas.has(k)) && gravadas.size === 3); };
    };
  }), null, { timeout: 30000 });
  await page.reload();
  await page.waitForFunction(() => window.__poscorte.state.leitura.salvos === 3, null, { timeout: 30000 });
  assert.deepEqual(await leitura(), { lidos: 0, salvos: 3, memoria: 0 });
  assert.ok(await page.locator('.kpi-groups').isVisible());

  // limpar os dados gravados: a leitura seguinte volta a ler tudo
  await page.click('#nav-tabs button[data-view=base]');
  await page.click('text=Limpar dados gravados');
  await page.waitForFunction(() => /Dados gravados apagados/.test(document.querySelector('#status')?.textContent || ''));
  await page.reload();
  await page.waitForFunction(() => window.__poscorte.state.leitura.lidos === 3, null, { timeout: 60000 });
  assert.deepEqual(await leitura(), { lidos: 3, salvos: 0, memoria: 0 });
  semErros(page);
  await ctx.close();
});

test('só Finalizada e Encerrada com Ocorrência contam; arquivo marcado "só completa" perde nas duplicidades', { timeout: 120000 }, async () => {
  const page = await abrir();
  await importar(page, PEQUENO);
  const stat = await page.evaluate(() => window.__poscorte.state.records.map((r) => r.status));
  assert.ok(stat.every((x) => x === 'Finalizada' || x === 'Encerrada com Ocorrência'));
  assert.ok(!(await page.evaluate(() => window.__poscorte.state.records.some((r) => ['24', '25'].includes(r.id)))), 'Cancelada e Paralisada não entram');
  await page.click('#nav-tabs button[data-view=base]');
  assert.match(await page.textContent('#view-base'), /Fora de Finalizada e Encerrada com Ocorrência2 atividades/);
  await page.context().close();

  // dois arquivos com as mesmas atividades e status diferente numa delas
  const meta = JSON.parse(fs.readFileSync(fx('pasta_dedup', '_esperados.json'), 'utf8'));
  const p2 = await abrir();
  await p2.setInputFiles('#inp-files', [fx('pasta_dedup', 'snapshot_antigo.xlsx'), fx('pasta_dedup', 'sub', 'snapshot_novo.xlsx')]);
  await p2.waitForSelector('.kpi-value');
  const statusDe = () => p2.evaluate((id) => window.__poscorte.state.records.find((r) => r.id === id).status, String(meta.status_alterado_id));
  await p2.click('#nav-tabs button[data-view=base]');
  const antes = await statusDe();
  // marca o arquivo que tinha a versão vencedora como complementar: passa a valer a versão do outro
  const linha = p2.locator('#view-base tbody tr', { hasText: 'snapshot_novo.xlsx' }).first();
  await linha.locator('input[type=checkbox]').check();
  await p2.waitForFunction(() => !window.__poscorte.state.loading && window.__poscorte.state.complementares.size === 1, null, { timeout: 30000 });
  const depois = await statusDe();
  assert.notEqual(depois, antes, 'a versão do arquivo não complementar passou a valer');
  assert.match(await p2.textContent('#view-base'), /só completa/);
  // continua valendo depois de recarregar (guardado no navegador)
  assert.match(await p2.evaluate(() => localStorage.getItem('poscorte.complementares')), /snapshot_novo\.xlsx/);
  await p2.context().close();
});

test('somente os serviços dos 9 códigos são carregados e as colunas fora de uso não são lidas', async () => {
  const page = await abrir();
  await importar(page, PEQUENO);
  assert.deepEqual(await kpis(page), KPIS_PEQUENO);
  const ids = await page.evaluate(() => window.__poscorte.state.records.map((r) => r.id));
  assert.ok(!ids.some((i) => ['20', '21', '22'].includes(i)));
  const chaves = await page.evaluate(() => Object.keys(window.__poscorte.state.records[0]).sort());
  assert.ok(!chaves.includes('filled'), 'sem auditoria das demais colunas');
  await page.click('#nav-tabs button[data-view=base]');
  const t = await page.textContent('#view-base');
  assert.match(t, /Serviços considerados/);
  assert.match(t, /110010, 110011, 110012, 210010, 210011, 210012, 310010, 310011, 310012/);
  assert.match(t, /Outros serviços ignorados3 linhas fora dos códigos/);
  assert.doesNotMatch(t, /Auditoria de preenchimento/);
  await page.context().close();
});

test('leitura automática a cada 60 s: só com a página visível e permissão concedida', { timeout: 120000 }, async () => {
  const page = await abrir({ url: baseUrl, initScript: MOCK_PICKER, clock: true });
  await opfsEscrever(page, 'a.xlsx', ler('pasta_dedup', 'snapshot_antigo.xlsx'));
  await page.click('#btn-pasta');
  await aguardaTitulo(page, /Base carregada: 200 atividades/);
  const checagens = () => page.evaluate(() => window.__poscorte.state.lastCheck && window.__poscorte.state.lastCheck.getTime());
  const t0 = await checagens();

  // aba oculta: não lê
  await opfsEscrever(page, 'b.xlsx', ler('pasta_dedup', 'sub', 'snapshot_novo.xlsx'));
  await page.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }));
  await page.clock.runFor(61000);
  await page.waitForTimeout(500);
  assert.equal(await checagens(), t0, 'não deve ler com a aba oculta');
  assert.equal((await kpis(page))[0], '200');

  // aba visível: lê sozinho
  await page.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }));
  await page.clock.runFor(61000);
  const meta = JSON.parse(fs.readFileSync(fx('pasta_dedup', '_esperados.json'), 'utf8'));
  await aguardaTitulo(page, new RegExp(`Pasta atualizada: ${meta.unicos} atividades de 2 arquivos`));

  // sem mudanças: não recarrega nem reaparece mensagem; só registra a verificação
  await page.evaluate(() => { window.__poscorte.state.status = null; document.querySelector('#status').replaceChildren(); });
  const t1 = await checagens();
  await page.clock.runFor(61000);
  await page.waitForFunction((t) => window.__poscorte.state.lastCheck.getTime() > t, t1, { timeout: 30000 });
  assert.equal(await page.textContent('#status'), '', 'sem mudanças não há nova mensagem');

  // permissão expirada: aviso e base preservada
  await page.evaluate(() => { window.__poscorte.state.source.handle.queryPermission = async () => 'prompt'; });
  await page.clock.runFor(61000);
  await aguardaTitulo(page, /Permissão de acesso à pasta expirou/);
  assert.equal((await kpis(page))[0], String(meta.unicos));
  semErros(page);
  await page.context().close();
});

test('a última pasta é lembrada e recarregada ao reabrir o painel (sem guardar os dados)', { timeout: 120000 }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
  const page = await abrir({ ctx, url: baseUrl, initScript: MOCK_PICKER });
  await opfsEscrever(page, 'a.xlsx', ler('pasta_dedup', 'snapshot_antigo.xlsx'));
  await page.click('#btn-pasta');
  await aguardaTitulo(page, /Base carregada: 200 atividades/);
  await page.reload();
  await aguardaTitulo(page, /Base carregada: 200 atividades/);
  // nada de dados em armazenamento do navegador
  const guardado = await page.evaluate(async () => JSON.stringify({ ls: Object.keys(localStorage), ss: Object.keys(sessionStorage) }));
  assert.ok(!/\d{6,}/.test(guardado), 'sem registros no armazenamento local');
  // permissão a confirmar: banner com botão de reconectar
  await page.close();
  const page2 = await ctx.newPage();
  await page2.addInitScript(MOCK_PICKER);
  await page2.addInitScript(() => {
    const orig = FileSystemHandle.prototype.queryPermission;
    FileSystemHandle.prototype.queryPermission = async function () { return 'prompt'; };
    FileSystemHandle.prototype.requestPermission = async function () { return 'granted'; };
  });
  await page2.goto(baseUrl);
  await page2.waitForFunction(() => /Última pasta usada/.test(document.querySelector('#status')?.textContent || ''));
  assert.equal(await page2.locator('.kpi-groups').count(), 0, 'não carrega sem autorização');
  await page2.click('#status button:has-text("Reconectar pasta")');
  await aguardaTitulo(page2, /Base carregada: 200 atividades/);
  await ctx.close();
});

/* ------------------------------------------------------------------ */
for (const [w, h] of [[390, 844], [820, 1000], [1440, 900]]) {
  test(`layout responsivo ${w}px: sem rolagem horizontal, navegação visível e cartões sem sobreposição`, async () => {
    const page = await abrir({ w, h });
    await importar(page, PEQUENO);
    for (const v of ['geral', 'analitico', 'base']) {
      await page.evaluate((v) => document.querySelector(`[data-view=${v}]:not([hidden])`) && null, v);
      const nav = '#nav-tabs';
      await page.click(`${nav} button[data-view=${v}]`);
      await page.waitForTimeout(150);
      const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(sobra <= 0, `${v}: rolagem horizontal de ${sobra}px`);
      const navVisivel = await page.locator(nav).isVisible();
      assert.ok(navVisivel, 'navegação visível');
      const naoCortada = await page.$$eval(`${nav} button`, (bs) => bs.every((b) => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth && r.width > 0; }));
      assert.ok(naoCortada, 'navegação cortada');
    }
    await page.click(`${'#nav-tabs'} button[data-view=geral]`);
    const caixas = await page.$$eval('.kpi', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }));
    for (let i = 0; i < caixas.length; i++) for (let j = i + 1; j < caixas.length; j++) {
      const a = caixas[i], b = caixas[j];
      const inter = a[0] < b[2] - 1 && b[0] < a[2] - 1 && a[1] < b[3] - 1 && b[1] < a[3] - 1;
      assert.ok(!inter, `cartões ${i} e ${j} se sobrepõem`);
    }
    // textos dos cartões e barras não transbordam do próprio cartão
    const transborda = await page.$$eval('.kpi', (els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length);
    assert.equal(transborda, 0, 'texto transbordando nos cartões');
    const larguraCartoes = await page.$$eval('.kpi', (els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
    assert.ok(larguraCartoes.every((x) => x >= 120), 'cartões estreitos demais: ' + larguraCartoes);
    semErros(page);
    await page.context().close();
  });
}

test('cartões em destaque: percorrido, exec, exoc, equipes, assertividade e efetividade', async () => {
  const page = await abrir();
  await importar(page, PEQUENO);
  const t = (k) => kpiTexto(page, k);
  assert.equal(await t('atividades'), 'Percorrido19');
  assert.equal(await t('exec'), 'Total de Exec18');
  assert.equal(await t('exoc'), 'Total de Exoc1');
  assert.equal(await t('equipes'), 'Equipes que trabalharam3');
  assert.equal(await t('assertividade'), 'Assertividade38,9%');
  assert.equal(await t('efetividade'), 'Efetividade27,8%');
  assert.match(await page.getAttribute('[data-fk="kpi:equipes"]', 'data-tip'), /no período filtrado/);
  // equipes de um único dia (3 equipes em 03/07/2026): o valor muda e a dica passa a falar do dia
  await page.fill('#f-from', '2026-07-03');
  await page.fill('#f-to', '2026-07-03');
  assert.equal(await t('equipes'), 'Equipes que trabalharam3');
  assert.match(await page.getAttribute('[data-fk="kpi:equipes"]', 'data-tip'), /no dia filtrado/);
  await page.fill('#f-from', '2026-08-10');
  await page.fill('#f-to', '2026-08-10');
  assert.equal(await t('equipes'), 'Equipes que trabalharam1');
  // sem Exec no filtro: divisão protegida
  await page.fill('#f-from', '2026-09-28');
  await page.fill('#f-to', '2026-09-28');
  assert.match(await t('assertividade'), /Assertividade(0,0%|—)/);
  // cartões informativos não abrem o analítico; os de indicador abrem
  await page.click('#chips button.ghost');
  await page.click('[data-fk="kpi:equipes"]');
  assert.ok(await page.locator('#view-geral').isVisible());
  semErros(page);
  await page.context().close();
});

test('resultados por cidade: sem produtividade, total e filtro por clique', async () => {
  const page = await abrir();
  await importar(page, PEQUENO);
  const linhas = await page.$$eval('section[aria-labelledby=h-cidades] tbody tr', (trs) => trs.map((tr) => [...tr.children].map((c) => c.textContent.trim())));
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0][0], 'Cidade Norte');
  assert.equal(linhas[0][1], '19');
  assert.equal(linhas[0].length, 9, 'sem colunas de equipe-dias e produtividade');
  const total = await page.$$eval('section[aria-labelledby=h-cidades] tfoot td', (tds) => tds.map((c) => c.textContent.trim()));
  assert.equal(total.length, 9);
  assert.doesNotMatch(await page.textContent('section[aria-labelledby=h-cidades]'), /[Pp]rodutividade/);
  await page.click('[data-fk="cid:Cidade Norte"]');
  assert.equal(await page.inputValue('#f-cidade'), 'Cidade Norte');
  await page.click('[data-fk="cid:Cidade Norte"]');
  assert.equal(await page.inputValue('#f-cidade'), '');
  await page.context().close();
});

test('exportar Excel pelo botão: baixa um .xlsx válido com o filtro aplicado', async () => {
  const py = require('node:child_process').spawnSync('python3', ['-c', 'import openpyxl'], { encoding: 'utf8' });
  const page = await abrir();
  await importar(page, PEQUENO);
  assert.ok(await page.locator('#btn-excel').isEnabled());
  await page.fill('#f-from', '2026-07-01');
  await page.fill('#f-to', '2026-07-31');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-excel')]);
  assert.match(dl.suggestedFilename(), /^pos-corte-interior_\d{8}_\d{4}\.xlsx$/);
  const arq = require('node:path').join(require('node:os').tmpdir(), 'pc-ui-' + process.pid + '.xlsx');
  await dl.saveAs(arq);
  const buf = fs.readFileSync(arq);
  assert.equal(buf.subarray(0, 2).toString(), 'PK');
  if (py.status === 0) {
    const o = require('node:child_process').spawnSync('python3', ['-c', `
import openpyxl, sys, json
wb = openpyxl.load_workbook(sys.argv[1]); r = wb['Resumo']
print(json.dumps({'filtros': r['B5'].value, 'percorrido': r['B8'].value, 'registros': wb['Registros'].max_row - 1, 'abas': wb.sheetnames}, default=str))`, arq], { encoding: 'utf8' });
    const x = JSON.parse(o.stdout);
    assert.equal(x.percorrido, 17, 'só julho');
    assert.equal(x.registros, 17);
    assert.match(x.filtros, /Período: 01\/07\/2026 a 31\/07\/2026/);
    assert.equal(x.abas.length, 7);
  }
  // sem dados o botão fica desativado
  const vazia = await abrir();
  assert.ok(await vazia.locator('#btn-excel').isDisabled());
  assert.ok(await vazia.locator('#btn-pdf').isDisabled());
  semErros(page);
  await page.context().close();
  await vazia.context().close();
});

test('exportar PDF: o botão abre a impressão da Visão geral e o layout de impressão é compacto', async () => {
  const page = await abrir();
  await importar(page, PEQUENO);
  await page.evaluate(() => { window.__prints = []; window.print = () => window.__prints.push(document.querySelector('#view-geral').hidden ? 'oculta' : 'geral'); });
  await page.click('#btn-pdf');
  assert.deepEqual(await page.evaluate(() => window.__prints), ['geral']);
  // estando em outra aba, volta para a Visão geral antes de imprimir
  await page.click('#nav-tabs button[data-view=analitico]');
  await page.click('#btn-pdf');
  await page.waitForFunction(() => window.__prints.length === 2);
  assert.deepEqual(await page.evaluate(() => window.__prints), ['geral', 'geral']);
  // layout de impressão
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  for (const sel of ['.topbar', '.actions', '.filters', '#nav-tabs', '#view-analitico']) {
    assert.equal(await page.locator(sel).first().isVisible(), false, sel + ' oculto na impressão');
  }
  assert.ok(await page.locator('#print-head').isVisible());
  assert.match(await page.textContent('#print-head'), /Pós-Corte Interior.*Período dos dados: 03\/07\/2026 a 28\/09\/2026.*Filtros: nenhum/);
  assert.ok(await page.locator('.kpi-groups').isVisible());
  // "Recortes realizados" fica fora do PDF; os demais blocos (inclusive Valores negociados) continuam
  assert.equal(await page.locator('.card-recorte').isVisible(), false, 'Recortes realizados oculto na impressão');
  assert.ok(await page.locator('.card-valores').isVisible(), 'Valores negociados segue no PDF');
  assert.ok(await page.locator('.card-negtermo').isVisible());
  // produção mensal ao lado de negociações e termos, ocupando a largura da folha
  const lado = await page.$$eval('.card-mensal, .card-negtermo', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) }; }));
  assert.equal(lado.length, 2);
  assert.equal(lado[0].y, lado[1].y, 'mesma linha na impressão');
  assert.ok(lado[1].x > lado[0].x + lado[0].w - 2, 'um ao lado do outro na impressão');
  await page.emulateMedia({ media: 'screen' });
  assert.ok(await page.locator('.card-recorte').isVisible(), 'na tela o bloco de Recortes realizados continua');
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ format: 'A4', landscape: true, printBackground: true });
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  const paginas = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert.ok(paginas >= 1 && paginas <= 4, 'páginas: ' + paginas);
  semErros(page);
  await page.context().close();
});

test('exportar PDF: produção mensal e negociações e termos ocupam o fim da primeira folha (base grande, 9 meses)', { timeout: 120000 }, async () => {
  const page = await abrir();
  await importar(page, [fx('grande_sintetico.xlsx'), fx('Cadastro_grande.xlsx')]);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true });
  const arq = require('node:path').join(require('node:os').tmpdir(), 'pc-pdf-' + process.pid + '-' + Date.now() + '.pdf');
  fs.writeFileSync(arq, pdf);
  const txt = require('node:child_process').spawnSync('pdftotext', ['-layout', '-f', '1', '-l', '1', arq, '-'], { encoding: 'utf8' });
  if (txt.status === 0) { // poppler disponível: confere o que cai na primeira folha
    assert.match(txt.stdout, /Valores negociados/);
    assert.match(txt.stdout, /Produção mensal/, 'produção mensal na primeira folha');
    assert.match(txt.stdout, /Negociações e termos aplicados por mês/, 'negociações e termos na primeira folha');
    assert.doesNotMatch(txt.stdout, /Resultados por cidade/);
  }
  const paginas = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert.ok(paginas <= 3, 'páginas: ' + paginas + ' (antes de aproveitar a primeira folha eram 4)');
  fs.unlinkSync(arq);
  semErros(page);
  await page.context().close();
});

test('nome do painel e abas: Pós-Corte Interior; Visão geral, Analítico e Arquivos e regras', async () => {
  const page = await abrir();
  assert.equal(await page.title(), 'Pós-Corte Interior');
  assert.equal(await page.textContent('h1'), 'Pós-Corte Interior');
  assert.match(await page.textContent('.title h1'), /Pós-Corte Interior/);
  assert.deepEqual(await page.$$eval('#nav-tabs button', (bs) => bs.map((b) => b.textContent.trim())), ['Visão geral', 'Bases de campo', 'Analítico', 'Arquivos e regras']);
  await page.context().close();
});

test('teclado: cartão e barras acessíveis; foco preservado após filtrar', async () => {
  const page = await abrir();
  await importar(page, PEQUENO);
  await page.focus('.mgroup[data-fk="mesnt:2026-07"]');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.fk), 'mesnt:2026-07', 'foco mantido depois de re-renderizar');
  assert.equal((await kpis(page))[0], '17');
  assert.equal(await page.getAttribute('.mgroup[data-fk="mesnt:2026-07"]', 'aria-pressed'), 'true');
  await page.keyboard.press('Space');
  assert.equal((await kpis(page))[0], '19');
  await page.focus('.kpi[data-fk="kpi:exoc"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#an-tabela table');
  assert.equal(await page.inputValue('#an-ind'), 'exoc');
  assert.match(await page.textContent('#an-contagem'), /^1 registro /);
  // dica ao focar por teclado
  await page.click('#nav-tabs button[data-view=geral]');
  await page.keyboard.press('Tab');
  semErros(page);
  await page.context().close();
});

test('Base e regras: fonte, conferências, colunas, frentes e regras em português', async () => {
  const page = await abrir();
  await importar(page, PEQUENO);
  await page.click('#nav-tabs button[data-view=base]');
  const t = await page.textContent('#view-base');
  for (const trecho of [
    'Fonte e arquivos lidos', 'Conferências automáticas', 'Colunas reconhecidas', 'Frentes de serviço',
    'Regras dos indicadores', '110013', '310013', 'Sem Desdobro', 'débito informado', 'Não é arrecadação',
    'pequeno_xlsxwriter.xlsx', '21 de 21 colunas reconhecidas', 'Termos: conciliado com a aba Pós Corte com Termo (7)',
  ]) assert.ok(t.includes(trecho), trecho);
  assert.match(t, /1 atividades em "Não mapeada"|1 atividade em "Não mapeada"|Recursos sem Nomenclatura correspondente: QQ-01 \(1\)/);
  semErros(page);
  await page.context().close();
});

/* ---------- Bases de campo ---------- */
const BASE_CAMPO = fx('Base_Campo_28_09_2026.xlsx');
const BASE_SEM_CHAVE = fx('Base_Sem_Chave.xlsx');
const miniTxt = (page, k) => page.textContent(`.basecard [data-bk="${k}"] .mini-value`);

test('bases de campo: subir base, cruzamento por protocolo, recortes, pastas por mês/data, Excel do que falta e persistência', { timeout: 120000 }, async () => {
  const page = await abrir();
  await importar(page, PEQUENO);
  await page.click('#nav-tabs button[data-view=bases]');
  assert.ok(await page.locator('#filters').isHidden(), 'filtros não valem para as bases');
  assert.match(await page.textContent('#view-bases'), /Nenhuma base enviada ainda/);
  // base sem coluna de chave é recusada com mensagem clara
  await page.setInputFiles('#inp-bases', BASE_SEM_CHAVE);
  await page.waitForFunction(() => /Nenhuma base foi enviada/.test(document.querySelector('#status').textContent));
  assert.match(await statusTexto(page), /precisa ter a coluna "Matrícula"/);
  assert.equal(await page.locator('.basecard').count(), 0);
  // base válida: data 28/09/2026 (do nome) => cruza pela Matrícula só com o realizado a partir dela (ID 17, matrícula 1001)
  await page.setInputFiles('#inp-bases', BASE_CAMPO);
  await page.waitForSelector('.basecard');
  assert.equal(await page.textContent('.basecard h3'), 'Base_Campo_28_09_2026.xlsx');
  assert.equal(await miniTxt(page, 'total'), '4', 'OS1, OS2, OS3 e a linha sem chave (OS2 repetida conta uma vez)');
  assert.match(await page.textContent('.basecard [data-bk=total] .mini-sub'), /matrículas distintas de 5 linhas \(1 repetida\)/);
  assert.match(await page.textContent('.basecard'), /Linhas repetidas: a base tem 5 linhas, mas 1 repete uma matrícula já listada/);
  assert.equal(await page.locator('.basecard [data-bk=semDesdobro]').count(), 0, 'sem card de desdobro nas bases');
  assert.equal(await miniTxt(page, 'percorrido'), '1');
  assert.equal(await miniTxt(page, 'faltam'), '3');
  assert.equal(await miniTxt(page, 'exec'), '1');
  assert.equal(await miniTxt(page, 'exoc'), '0');
  assert.equal(await miniTxt(page, 'termos'), '0');
  assert.equal(await miniTxt(page, 'neg'), '0');
  assert.equal(await miniTxt(page, 'equipes'), '1');
  assert.equal(await miniTxt(page, 'assertividade'), '0,0%');
  assert.match(await page.textContent('.basecard'), /25,0% percorrido/);
  const hoje = await page.evaluate(() => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear(); });
  assert.equal(await miniTxt(page, 'subiu'), hoje);
  // pastas: mês > data em que subiu
  assert.equal(await page.locator('details.pasta-mes').count(), 1);
  assert.equal(await page.locator('details.pasta-mes details.pasta-dia').count(), 1);
  assert.match(await page.textContent('details.pasta-dia > summary'), new RegExp('Subiu em ' + hoje.replace(/\//g, '\\/')));
  // trocar a data da base recalcula: a partir de 29/09 nada foi percorrido; limpar a data considera qualquer data
  await page.fill('.basecard input[type=date]', '2026-09-29');
  await page.waitForFunction(() => document.querySelector('.basecard [data-bk="percorrido"] .mini-value').textContent === '0');
  assert.equal(await miniTxt(page, 'faltam'), '4');
  await page.fill('.basecard input[type=date]', '2026-09-28');
  await page.waitForFunction(() => document.querySelector('.basecard [data-bk="percorrido"] .mini-value').textContent === '1');
  // card de recortes: sem recorte na atividade mais recente de 1001 => zero; depois marca um recorte no ramal e confere % e tipos
  assert.equal(await page.textContent('.basecard [data-rk=total]'), '0');
  assert.match(await page.textContent('.basecard [data-rk=pct]'), /0,0% do Exec/);
  await page.evaluate(() => {
    const st = window.__poscorte.state;
    const ultimo = st.records.reduce((a, r) => (!a || r.data > a.data ? r : a), null);
    st.records = st.records.map((r) => (r === ultimo ? { ...r, recorte: true, recorteTipo: 'RAMAL' } : r));
  });
  await page.click('#nav-tabs button[data-view=geral]');
  await page.click('#nav-tabs button[data-view=bases]');
  assert.equal(await page.textContent('.basecard [data-rk=total]'), '1');
  assert.match(await page.textContent('.basecard [data-rk=pct]'), /100,0% do Exec \(Total recorte ÷ Exec\)/);
  assert.match(await page.textContent('.basecard .rc-row[data-tipo=RAMAL]'), /Corte no Ramal.*100,0% · 1/);
  // Excel do que falta: aba com as 3 linhas pendentes e o cabeçalho da base
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('.basecard [data-act=baixar]')]);
  assert.match(download.suggestedFilename(), /^faltam-percorrer_Base_Campo_28_09_2026_\d{8}\.xlsx$/);
  const arq = require('node:path').join(require('node:os').tmpdir(), 'faltam-' + process.pid + '.xlsx');
  await download.saveAs(arq);
  assert.equal(fs.readFileSync(arq).subarray(0, 2).toString(), 'PK');
  const py = require('node:child_process').spawnSync('python3', ['-c', 'import openpyxl'], { encoding: 'utf8' });
  if (py.status === 0) {
    const o = require('node:child_process').spawnSync('python3', ['-c', `
import openpyxl, sys, json
wb = openpyxl.load_workbook(sys.argv[1]); f = wb['Faltam percorrer']; r = wb['Resumo da base']
print(json.dumps({'abas': wb.sheetnames, 'linhas': [[c.value for c in row] for row in f.iter_rows()], 'total': r['B8'].value, 'faltam': r['B10'].value}, default=str))`, arq], { encoding: 'utf8' });
    const x = JSON.parse(o.stdout);
    assert.deepEqual(x.abas, ['Resumo da base', 'Faltam percorrer']);
    assert.deepEqual(x.linhas.map((l) => l[0]), ['Cód. Protocolo Origem', 'OS2', 'OS3', null]);
    assert.equal(x.linhas[0].length, 5, 'todas as colunas da base');
    assert.equal(x.total, 4);
    assert.equal(x.faltam, 3);
  }
  fs.unlinkSync(arq);
  // persistência: recarregar a página mantém a base (e "Limpar dados gravados" não a apaga)
  await page.reload();
  await page.click('#nav-tabs button[data-view=bases]');
  await page.waitForSelector('.basecard');
  assert.equal(await page.textContent('.basecard h3'), 'Base_Campo_28_09_2026.xlsx');
  assert.equal(await miniTxt(page, 'total'), '4');
  assert.equal(await miniTxt(page, 'percorrido'), '0', 'sem o realizado carregado nada foi percorrido');
  assert.match(await page.textContent('.basecard'), /conecte a pasta/);
  // excluir
  page.once('dialog', (d) => d.accept());
  await page.click('.basecard button[aria-label^="Excluir"]');
  await page.waitForSelector('#view-bases .empty');
  await page.context().close();
});
