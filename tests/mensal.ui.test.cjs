// Testes do painel Mensal Comercial (Chromium/Playwright). Executam o HTML gerado por `node mensal-comercial/build.mjs`.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let playwright;
try { playwright = require('playwright'); } catch (_) { playwright = require('/opt/node22/lib/node_modules/playwright'); }
const { chromium } = playwright;

const RAIZ = path.resolve(__dirname, '..');
const HTML = path.join(RAIZ, 'mensal-comercial', 'Dashboard_Mensal_Comercial.html');
const DADOS = path.join(RAIZ, 'mensal-comercial', 'dados', '2026-09-29.json');
const URL = 'file://' + HTML;

let browser;
test.before(async () => {
  assert.ok(fs.existsSync(HTML), 'rode `node mensal-comercial/build.mjs` antes dos testes');
  browser = await chromium.launch({ args: ['--no-sandbox'], executablePath: process.env.CHROMIUM_PATH || undefined });
});
test.after(async () => { await browser.close(); });

async function abrir(opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1440, height: 900 }, colorScheme: opts.colorScheme || 'light', permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  const problemas = [];
  page.on('pageerror', (e) => problemas.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problemas.push(m.type() + ': ' + m.text()); });
  page.on('request', (r) => { if (!/^(file|data):/.test(r.url())) problemas.push('rede: ' + r.url()); });
  await page.goto(URL);
  return { ctx, page, problemas };
}
const texto = async (page, sel) => (await page.locator(sel).innerText()).replace(/\u00a0/g, ' '); // Intl usa espaço não separável em "R$ 1,00"
const esperar = (page, fn, arg) => page.waitForFunction(fn, arg, { timeout: 5000 }); // FileReader é assíncrono

test('abre sem erro de console e sem nenhuma requisição de rede, com as 6 abas', async () => {
  const { ctx, page, problemas } = await abrir();
  const abas = await page.locator('[role=tab]').allInnerTexts();
  assert.deepEqual(abas.map((t) => t.replace(/\s*\d+$/, '')), ['Resumo do dia', 'Corte e religação', 'Negociações', 'Metas', 'Conferência', 'Dicionário']);
  for (const id of ['resumo', 'operacao', 'negociacoes', 'metas', 'conferencia', 'dicionario']) {
    await page.click('#tab-' + id);
    assert.ok((await texto(page, '#main')).length > 200, 'aba vazia: ' + id);
    assert.equal(await page.locator('#tab-' + id).getAttribute('aria-selected'), 'true');
  }
  assert.deepEqual(problemas, []);
  await ctx.close();
});

test('Resumo mostra os números do PDF (taxa 91,0%, 498/453/45, 131 negociações, ticket)', async () => {
  const { ctx, page } = await abrir();
  const t = await texto(page, '#main');
  for (const esperado of ['91,0%', '498', '453', '45', '57', '131', 'R$ 443,55', '318']) assert.ok(t.includes(esperado), 'faltou ' + esperado);
  assert.match(t, /453 executadas de 498/);
  assert.match(t, /Verificação Cadastral tem a menor taxa: 76,3%/);
  assert.match(t, /23 das 45 ocorrências do dia \(51%\)/);
  assert.match(t, /3 cidades concentram 72%/);
  assert.match(t, /2 equipes geram 31%/);
  assert.match(t, /Corte e Religa: 7% das negociações, 29% do valor/);
  assert.match(t, /75% das execuções estão em serviços sem meta/);
  await ctx.close();
});

test('as conferências automáticas classificam cada regra como esperado', async () => {
  const { ctx, page } = await abrir();
  const conf = await page.evaluate(() => window.__mc.CONF.map((c) => ({ id: c.id, status: c.status, esperado: c.esperado, encontrado: c.encontrado })));
  const por = Object.fromEntries(conf.map((c) => [c.id, c]));
  const ok = ['exec', 'exoc', 'perc', 'taxa', 'meta_corte', 'meta_relig', 'real_corte', 'real_relig', 'corte_visoes', 'relig_frentes', 'neg_ass', 'neg_comp', 'ticket', 'perfis'];
  const alerta = ['pos_corte', 'equipes', 'ass', 'prog', 'dif', 'motivos', 'termos', 'neg_qtd', 'neg_val', 'sem_perfil', 'tipo_os', 'neg_pc', 'neg_corte'];
  const info = ['top10', 'trunc', 'orcado', 'serie', 'vendas'];
  for (const id of ok) assert.equal(por[id].status, 'ok', id);
  for (const id of alerta) assert.equal(por[id].status, 'alerta', id);
  for (const id of info) assert.equal(por[id].status, 'info', id);
  assert.equal(conf.length, ok.length + alerta.length + info.length);
  assert.match(por.neg_val.encontrado, /322,83/);
  assert.match(por.motivos.encontrado, /66/);
  assert.match(por.ass.encontrado, /92,3%/); // Corte e Religa recalculado: 36 / 39
  assert.equal(await page.locator('#tab-conferencia .badge').innerText(), String(alerta.length));
  await ctx.close();
});

test('a conta do "% Ass." do relatório é reproduzida pela razão total ÷ linha', async () => {
  const { ctx, page } = await abrir();
  const r = await page.evaluate(() => {
    const D = window.__mc.C.D, T = 42 / 46;
    const cid = D.corte_por_cidade.linhas.map((l) => [l.cidade, +(T / (l.exec / (l.exec + l.exoc)) * 100).toFixed(2), l.ass_relatorio]);
    return cid;
  });
  for (const [, calc, rel] of r) assert.ok(Math.abs(calc / 100 - rel) < 0.0006, `${calc} vs ${rel}`);
  await ctx.close();
});

test('soma das cidades = 131 e R$ 58.104,64; total exibido 132 e R$ 58.427,47', async () => {
  const { ctx, page } = await abrir();
  const r = await page.evaluate(() => ({ q: window.__mc.C.negQtd, v: +window.__mc.C.negVal.toFixed(2), t: window.__mc.C.D.negociacoes.valores.total }));
  assert.equal(r.q, 131); assert.equal(r.v, 58104.64); assert.equal(r.t, 58427.47);
  await ctx.close();
});

test('cidade em foco: abre a ficha no Resumo e destaca a linha nas tabelas', async () => {
  const { ctx, page } = await abrir();
  await page.selectOption('#selCidade', 'MIRACEMA');
  assert.match(await texto(page, '#main'), /Ficha de Miracema/);
  assert.match(await texto(page, '#main'), /Cortes executados\s*13/);
  await page.click('#tab-negociacoes');
  assert.equal(await page.locator('tr.sel').count(), 1);
  assert.match(await page.locator('tr.sel').innerText(), /Miracema/);
  await page.click('.pill button'); // limpar
  assert.equal(await page.locator('tr.sel').count(), 0);
  // clicar na linha também foca
  await page.click('tbody tr:has-text("Cantagalo")');
  assert.equal(await page.locator('#selCidade').inputValue(), 'CANTAGALO');
  await ctx.close();
});

test('cidades: alternar a métrica reordena a tabela', async () => {
  const { ctx, page } = await abrir();
  await page.click('#tab-negociacoes');
  const primeira = () => page.locator('.card:has(h2:text-is("Cidades")) tbody tr').first().innerText();
  assert.match(await primeira(), /Itaocará/);          // maior valor
  await page.click('button:has-text("Negociações"):not([role=tab])');
  assert.match(await primeira(), /Miracema/);          // maior quantidade (30)
  await page.click('.seg-ctl button:has-text("Ticket médio")');
  assert.match(await primeira(), /Itaocará/);          // maior ticket
  await ctx.close();
});

test('perfil do cliente expande e recolhe as frentes', async () => {
  const { ctx, page } = await abrir();
  await page.click('#tab-negociacoes');
  assert.equal(await page.locator('tr.filho').count(), 3); // Inadimplente aberto por padrão
  await page.click('button.exp[aria-label="Expandir Adimplente"]');
  assert.equal(await page.locator('tr.filho').count(), 6);
  await page.click('button.exp[aria-label="Recolher Inadimplente"]');
  assert.equal(await page.locator('tr.filho').count(), 3);
  await ctx.close();
});

test('metas: dias úteis mudam a meta diária e o atingimento', async () => {
  const { ctx, page } = await abrir();
  await page.click('#tab-metas');
  const linha = () => page.locator('tbody tr:has-text("Termos aplicados")').innerText();
  assert.match(await linha(), /14,5/); assert.match(await linha(), /201%/); // 318 / 22
  await page.fill('#inpDias', '1'); await page.press('#inpDias', 'Tab');
  assert.match(await linha(), /318,0/); assert.match(await linha(), /9%/);  // 29 / 318
  await page.click('button:has-text("Usar dias de semana")');
  assert.equal(await page.locator('#inpDias').inputValue(), '22');
  await page.fill('#inpDias', '0'); await page.press('#inpDias', 'Tab');
  assert.equal(await page.locator('#inpDias').inputValue(), '22'); // valor inválido é recusado
  await ctx.close();
});

test('tabelas ordenam ao clicar no título da coluna', async () => {
  const { ctx, page } = await abrir();
  const card = page.locator('.card:has(h2:text-is("Execução por serviço"))');
  await card.locator('th button:has-text("Taxa de execução")').click();          // colunas numéricas começam do maior
  assert.match(await card.locator('tbody tr').first().innerText(), /100,0%/);
  await card.locator('th button:has-text("Taxa de execução")').click();          // segundo clique inverte
  assert.match(await card.locator('tbody tr').first().innerText(), /Verificação Cadastral[\s\S]*76,3%/);
  assert.equal(await card.locator('th[aria-sort="ascending"]').count(), 1);
  await ctx.close();
});

test('importar: JSON inválido mostra erro; JSON válido de outro dia entra no seletor; HTML nos dados não executa', async () => {
  const { ctx, page, problemas } = await abrir();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-'));
  const ruim = path.join(tmp, 'ruim.json'); fs.writeFileSync(ruim, '{"esquema":2}');
  await page.setInputFiles('#arquivo', ruim);
  await esperar(page, () => document.getElementById('aviso').textContent.length > 0);
  assert.match(await texto(page, '#aviso'), /Não foi possível carregar/);
  assert.match(await texto(page, '#aviso'), /esquema/);
  const quebrado = path.join(tmp, 'quebrado.json'); fs.writeFileSync(quebrado, '{oops');
  await page.setInputFiles('#arquivo', quebrado);
  await esperar(page, () => /JSON válido/.test(document.getElementById('aviso').textContent));
  assert.match(await texto(page, '#aviso'), /não é um JSON válido/);

  const d = JSON.parse(fs.readFileSync(DADOS, 'utf8'));
  d.referencia.data = '2026-09-30';
  d.cidades_nomes.MIRACEMA = '<img src=x onerror="window.__xss=1">Miracema';
  d.servicos[8].exec = 130; // COBRANÇA 124 -> 130
  d.servicos_total.exec = 459; d.servicos_total.perc = 504;
  const bom = path.join(tmp, 'bom.json'); fs.writeFileSync(bom, JSON.stringify(d));
  await page.setInputFiles('#arquivo', bom);
  await esperar(page, () => document.querySelectorAll('#selDia option').length === 2);
  assert.equal(await page.locator('#aviso').innerText(), '');
  assert.deepEqual(await page.locator('#selDia option').allInnerTexts(), ['29/09/2026 (terça-feira)', '30/09/2026 (quarta-feira)']);
  assert.equal(await page.locator('#selDia').inputValue(), '2026-09-30');
  assert.match(await texto(page, '#main'), /459 executadas de 504/);
  await page.selectOption('#selDia', '2026-09-29');
  assert.match(await texto(page, '#main'), /453 executadas de 498/);
  await page.click('#tab-negociacoes');
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.equal(await page.locator('img[src="x"]').count(), 0);
  assert.deepEqual(problemas.filter((p) => !/Failed to load resource/.test(p)), []);
  await ctx.close();
});

test('lote de dias em um único JSON (lista) é aceito', async () => {
  const { ctx, page } = await abrir();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-'));
  const d1 = JSON.parse(fs.readFileSync(DADOS, 'utf8')), d2 = JSON.parse(fs.readFileSync(DADOS, 'utf8'));
  d1.referencia.data = '2026-09-25'; d2.referencia.data = '2026-09-26';
  const f = path.join(tmp, 'lote.json'); fs.writeFileSync(f, JSON.stringify([d1, d2]));
  await page.setInputFiles('#arquivo', f);
  await esperar(page, () => document.querySelectorAll('#selDia option').length === 3);
  assert.equal(await page.locator('#selDia option').count(), 3);
  assert.match(await texto(page, '#filtros'), /3 dias carregados/);
  await ctx.close();
});

test('tema: botão alterna e respeita o modo escuro do sistema', async () => {
  const { ctx, page } = await abrir({ colorScheme: 'dark' });
  const fundo = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.equal(await fundo(), 'rgb(13, 13, 13)');
  await page.click('#btnTema');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
  assert.equal(await fundo(), 'rgb(242, 243, 247)');
  await ctx.close();
});

test('copiar resumo coloca o texto na área de transferência', async () => {
  const { ctx, page } = await abrir();
  await page.click('#btnCopiar');
  const t = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(t, /Mensal Comercial — 29\/09\/2026/);
  assert.match(t, /Taxa de execução: 91,0% \(453 executadas de 498 percorridas; 45 com ocorrência\)/);
  assert.match(t, /13 divergências entre os números do relatório original/);
  await ctx.close();
});

test('celular (390 px): sem rolagem horizontal da página em nenhuma aba e cartões em 2 colunas', async () => {
  const { ctx, page } = await abrir({ viewport: { width: 390, height: 844 } });
  for (const id of ['resumo', 'operacao', 'negociacoes', 'metas', 'conferencia', 'dicionario']) {
    await page.click('#tab-' + id);
    const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert.ok(sw <= iw, `${id}: scrollWidth ${sw} > ${iw}`);
  }
  await page.click('#tab-resumo');
  const xs = await page.locator('.kpi').evaluateAll((els) => [...new Set(els.slice(0, 4).map((e) => Math.round(e.getBoundingClientRect().left)))]);
  assert.equal(xs.length, 2);
  await ctx.close();
});

test('navegação por teclado nas abas e por hash na URL', async () => {
  const { ctx, page } = await abrir();
  await page.focus('#tab-resumo');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#tab-operacao').getAttribute('aria-selected'), 'true');
  assert.match(page.url(), /#operacao$/);
  await page.goto(URL + '#metas');
  assert.equal(await page.locator('#tab-metas').getAttribute('aria-selected'), 'true');
  await ctx.close();
});

test('dicionário: a busca filtra as linhas', async () => {
  const { ctx, page } = await abrir();
  await page.click('#tab-dicionario');
  await page.fill('.search', 'ticket');
  const linhas = await page.locator('table.dic').first().locator('tbody tr').allInnerTexts();
  assert.equal(linhas.length, 1);
  assert.match(linhas[0], /Ticket médio/);
  await ctx.close();
});

test('o HTML gerado não contém chamadas de rede nem execução dinâmica', () => {
  const h = fs.readFileSync(HTML, 'utf8');
  assert.ok(!/\beval\s*\(/.test(h)); assert.ok(!/new Function/.test(h)); assert.ok(!/\.innerHTML\s*=/.test(h));
  assert.ok(!/(fetch|XMLHttpRequest|WebSocket|sendBeacon)\s*\(/.test(h));
  assert.ok(!/<script[^>]+src=/.test(h)); assert.ok(!/<link[^>]+href="https?:/.test(h));
});
