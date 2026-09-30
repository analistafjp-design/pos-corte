// Testes do núcleo (Node >= 20): regras, leitor de .xlsx, deduplicação, CSV e conciliação.
// Planilhas sintéticas: python3 tools/make_fixtures.py tests/fixtures (o `npm test` já faz isso).
// Teste opcional com a planilha real: POSCORTE_AMOSTRA=/caminho/Acompanhamento.xlsx npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const PC = require('../src/core.js');
const aqui = path.dirname(fileURLToPath(import.meta.url));
const FX = path.join(aqui, 'fixtures');
const fx = (n) => path.join(FX, n);
const json = (n) => JSON.parse(fs.readFileSync(fx(n), 'utf8'));

/** Objeto com a interface mínima de File (name, size, lastModified, slice). */
function arquivo(p, lastModified) {
  const st = fs.statSync(p);
  const buf = fs.readFileSync(p);
  const b = new Blob([buf]);
  return { name: path.basename(p), size: st.size, lastModified: lastModified ?? st.mtimeMs, slice: (a, z) => b.slice(a, z) };
}
const ler = (p, opts) => PC.readSpreadsheetFile(arquivo(p), opts);
const rejeita = async (p, codigo, trecho) => {
  await assert.rejects(ler(p), (e) => {
    assert.ok(e instanceof PC.PcError, 'esperava PcError, veio ' + e);
    assert.equal(e.code, codigo, e.message);
    if (trecho) assert.match(e.message, trecho);
    return true;
  });
};

function comFrentes(res, base = new Map()) {
  const mapa = PC.mergeFrentes(base, [{ nome: res.name || 'x', frentes: res.frentes }]);
  PC.applyFrentes(res.records, mapa);
  return mapa;
}
function contar(records, campo) {
  const m = {};
  for (const r of records) m[r[campo]] = (m[r[campo]] || 0) + 1;
  return m;
}
const minusculas = (o) => {
  const m = {};
  for (const [k, v] of Object.entries(o)) m[k.toLowerCase()] = (m[k.toLowerCase()] || 0) + v;
  return m;
};
function conferirEsperados(records, esp, { cidade = true } = {}) {
  const s = PC.summarize(records);
  assert.equal(s.atividades, esp.atividades, 'atividades');
  assert.equal(s.exec, esp.exec, 'exec');
  assert.equal(s.exoc, esp.exoc, 'exoc');
  assert.equal(s.neg, esp.neg, 'negociações');
  assert.equal(s.termos, esp.termos, 'termos');
  assert.equal(s.semDesdobro, esp.semDesdobro, 'sem desdobro');
  assert.equal(s.t11, esp.t11, '110013');
  assert.equal(s.t31, esp.t31, '310013');
  assert.equal(s.negETermo, esp.negETermo, 'negociação e termo na mesma atividade');
  assert.ok(Math.abs(s.debito - esp.debito) < 0.005, `débito ${s.debito} vs ${esp.debito}`);
  const meses = {};
  for (const m of PC.monthlySeries(records)) if (m.mes) meses[m.mes] = { atividades: m.sum.atividades, neg: m.sum.neg, termos: m.sum.termos };
  const espMeses = Object.fromEntries(Object.entries(esp.porMes).filter(([, v]) => v.atividades > 0));
  assert.deepEqual(Object.fromEntries(Object.entries(meses).filter(([, v]) => v.atividades > 0)), espMeses, 'meses');
  assert.deepEqual(contar(records, 'frente'), esp.porFrente, 'frentes');
  if (cidade) assert.deepEqual(minusculas(contar(records, 'cidade')), minusculas(esp.porCidade), 'cidades');
}

/* ------------------------------------------------------------------ */
test('termos: código completo com limites numéricos', () => {
  const t = (s) => PC.classify('Finalizada', '', s).termo;
  assert.equal(t('110013'), true);
  assert.equal(t('310013'), true);
  assert.equal(t('110013 - IRREGULARIDADE IDENTIFICADA;'), true);
  assert.equal(t('145005 - ENTREGA DE COMUNICADO;110013 - IRREGULARIDADE IDENTIFICADA;'), true);
  assert.equal(t('120045;310013'), true);
  assert.equal(t('x=110013y'), true, 'letras não são limite numérico');
  assert.equal(t('Termo 110013.\nMais'), true);
  assert.equal(t('110013,5'), true);
  assert.equal(t('1100130'), false, 'número maior que contém os dígitos');
  assert.equal(t('9310013'), false);
  assert.equal(t('2110013'), false);
  assert.equal(t('0110013'), false);
  assert.equal(t('11001'), false);
  assert.equal(t(''), false);
  assert.equal(t(null), false);
  const ambos = PC.classify('Finalizada', '', '110013 / 310013');
  assert.deepEqual([ambos.t11, ambos.t31, ambos.termo], [true, true, true]);
  assert.equal(PC.classify('Finalizada', 'Não', '110013').termo, true, 'termo independe de negociação');
  assert.equal(PC.classify('Finalizada', 'Sim', '').termo, false);
});

test('negociação: somente "Sim" (espaços e caixa ignorados)', () => {
  const n = (v) => PC.classify('Finalizada', v, '').neg;
  for (const v of ['Sim', 'SIM', ' sim ', 'sIm', ' Sim ']) assert.equal(n(v), true, JSON.stringify(v));
  for (const v of ['NÃO', 'Nao', '', null, 'Sim, parcial', 'Simulado', 'S', '1', 'true']) assert.equal(n(v), false, JSON.stringify(v));
  assert.equal(PC.classify('Finalizada', 'Sim', '110013;').neg, true);
});

test('sem desdobro: negociação com serviço adicional vazio/nulo/espaços', () => {
  const c = (neg, s, hasServ) => PC.classify('Finalizada', neg, s, hasServ);
  assert.equal(c('Sim', '').semDesdobro, true);
  assert.equal(c('Sim', '   ').semDesdobro, true);
  assert.equal(c('Sim', ' \t').semDesdobro, true);
  assert.equal(c('Sim', null).semDesdobro, true);
  assert.equal(c('Sim', '107002 - COBRANÇA').semDesdobro, false);
  assert.equal(c('Não', '').semDesdobro, false, 'sem negociação não é "sem desdobro"');
  assert.equal(c('Sim', '', false).semDesdobro, false, 'coluna ausente não equivale a vazia');
  assert.equal(c('Sim', '').neg, true, 'continua sendo negociação');
});

test('serviços considerados: só os 9 códigos no início de "Código/Descrição"', () => {
  const c = PC.codigoServico;
  for (const ok of ['110010-VISTORIA PÓS CORTE', '110011-VISTORIA PÓS CORTE - INTERMEDIÁRIO', '110012-X', '210010-X', '210011-X', '210012-X', '310010-X', '310011-X', '310012-VISTORIA', ' 310012 - X', '210012']) {
    assert.ok(PC.CODIGOS_SERVICO.includes(c(ok)), ok);
  }
  for (const fora of ['180001 - OUTRO', '1100100-MAIOR', '9110010', '', null, undefined, 'PÓS CORTE 110010', '11001']) {
    assert.ok(!PC.CODIGOS_SERVICO.includes(c(fora)), String(fora));
  }
  assert.deepEqual(PC.CODIGOS_SERVICO, ['110010', '110011', '110012', '210010', '210011', '210012', '310010', '310011', '310012']);
});

test('status: Exec e Exoc', () => {
  assert.equal(PC.classify('Finalizada', '', '').exec, true);
  assert.equal(PC.classify(' finalizada ', '', '').exec, true);
  assert.equal(PC.classify('Encerrada com Ocorrência', '', '').exoc, true);
  assert.equal(PC.classify('Encerrada com Ocorrencia', '', '').exoc, true);
  const o = PC.classify('Cancelada', '', '');
  assert.deepEqual([o.exec, o.exoc], [false, false]);
});

test('valores no padrão brasileiro', () => {
  const v = (s, k = 0) => PC.parseValor(s, k);
  assert.equal(v('R$ 1.234,56'), 1234.56);
  assert.equal(v('R$ 1634,79'), 1634.79);
  assert.equal(v('R$ 1049,6'), 1049.6);
  assert.equal(v('R$ ,03'), 0.03);
  assert.equal(v('R$ 1952'), 1952);
  assert.equal(v('R$ 101640,48'), 101640.48);
  assert.equal(v('1.234'), 1234);
  assert.equal(v('12.345.678,90'), 12345678.9);
  assert.equal(v('1234.5'), 1234.5);
  assert.equal(v('-R$ 10,00'), -10);
  assert.equal(v('(10,00)'), -10);
  assert.equal(v('R$ '), null);
  assert.equal(v('R$'), null);
  assert.equal(v(''), null);
  assert.ok(Number.isNaN(v('abc')));
  assert.ok(Number.isNaN(v('R$ 12,3,4x')));
  assert.equal(v('1234.56', 1), 1234.56, 'célula numérica usa ponto decimal do XML');
});

test('datas: texto, ISO e serial do Excel (1900 e 1904)', () => {
  const iso = (p) => (p ? p.y + '-' + String(p.m).padStart(2, '0') + '-' + String(p.d).padStart(2, '0') : null);
  assert.equal(iso(PC.parseDateText('28/09/2026')), '2026-09-28');
  assert.equal(iso(PC.parseDateText('28/09/2026 14:30:15')), '2026-09-28');
  assert.equal(iso(PC.parseDateText('2026-09-28T10:00:00')), '2026-09-28');
  assert.equal(iso(PC.parseDateText('2026-09-28')), '2026-09-28');
  assert.equal(iso(PC.parseDateText('1/2/26')), '2026-02-01');
  assert.equal(PC.parseDateText('31/02/2026'), null);
  assert.equal(PC.parseDateText('13/13/2026'), null);
  assert.equal(PC.parseDateText('ontem'), null);
  assert.equal(iso(PC.serialToParts(46024, false)), '2026-01-02');
  assert.equal(iso(PC.serialToParts(46024 - 1462, true)), '2026-01-02');
  const dh = PC.serialToParts(46024.5, false);
  assert.deepEqual([dh.H, dh.M, dh.time], [12, 0, true]);
  assert.equal(PC.fmtBR(PC.parseDateText('05/03/2026 08:05:00')), '05/03/2026 08:05:00');
  assert.equal(PC.isoToBR('2026-03-05'), '05/03/2026');
  assert.equal(PC.isDateFormatCode('dd/mm/yyyy hh:mm'), true);
  assert.equal(PC.isDateFormatCode('[$-F400]h:mm:ss\\ AM/PM'), true);
  assert.equal(PC.isDateFormatCode('"R$" #,##0.00'), false);
  assert.equal(PC.isDateFormatCode('General'), false);
  assert.equal(PC.isDateFormatCode('0.00E+00'), false);
});

test('XML incremental: o resultado não depende do tamanho dos pedaços', () => {
  const xml = '<?xml version="1.0"?><a:r xmlns:a="x"><!-- c > d --><a:c r="A1" t="s"><a:v>1 &amp; 2</a:v></a:c><![CDATA[<raw>]]><c r=\'B2\'/><t xml:space="preserve"> x </t></a:r>';
  const coletar = (tam) => {
    const ev = [];
    const xs = new PC.XmlStream({ open: (n, i, sc) => ev.push(['o', n, i, sc]), close: (n) => ev.push(['c', n]), text: (t, raw) => ev.push(['t', t, !!raw]) });
    for (let i = 0; i < xml.length; i += tam) xs.write(xml.slice(i, i + tam));
    xs.end();
    // junta textos consecutivos (o corte de pedaços pode dividir um texto em dois)
    return ev.reduce((acc, e) => {
      const ult = acc[acc.length - 1];
      if (e[0] === 't' && ult && ult[0] === 't' && ult[2] === e[2]) ult[1] += e[1]; else acc.push(e);
      return acc;
    }, []);
  };
  const ref = coletar(xml.length);
  for (const tam of [1, 2, 3, 5, 7, 13, 50]) assert.deepEqual(coletar(tam), ref, 'pedaços de ' + tam);
  assert.deepEqual(ref[0].slice(0, 2), ['o', 'r'], 'prefixo de namespace removido');
  assert.ok(ref.some((e) => e[0] === 't' && e[1] === '<raw>' && e[2] === true), 'CDATA bruto');
  const xs = new PC.XmlStream({ open() {}, close() {}, text() {} });
  xs.write('<a><b');
  assert.throws(() => xs.end(), /incompleto/);
  assert.equal(PC.decodeText('a &lt;b&gt; &#65;&#x42; _x000D_'), 'a <b> AB \r');
});

/* ------------------------------------------------------------------ */
for (const nome of ['pequeno_xlsxwriter', 'pequeno_inline', 'pequeno_1904', 'pequeno_datas_texto', 'pequeno_openpyxl']) {
  test(`arquivo pequeno (${nome}): todos os indicadores conferem com o cálculo independente`, async () => {
    const res = await ler(fx(nome + '.xlsx'));
    assert.equal(res.abaBase, 'Base');
    assert.equal(res.frentes.length, 52);
    assert.equal(res.records.length, 19);
    assert.equal(res.foraServico, 3, 'IDs 20 (outro serviço), 21 (sem código) e 22 (código maior) não entram');
    assert.ok(!res.records.some((r) => ['20', '21', '22'].includes(r.id)));
    const cons = PC.consolidate([{ ...res, path: nome, lastModified: 1 }]);
    comFrentes({ records: cons.records, frentes: res.frentes, name: nome });
    conferirEsperados(cons.records, json('pequeno_esperados.json'));
    assert.equal(cons.duplicatas, 0, 'matrículas repetidas com IDs distintos são visitas diferentes');
    assert.deepEqual(res.conferencia.map((c) => [c.tipo, c.conciliado]), [['termos', true], ['negociacoes', true]]);
    const r = res.records.find((x) => x.id === '2');
    assert.equal(r.semDesdobro, true);
    const r16 = res.records.find((x) => x.id === '16');
    assert.equal(r16.valor, 1000.5, '"R$ 1.000,50"');
    const r17 = res.records.find((x) => x.id === '17');
    // o openpyxl grava textos iniciados por "=" como fórmula sem resultado; o painel lê o resultado gravado (vazio)
    assert.equal(r17.solicitante, nome === 'pequeno_openpyxl' ? '' : '=HYPERLINK("x")');
    assert.equal(res.records.find((x) => x.id === '1').solicitante, 'Ana & <Souza>', 'entidades XML');
    assert.equal(res.records.find((x) => x.id === '1').dataTxt, '03/07/2026');
    assert.equal(res.records.find((x) => x.id === '1').slaInicio, '03/07/2026 08:00:00');
  });
}

test('mesma matrícula com IDs distintos preserva as duas visitas', async () => {
  const res = await ler(fx('pequeno_xlsxwriter.xlsx'));
  assert.equal(res.records.filter((r) => r.matricula === '1001').length, 19, 'todas as linhas do fixture usam a matrícula 1001');
});

test('sem aba de frentes: mapeamento anterior é preservado', async () => {
  const com = await ler(fx('pequeno_xlsxwriter.xlsx'));
  const sem = await ler(fx('pequeno_sem_frente.xlsx'));
  assert.equal(sem.frentes, null);
  const mapa1 = PC.mergeFrentes(new Map(), [{ nome: 'a', frentes: com.frentes }]);
  const mapa2 = PC.mergeFrentes(mapa1, [{ nome: 'b', frentes: sem.frentes }]);
  assert.equal(mapa2.size, 52);
  const mapa3 = PC.mergeFrentes(mapa2, [{ nome: 'c', frentes: [{ nomenclatura: 'al', frente: 'NOVA' }] }]);
  assert.equal(mapa3.get('AL').frente, 'NOVA', 'importação mais recente substitui a mesma nomenclatura');
  assert.equal(mapa3.get('AL').origem, 'c');
  assert.equal(mapa3.size, 52);
});

test('frente: prefixo mais longo, sem diferenciar caixa, e "Não mapeada"', () => {
  const mapa = PC.mergeFrentes(new Map(), [{ nome: 'x', frentes: [
    { nomenclatura: 'RIOPCRIN', frente: 'PÓS CORTE' }, { nomenclatura: 'RIOPCR', frente: 'GENÉRICA' }, { nomenclatura: 'riofsc', frente: 'FISC' },
  ] }]);
  const idx = PC.buildFrenteIndex(mapa);
  assert.equal(PC.frenteFor('RIOPCRIN-011', idx), 'PÓS CORTE');
  assert.equal(PC.frenteFor('riopcrin-011', idx), 'PÓS CORTE');
  assert.equal(PC.frenteFor('RIOPCRNT-001', idx), 'GENÉRICA');
  assert.equal(PC.frenteFor('RIOFSCIN-001', idx), 'FISC');
  assert.equal(PC.frenteFor('RIOGCLNT-008', idx), PC.NAO_MAPEADA);
  assert.equal(PC.frenteFor('', idx), PC.NAO_MAPEADA);
  assert.equal(PC.buildFrenteIndex(PC.mergeFrentes(new Map(), [{ nome: 'x', frentes: [{ nomenclatura: ' ', frente: 'X' }] }])).length, 0, 'prefixo vazio não casa com tudo');
});

/* ------------------------------------------------------------------ */
test('arquivos inválidos: mensagens claras, sem virar base vazia', async () => {
  await rejeita(fx('vazio.xlsx'), 'EMPTY', /vazio/);
  await rejeita(fx('texto_disfarçado.xlsx'), 'NOT_XLSX', /não é um \.xlsx/);
  await rejeita(fx('antigo_xls.xlsx'), 'OLE2', /\.xls antigo|senha/);
  await rejeita(fx('truncado.xlsx'), 'TRUNCATED', /incompleto/);
  await rejeita(fx('xlsb_falso.xlsx'), 'XLSB', /xlsb/);
  await rejeita(fx('zip_qualquer.xlsx'), 'NOT_XLSX', /workbook não encontrado/);
  await rejeita(fx('workbook_sem_partes.xlsx'), 'MISSING_PART', /inexistente/);
  await rejeita(fx('sem_cabecalho.xlsx'), 'NO_HEADER', /Coluna A/);
  await rejeita(fx('abas_ambiguas.xlsx'), 'AMBIGUOUS_SHEET', /Renomeie a aba principal para "Base"/);
  await rejeita(fx('sem_indicadores.xlsx'), 'MISSING_COLUMNS', /Nenhum indicador/);
});

test('ZIP64 e arquivo com senha são recusados com mensagem própria', async () => {
  // EOCD com contagem 0xFFFF (sinal de ZIP64)
  const buf = Buffer.alloc(22);
  buf.writeUInt32LE(0x06054b50, 0);
  buf.writeUInt16LE(0xffff, 10);
  buf.writeUInt32LE(0xffffffff, 12);
  buf.writeUInt32LE(0xffffffff, 16);
  const b = new Blob([Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(30), buf])]);
  await assert.rejects(PC.readSpreadsheetFile({ name: 'z.xlsx', size: b.size, lastModified: 1, slice: (x, y) => b.slice(x, y) }), (e) => e.code === 'ZIP64' && /ZIP64/.test(e.message));
});

/* ------------------------------------------------------------------ */
test('arquivo leve: outra aba, título antes do cabeçalho, poucas colunas, sem ID', async () => {
  const res = await ler(fx('leve_titulo_linha4.xlsx'));
  assert.equal(res.abaBase, 'Resumo');
  assert.ok(res.warnings.some((w) => /Aba "Base" não encontrada: foi usada a aba "Resumo"/.test(w)));
  assert.ok(res.warnings.some((w) => /ID da Atividade/.test(w)));
  assert.ok(res.warnings.some((w) => /Código\/Descrição.*filtro pelos serviços.*não pôde ser aplicado/.test(w)), 'sem a coluna de código o filtro não se aplica, e isso é avisado');
  assert.equal(res.filtroServico, false);
  assert.deepEqual(res.cobertura.indisponiveis, []);
  assert.equal(res.frentes, null);
  const cons = PC.consolidate([{ ...res, path: 'leve', lastModified: 1 }]);
  assert.equal(cons.semChave, 19, 'sem ID nem chave alternativa completa: nada é unido');
  comFrentes({ records: cons.records, frentes: (await ler(fx('pequeno_xlsxwriter.xlsx'))).frentes, name: 'x' });
  conferirEsperados(cons.records, json('pequeno_esperados.json'));
});

test('arquivo leve: colunas com outros nomes exigem nome alternativo', async () => {
  await rejeita(fx('leve_nomes_diferentes.xlsx'), 'NO_BASE_SHEET', /nenhuma aba tem as colunas esperadas/);
  const aliases = {
    recurso: ['Equipe'], data: ['Dt'], status: ['Situação'], cidade: ['Município'],
    valor: ['Débito'], negociou: ['Negociou?'], servAdic: ['Serviços adicionais'],
  };
  const res = await ler(fx('leve_nomes_diferentes.xlsx'), { aliases });
  assert.equal(res.abaBase, 'Planilha1');
  const s = PC.summarize(res.records);
  const esp = json('pequeno_esperados.json');
  assert.deepEqual([s.atividades, s.exec, s.exoc, s.neg, s.termos, s.semDesdobro], [esp.atividades, esp.exec, esp.exoc, esp.neg, esp.termos, esp.semDesdobro]);
});

test('coluna de indicador ausente: indisponível, nunca zero silencioso nem Sem Desdobro falso', async () => {
  const semNeg = await ler(fx('sem_coluna_negociou.xlsx'));
  assert.deepEqual(semNeg.cobertura.indisponiveis.sort(), ['neg', 'semDesdobro']);
  assert.ok(semNeg.warnings.some((w) => /Negociou O Débito\?" não encontrada/.test(w)));
  assert.equal(PC.summarize(semNeg.records).termos, 7, 'termos seguem calculados');
  assert.deepEqual(semNeg.conferencia.map((c) => Boolean(c.erro)), [false, true], 'recorte de negociação não é conferido sem a coluna');

  const semSvc = await ler(fx('sem_coluna_servadic.xlsx'));
  assert.deepEqual(semSvc.cobertura.indisponiveis.sort(), ['semDesdobro', 'termos']);
  const s = PC.summarize(semSvc.records);
  assert.equal(s.neg, 5, 'negociações seguem calculadas');
  assert.equal(s.semDesdobro, 0, 'sem a coluna, ninguém vira "Sem Desdobro"');
  assert.equal(s.termos, 0);

  const opc = await ler(fx('sem_coluna_opcional.xlsx'));
  assert.deepEqual(opc.cobertura.indisponiveis, []);
  assert.ok(opc.warnings.some((w) => /Categoria/.test(w)));
});

/* ------------------------------------------------------------------ */
test('pasta com versões: deduplicação por ID, arquivo mais recente prevalece', async () => {
  const dir = fx('pasta_dedup');
  const meta = json('pasta_dedup/_esperados.json');
  const antigo = arquivo(path.join(dir, 'snapshot_antigo.xlsx'), Date.UTC(2026, 0, 1));
  const novo = arquivo(path.join(dir, 'sub', 'snapshot_novo.xlsx'), Date.UTC(2026, 1, 1));
  const rA = await PC.readSpreadsheetFile(antigo, { path: 'snapshot_antigo.xlsx' });
  const rN = await PC.readSpreadsheetFile(novo, { path: 'sub/snapshot_novo.xlsx' });
  const cons = PC.consolidate([{ ...rN, path: 'sub/snapshot_novo.xlsx', lastModified: novo.lastModified }, { ...rA, path: 'snapshot_antigo.xlsx', lastModified: antigo.lastModified }]);
  assert.equal(cons.lidos, meta.antigo.linhas + meta.novo.linhas);
  assert.equal(cons.duplicatas, meta.duplicatas);
  assert.equal(cons.records.length, meta.unicos);
  const alterado = cons.records.find((r) => r.id === String(meta.status_alterado_id));
  assert.equal(alterado.status, meta.status_novo, 'prevalece o registro do arquivo mais recente');
  assert.equal(alterado.arquivo, 'sub/snapshot_novo.xlsx');
  PC.applyFrentes(cons.records, PC.mergeFrentes(new Map(), [{ nome: 'x', frentes: rN.frentes }]));
  const s = PC.summarize(cons.records);
  assert.deepEqual([s.atividades, s.exec, s.exoc, s.neg, s.termos, s.semDesdobro], [meta.esperados.atividades, meta.esperados.exec, meta.esperados.exoc, meta.esperados.neg, meta.esperados.termos, meta.esperados.semDesdobro]);

  // a data de modificação decide: invertendo-a, o conteúdo do arquivo antigo prevalece
  const inv = PC.consolidate([{ ...rN, path: 'sub/snapshot_novo.xlsx', lastModified: 1 }, { ...rA, path: 'snapshot_antigo.xlsx', lastModified: 2 }]);
  assert.notEqual(inv.records.find((r) => r.id === String(meta.status_alterado_id)).status, meta.status_novo);
  assert.equal(inv.duplicatas, meta.duplicatas);
});

test('deduplicação: chave alternativa e linhas sem chave completa', () => {
  const base = { id: '', protocolo: 'P1', matricula: 'M1', codigo: 'C1', data: '2026-01-02', dataTxt: '02/01/2026', recurso: 'R1', cidade: 'X', status: 'Finalizada', solicitante: '', linha: 1, arquivo: '' };
  const mk = (o) => Object.assign({}, base, o);
  const a = { path: 'a', lastModified: 1, records: [mk({ status: 'Finalizada', linha: 1 }), mk({ protocolo: '', linha: 2 }), mk({ protocolo: '', linha: 3 })] };
  const b = { path: 'b', lastModified: 2, records: [mk({ status: 'Encerrada com Ocorrência', linha: 1 }), mk({ protocolo: '', linha: 2 })] };
  const c = PC.consolidate([a, b]);
  assert.equal(c.lidos, 5);
  assert.equal(c.records.length, 4, 'a chave completa é unida; as linhas sem protocolo nunca são');
  assert.equal(c.semChave, 3);
  assert.equal(c.duplicatas, 1);
  assert.equal(c.records.find((r) => r.protocolo === 'P1').status, 'Encerrada com Ocorrência');
  // mesma chave, IDs diferentes = visitas distintas
  const d = PC.consolidate([{ path: 'a', lastModified: 1, records: [mk({ id: '1' }), mk({ id: '2' }), mk({ id: '1' })] }]);
  assert.equal(d.records.length, 2);
  assert.equal(d.duplicatas, 1);
});

/* ------------------------------------------------------------------ */
test('filtros e rankings conciliam com os cartões (propriedade sobre combinações)', async () => {
  const res = await ler(fx('pequeno_xlsxwriter.xlsx'));
  const cons = PC.consolidate([{ ...res, path: 'p', lastModified: 1 }]);
  comFrentes({ records: cons.records, frentes: res.frentes, name: 'p' });
  const recs = cons.records;
  const cidades = PC.distinct(recs, 'cidade');
  const frentes = PC.distinct(recs, 'frente');
  const filtros = [{}, { from: '2026-07-01', to: '2026-07-31' }, { from: '2026-08-01', to: '2026-08-31' }, { to: '2026-07-10' }, { from: '2026-07-04' }, { cidade: cidades[0] }, { frente: frentes[0] }, { equipe: 'AL-01' }, { from: '2026-07-01', to: '2026-09-30', cidade: cidades[0], frente: frentes[0] }];
  for (const f of filtros) {
    const fil = PC.filterRecords(recs, f);
    const s = PC.summarize(fil);
    for (const ind of PC.INDICADORES) {
      const total = PC.filterRecords(fil, { indicador: ind.key }).length;
      assert.equal(total, s[ind.key], `${ind.key} ${JSON.stringify(f)}`);
      for (const dim of ['frente', 'cidade', 'recurso']) {
        const r = PC.ranking(fil, dim, ind.key);
        assert.equal(r.items.reduce((a, i) => a + i.value, 0), total, `ranking ${dim}/${ind.key} ${JSON.stringify(f)}`);
        assert.equal(r.total, total);
      }
    }
    const meses = PC.monthlySeries(fil).reduce((a, m) => a + m.sum.atividades, 0);
    assert.equal(meses, s.atividades);
  }
  // julho mostra só julho; agosto só agosto; sem período mostra tudo
  const jul = PC.filterRecords(recs, { from: '2026-07-01', to: '2026-07-31' });
  assert.ok(jul.every((r) => r.mes === '2026-07'));
  const ago = PC.filterRecords(recs, { from: '2026-08-01', to: '2026-08-31' });
  assert.ok(ago.every((r) => r.mes === '2026-08') && ago.length === 1);
  assert.equal(PC.filterRecords(recs, {}).length, recs.length);
  assert.deepEqual(PC.monthRange('2026-02'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(PC.monthRange('2028-02'), { from: '2028-02-01', to: '2028-02-29' });
  // busca
  assert.equal(PC.filterRecords(recs, { busca: 'os1' }).length, recs.length);
  assert.equal(PC.filterRecords(recs, { busca: 'souza' }).length, recs.filter((r) => /souza/i.test(r.solicitante)).length);
  // série mensal contínua
  const serie = PC.monthlySeries([{ mes: '2026-01', data: '2026-01-05' }, { mes: '2026-04', data: '2026-04-05' }, { mes: '', data: '' }].map((r) => ({ ...r, exec: true, exoc: false, neg: false, semDesdobro: false, termo: false, t11: false, t31: false, valor: null })));
  assert.deepEqual(serie.map((m) => m.mes), ['2026-01', '2026-02', '2026-03', '2026-04', '']);
  assert.equal(serie[4].rotulo, 'Sem data');
  // data com ano errado não gera centenas de meses vazios
  const longa = PC.monthlySeries([{ mes: '2026-01', data: '2026-01-05' }, { mes: '2090-01', data: '2090-01-05' }].map((r) => ({ ...r, exec: true, exoc: false, neg: false, semDesdobro: false, termo: false, t11: false, t31: false, valor: null })));
  assert.deepEqual(longa.map((m) => m.mes), ['2026-01', '2090-01']);
});

test('CSV: UTF-8 com BOM, separador ";", todas as linhas e proteção contra fórmulas', async () => {
  const res = await ler(fx('pequeno_xlsxwriter.xlsx'));
  const cons = PC.consolidate([{ ...res, path: 'p', lastModified: 1 }]);
  comFrentes({ records: cons.records, frentes: res.frentes, name: 'p' });
  const csv = PC.toCsv(cons.records);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  const linhas = csv.slice(1).split('\r\n');
  assert.equal(linhas.length, cons.records.length + 2, 'cabeçalho + registros + quebra final');
  assert.equal(linhas[0].split(';')[0], 'Recurso');
  assert.match(csv, /'=HYPERLINK\(""x""\)/);
  assert.equal(PC.csvCell('=1+1'), "'=1+1");
  assert.equal(PC.csvCell('+55'), "'+55");
  assert.equal(PC.csvCell('-x'), "'-x");
  assert.equal(PC.csvCell('@a'), "'@a");
  assert.equal(PC.csvCell('a;b'), '"a;b"');
  assert.equal(PC.csvCell('a"b'), '"a""b"');
  assert.equal(PC.csvCell('l1\nl2'), '"l1\nl2"');
  assert.equal(PC.csvCell(-10.5, true), '-10,50', 'número gerado pelo painel não recebe apóstrofo');
  assert.equal(PC.csvCell(1234.5, true), '1234,50');
  // exporta só o filtrado
  const so = PC.filterRecords(cons.records, { indicador: 'termos' });
  assert.equal(PC.toCsv(so).slice(1).split('\r\n').length, so.length + 2);
});

/* ------------------------------------------------------------------ */
for (const nome of ['grande_sintetico', 'grande_sintetico_inline']) {
  test(`arquivo grande sintético 8.136 × 296 (${nome}): números de referência e conciliação`, { skip: !fs.existsSync(fx(nome + '.xlsx')) && 'gere com python3 tools/make_fixtures.py tests/fixtures', timeout: 300000 }, async () => {
    const t0 = performance.now();
    const res = await ler(fx(nome + '.xlsx'));
    const ms = Math.round(performance.now() - t0);
    console.log(`  ${nome}: ${res.records.length} registros, ${ms} ms`);
    assert.equal(res.cobertura.reconhecidas.length, 19, 'só as 19 colunas usadas são lidas');
    assert.equal(res.records.length, 8136);
    assert.equal(res.foraServico, 50, 'linhas de outros serviços são ignoradas e contadas');
    assert.equal(res.filtroServico, true);
    const cons = PC.consolidate([{ ...res, path: nome, lastModified: 1 }]);
    comFrentes({ records: cons.records, frentes: res.frentes, name: nome });
    const esp = json('grande_esperados.json');
    conferirEsperados(cons.records, esp);
    const s = PC.summarize(cons.records);
    // números de referência do projeto
    assert.deepEqual([s.atividades, s.exec, s.exoc, s.neg, s.termos, s.semDesdobro], [8136, 7461, 675, 230, 389, 2]);
    assert.deepEqual(res.conferencia.map((c) => [c.tipo, c.linhas, c.conciliado]), [['termos', 389, true], ['negociacoes', 230, true]]);
    assert.equal(cons.duplicatas, 0);
    assert.deepEqual(res.warnings, [], 'todas as 19 colunas presentes e sem repetição entre as usadas');
  });
}

test('amostra real (opcional): números de referência do projeto', { skip: !process.env.POSCORTE_AMOSTRA && 'defina POSCORTE_AMOSTRA=/caminho/Acompanhamento - Pós Corte.xlsx', timeout: 300000 }, async () => {
  const res = await ler(process.env.POSCORTE_AMOSTRA);
  const cons = PC.consolidate([{ ...res, path: 'amostra', lastModified: 1 }]);
  comFrentes({ records: cons.records, frentes: res.frentes, name: 'amostra' });
  const s = PC.summarize(cons.records);
  assert.deepEqual([s.atividades, s.exec, s.exoc, s.neg, s.termos, s.semDesdobro], [8136, 7461, 675, 230, 389, 2]);
  assert.equal(res.cobertura.reconhecidas.length, 19);
  assert.equal(res.foraServico, 0, 'todos os serviços da amostra estão nos 9 códigos');
  assert.equal(res.frentes.length, 52);
  assert.deepEqual(res.conferencia.map((c) => [c.tipo, c.linhas, c.conciliado]), [['termos', 389, true], ['negociacoes', 230, true]]);
  const datas = cons.records.map((r) => r.data).sort();
  assert.equal(datas[0], '2026-01-02');
  assert.equal(datas[datas.length - 1], '2026-09-28');
  assert.equal(res.warnings.length, 0);
  if (process.env.POSCORTE_ESPERADO) {
    const esp = JSON.parse(fs.readFileSync(process.env.POSCORTE_ESPERADO, 'utf8'));
    assert.ok(Math.abs(s.debito - esp.debitoNeg) < 0.005, 'débito das negociações');
    const porFrente = {};
    for (const r of cons.records) {
      const f = (porFrente[r.frente] = porFrente[r.frente] || { atividades: 0, exec: 0, neg: 0, termos: 0 });
      f.atividades++; if (r.exec) f.exec++; if (r.neg) f.neg++; if (r.termo) f.termos++;
    }
    for (const [f, v] of Object.entries(esp.porFrente)) {
      for (const k of ['atividades', 'exec', 'neg', 'termos']) assert.equal(porFrente[f][k], v[k] || 0, `${f}/${k}`);
    }
  }
});
