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
const kpis = (page) => page.$$eval('.kpi-value', (els) => els.map((e) => e.textContent));
async function importar(page, arquivos, esperaKpis = true) {
  await page.setInputFiles('#inp-files', arquivos);
  if (esperaKpis) await page.waitForSelector('.kpi-value');
}
const statusTitulo = (page) => page.textContent('#status .st-title');
const statusTexto = (page) => page.textContent('#status');
const PEQUENO = fx('pequeno_xlsxwriter.xlsx');
const KPIS_PEQUENO = ['19', '18', '1', '5', '7', '2'];

/* ------------------------------------------------------------------ */
test('estado inicial: sem dados incorporados, com instruções e sem erros', async () => {
  const page = await abrir();
  assert.match(await page.textContent('#view-geral'), /Nenhuma base carregada/);
  for (const [id, t] of [['#btn-pasta', 'Conectar pasta'], ['#btn-atualizar', 'Atualizar'], ['#btn-importar', 'Importar Excel']]) {
    assert.ok(await page.locator(id).isVisible(), t);
    assert.match(await page.textContent(id), new RegExp(t));
  }
  assert.equal(await page.locator('.kpis').count(), 0);
  assert.ok(await page.locator('#filters').isHidden());
  semErros(page);
  await page.context().close();
});

test('importar Excel: cartões, gráficos e tabela mensal calculados a partir dos registros', async () => {
  const page = await abrir();
  await importar(page, PEQUENO);
  assert.deepEqual(await kpis(page), KPIS_PEQUENO);
  assert.match(await statusTitulo(page), /Base carregada: 19 atividades de 1 arquivo/);
  // sub-textos
  const sub = await page.$$eval('.kpi', (els) => els.map((e) => e.textContent));
  assert.match(sub[3], /Débito informado: R\$\s2\.535,06/);
  assert.match(sub[4], /110013 Serviços: 6 · 310013 VCG: 2/);
  assert.match(sub[5], /Parte das negociações/);
  // tabela mensal
  const linhas = await page.$$eval('section[aria-labelledby=h-tm] .table-wrap tbody tr', (trs) => trs.map((tr) => [...tr.children].map((c) => c.textContent)));
  assert.deepEqual(linhas.map((l) => l[0]), ['jul/2026', 'ago/2026', 'set/2026']);
  assert.equal(linhas[0][1], '17');
  const total = await page.$$eval('section[aria-labelledby=h-tm] .table-wrap tfoot td', (tds) => tds.map((c) => c.textContent));
  assert.deepEqual(total.slice(0, 7), ['Total', '19', '18', '1', '5', '2', '7']);
  // gráficos com legenda e alternativa em tabela
  assert.ok(await page.locator('.legend').first().isVisible());
  // rankings conciliam com o total
  for (const id of ['h-frente', 'h-cidade', 'h-recurso']) {
    const soma = await page.$$eval(`section[aria-labelledby=${id}] .rank-list .rv`, (els) => els.reduce((a, e) => a + parseInt(e.firstChild.textContent.replace(/\./g, ''), 10), 0));
    assert.equal(soma, 19, id);
  }
  // nada de HTML injetado a partir dos dados
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  semErros(page);
  await page.context().close();
});

test('filtros: mês, ranking, datas, seletores, chips e limpar', async () => {
  const page = await abrir();
  await importar(page, PEQUENO);
  // clicar no mês filtra e clicar de novo limpa
  await page.click('.brow[data-fk="mes:2026-07"]');
  assert.deepEqual((await kpis(page))[0], '17');
  assert.match(await page.textContent('#chips'), /Período: 01\/07\/2026 a 31\/07\/2026/);
  assert.equal(await page.inputValue('#f-from'), '2026-07-01');
  await page.click('.brow[data-fk="mes:2026-07"]');
  assert.equal((await kpis(page))[0], '19');
  // agosto mostra somente agosto
  await page.fill('#f-from', '2026-08-01');
  await page.fill('#f-to', '2026-08-31');
  assert.deepEqual(await kpis(page), ['1', '1', '0', '0', '0', '0']);
  assert.equal(await page.locator('.brow[data-fk^="mes:"]').count(), 1);
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
  const mensal = await page.$$eval('section[aria-labelledby=h-mensal] .bval', (els) => els.map((e) => e.textContent));
  assert.deepEqual(mensal, ['7', '0', '0']);
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
  assert.deepEqual(await kpis(page), ['8.136', '7.461', '675', '230', '389', '2']);
  await page.click('#nav-side button[data-view=analitico]');
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
  await page.click('#nav-side button[data-view=base]');
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
  await page.waitForFunction(() => /indisponível em 1 arquivo/.test(document.querySelector('.kpis').textContent));
  const cards = await page.$$eval('.kpi', (els) => els.map((e) => e.textContent));
  assert.match(cards[4], /indisponível em 1 arquivo/);
  assert.match(cards[5], /indisponível em 1 arquivo/);
  assert.doesNotMatch(cards[3], /indisponível/);
  assert.equal((await kpis(page))[5], '0', 'sem a coluna ninguém vira Sem Desdobro');
  assert.match(await statusTexto(page), /Termos não pôde ser calculado em: sem_coluna_servadic\.xlsx/);
  await page.context().close();
});

test('nomes alternativos de colunas: cadastro na tela reprocessa os arquivos selecionados', async () => {
  const page = await abrir();
  await importar(page, fx('leve_nomes_diferentes.xlsx'), false);
  await page.waitForFunction(() => /Nenhuma base válida/.test(document.querySelector('#status').textContent));
  assert.match(await statusTexto(page), /nenhuma aba tem as colunas esperadas/);
  await page.click('#nav-side button[data-view=base]');
  const alias = { recurso: 'Equipe', data: 'Dt', status: 'Situação', cidade: 'Município', valor: 'Débito', negociou: 'Negociou?', servAdic: 'Serviços adicionais' };
  for (const [campo, nome] of Object.entries(alias)) {
    await page.selectOption('#al-campo', campo);
    await page.fill('#al-nome', nome);
    await page.click('text=Adicionar e reler');
    await page.waitForFunction(() => !document.querySelector('#btn-atualizar svg.spin'));
  }
  await page.click('#nav-side button[data-view=geral]');
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
  assert.match(await page.textContent('#side-foot'), /Seleção manual/);
  semErros(page);
  await page.context().close();
});

test('modo manual: "Atualizar" pede a pasta novamente e não promete monitoramento', async () => {
  const page = await abrir();
  await page.evaluate(() => { delete window.showDirectoryPicker; });
  await page.setInputFiles('#inp-folder', fx('pasta_dedup'));
  await page.waitForSelector('.kpi-value');
  assert.match(await page.textContent('#side-foot'), /Seleção manual \(sem monitoramento\)/);
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
  assert.match(await page.textContent('#side-foot'), /Acesso contínuo/);
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
  assert.equal(await page.locator('.kpis').count(), 0, 'nada é lido antes da confirmação');
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
    const r = indexedDB.open('poscorte', 2);
    r.onsuccess = () => {
      const c = r.result.transaction('arquivos').objectStore('arquivos').getAllKeys();
      c.onsuccess = () => { r.result.close(); const gravadas = new Set(c.result); res([...window.__poscorte.state.cache.keys()].every((k) => gravadas.has(k)) && gravadas.size === 3); };
    };
  }), null, { timeout: 30000 });
  await page.reload();
  await page.waitForFunction(() => window.__poscorte.state.leitura.salvos === 3, null, { timeout: 30000 });
  assert.deepEqual(await leitura(), { lidos: 0, salvos: 3, memoria: 0 });
  assert.ok(await page.locator('.kpis').isVisible());

  // limpar os dados gravados: a leitura seguinte volta a ler tudo
  await page.click('#nav-side button[data-view=base]');
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
  await page.click('#nav-side button[data-view=base]');
  assert.match(await page.textContent('#view-base'), /Fora de Finalizada e Encerrada com Ocorrência2 atividades/);
  await page.context().close();

  // dois arquivos com as mesmas atividades e status diferente numa delas
  const meta = JSON.parse(fs.readFileSync(fx('pasta_dedup', '_esperados.json'), 'utf8'));
  const p2 = await abrir();
  await p2.setInputFiles('#inp-files', [fx('pasta_dedup', 'snapshot_antigo.xlsx'), fx('pasta_dedup', 'sub', 'snapshot_novo.xlsx')]);
  await p2.waitForSelector('.kpi-value');
  const statusDe = () => p2.evaluate((id) => window.__poscorte.state.records.find((r) => r.id === id).status, String(meta.status_alterado_id));
  await p2.click('#nav-side button[data-view=base]');
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
  await page.click('#nav-side button[data-view=base]');
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
  assert.match(await page.textContent('#side-foot'), /Pasta.*onedrive/);
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
  assert.equal(await page2.locator('.kpis').count(), 0, 'não carrega sem autorização');
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
      const nav = w >= 960 ? '#nav-side' : '#nav-bottom';
      await page.click(`${nav} button[data-view=${v}]`);
      await page.waitForTimeout(150);
      const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(sobra <= 0, `${v}: rolagem horizontal de ${sobra}px`);
      const navVisivel = await page.locator(nav).isVisible();
      assert.ok(navVisivel, 'navegação visível');
      const naoCortada = await page.$$eval(`${nav} button`, (bs) => bs.every((b) => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth && r.width > 0; }));
      assert.ok(naoCortada, 'navegação cortada');
    }
    await page.click(`${w >= 960 ? '#nav-side' : '#nav-bottom'} button[data-view=geral]`);
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

test('teclado: cartão e barras acessíveis; foco preservado após filtrar', async () => {
  const page = await abrir();
  await importar(page, PEQUENO);
  await page.focus('.brow[data-fk="mes:2026-07"]');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.fk), 'mes:2026-07', 'foco mantido depois de re-renderizar');
  assert.equal((await kpis(page))[0], '17');
  assert.equal(await page.getAttribute('.brow[data-fk="mes:2026-07"]', 'aria-pressed'), 'true');
  await page.keyboard.press('Space');
  assert.equal((await kpis(page))[0], '19');
  await page.focus('.kpi[data-fk="kpi:exoc"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#an-tabela table');
  assert.equal(await page.inputValue('#an-ind'), 'exoc');
  assert.match(await page.textContent('#an-contagem'), /^1 registro /);
  // dica ao focar por teclado
  await page.click('#nav-side button[data-view=geral]');
  await page.keyboard.press('Tab');
  semErros(page);
  await page.context().close();
});

test('Base e regras: fonte, conferências, colunas, frentes e regras em português', async () => {
  const page = await abrir();
  await importar(page, PEQUENO);
  await page.click('#nav-side button[data-view=base]');
  const t = await page.textContent('#view-base');
  for (const trecho of [
    'Fonte e arquivos lidos', 'Conferências automáticas', 'Colunas reconhecidas', 'Frentes de serviço',
    'Regras dos indicadores', '110013', '310013', 'Sem Desdobro', 'débito informado', 'Não é arrecadação',
    'pequeno_xlsxwriter.xlsx', '19 de 19 colunas reconhecidas', 'Termos: conciliado com a aba Pós Corte com Termo (7)',
  ]) assert.ok(t.includes(trecho), trecho);
  assert.match(t, /1 atividades em "Não mapeada"|1 atividade em "Não mapeada"|Recursos sem Nomenclatura correspondente: QQ-01 \(1\)/);
  semErros(page);
  await page.context().close();
});
