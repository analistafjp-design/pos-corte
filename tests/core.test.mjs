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
const EX = require('../src/exportar.js');
import { spawnSync } from 'node:child_process';
import os from 'node:os';
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
function conferirEsperados(records, esp, { cidade = true, matricula = true } = {}) {
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
  assert.ok(Math.abs(s.debitoTotal - esp.debitoTotal) < 0.005, `débito total informado ${s.debitoTotal} vs ${esp.debitoTotal}`);
  assert.ok(Math.abs(s.debitoPct - esp.debito / esp.debitoTotal) < 1e-9, 'valor negociado ÷ débito total informado');
  if (matricula) {
    assert.equal(s.matriculasNeg, esp.matriculasNeg, 'matrículas distintas que negociaram');
    assert.equal(s.negSemMatricula, esp.negSemMatricula, 'negociações sem matrícula');
  } else {
    // arquivo sem a coluna Matrícula: nenhuma matrícula identificável; todas as negociações ficam "sem matrícula"
    assert.equal(s.matriculasNeg, 0, 'sem a coluna Matrícula');
    assert.equal(s.negSemMatricula, esp.neg, 'sem a coluna Matrícula, toda negociação fica sem matrícula');
  }
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

test('valor negociado e economias recuperadas: débito ÷ débito total informado; TOTAL_ECO do Cadastro das matrículas distintas que negociaram', () => {
  const r = (o) => Object.assign({ exec: true, exoc: false, neg: false, valor: null, matricula: '', eco: null, ecoMotivo: 'nao' }, o);
  const recs = [
    r({ neg: true, valor: 100, matricula: '00123', eco: 3, ecoMotivo: 'ok' }),
    r({ neg: true, valor: 50.5, matricula: ' 123 ', eco: 3, ecoMotivo: 'ok' }), // mesma matrícula (zeros e espaços): conta uma vez
    r({ neg: true, valor: null, matricula: '456.0', ecoMotivo: 'rep' }), // negociação sem valor informado; repetida no Cadastro
    r({ neg: true, valor: 10, matricula: '' }), // sem matrícula: fora das economias
    r({ neg: true, valor: 5, matricula: '999', ecoMotivo: 'sem' }), // não achada no Cadastro
    r({ neg: true, valor: 1, matricula: '77', eco: 12, ecoMotivo: 'ok' }),
    r({ neg: false, valor: 200, matricula: '123', eco: 3, ecoMotivo: 'ok' }), // sem negociação: entra só no débito total
    r({ exec: false, exoc: true, neg: false, valor: null, matricula: '789' }),
  ];
  const s = PC.summarize(recs);
  assert.equal(s.neg, 6);
  assert.ok(Math.abs(s.debito - 166.5) < 1e-9, 'valor negociado');
  assert.ok(Math.abs(s.debitoTotal - 366.5) < 1e-9, 'débito total informado de todas as atividades');
  assert.ok(Math.abs(s.debitoPct - 166.5 / 366.5) < 1e-9);
  assert.equal(s.debitoNaoInformado, 1);
  assert.equal(s.matriculasNeg, 4, '123 (duas vezes), 456, 999 e 77');
  assert.equal(s.economias, 17, 'TOTAL_ECO de 123 (3, uma vez) + 77 (12) + 1 de 456 (repetida no Cadastro) + 1 de 999 (fora do Cadastro)');
  assert.equal(s.economiasMatriculas, 2);
  assert.equal(s.economiasPeloMinimo, 2, 'as que contam o mínimo de 1');
  assert.equal(s.economiasRepetidas, 1);
  assert.equal(s.economiasSemCadastro, 1);
  assert.equal(s.economiasSemArquivo, 0);
  assert.equal(s.negSemMatricula, 1);
  assert.equal(s.exec, 7);
  assert.ok(Math.abs(s.economiasSobreExec - 17 / 7) < 1e-9);
  assert.ok(s.economias >= s.matriculasNeg, 'nunca menos de 1 economia por matrícula que negociou');
  assert.equal(s.neg - s.negSemMatricula - s.matriculasNeg, 1, 'negociações = matrículas distintas + repetidas na mesma matrícula (123 duas vezes) + sem matrícula');
  // sem débito informado e sem Exec: divisões protegidas
  const vazio = PC.summarize([r({ exec: false, exoc: true, neg: true, matricula: '1', eco: 2, ecoMotivo: 'ok' })]);
  assert.equal(vazio.debitoPct, null);
  assert.equal(vazio.economiasSobreExec, null);
  assert.equal(vazio.economias, 2);
  // sem Cadastro carregado cada matrícula que negociou conta o mínimo de 1, e isso fica explícito
  const sem = PC.summarize([r({ neg: true, matricula: '1' }), r({ neg: true, matricula: '2' })]);
  assert.equal(sem.economias, 2);
  assert.equal(sem.economiasPeloMinimo, 2);
  assert.equal(sem.economiasSemArquivo, 2);
  // caso relatado: 6 negociações de 6 matrículas, só 1 no Cadastro (com 1 economia): no mínimo 6 economias recuperadas
  const seis = PC.summarize(['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].map((m, i) => r({ neg: true, matricula: m, eco: i === 0 ? 1 : null, ecoMotivo: i === 0 ? 'ok' : i % 2 ? 'sem' : 'rep' })));
  assert.equal(seis.neg, 6);
  assert.equal(seis.economias, 6);
  assert.equal(seis.economiasMatriculas, 1);
  assert.equal(seis.economiasPeloMinimo, 5);
  // TOTAL_ECO 0 no Cadastro não faz uma matrícula que negociou valer menos de 1
  assert.equal(PC.summarize([r({ neg: true, matricula: '1', eco: 0, ecoMotivo: 'ok' })]).economias, 1);
});

test('Cadastro: a dica é "cadastro" no nome do arquivo ou de uma pasta (sem acento, qualquer caixa)', () => {
  for (const n of ['Cadastro.xlsx', 'cadastro_2026.xlsx', 'CADASTRO DE ECONOMIAS.xlsx', 'Cadastro_pequeno.xlsx', 'pasta/sub/Cadastro.xlsx', 'Cadastró.xlsx', 'Cadastro/data (16).xlsx', 'OneDrive/Cadastro de Economias/data.xlsx']) assert.equal(PC.ehCadastro(n), true, n);
  for (const n of ['Acompanhamento - Pós Corte.xlsx', 'pequeno_xlsxwriter.xlsx', 'Base_Campo_28_09_2026.xlsx', 'data (16).xlsx', '', null]) assert.equal(PC.ehCadastro(n), false, String(n));
});

test('Cadastro: o conteúdo decide, não o nome (pasta "Cadastro", arquivo com nome original ou base de atividades em pasta de nome parecido)', { skip: !fs.existsSync(fx('Cadastro_pequeno.xlsx')) && 'gere as planilhas' }, async () => {
  const cadFile = arquivo(fx('Cadastro_pequeno.xlsx'));
  // pasta chamada Cadastro e arquivo com o nome original do export: é o Cadastro
  assert.equal((await PC.readFileAuto(cadFile, { path: 'Cadastro/data (16).xlsx' })).tipo, 'cadastro');
  // sem nenhuma dica no caminho: a base de atividades não reconhece as colunas e o arquivo é lido como Cadastro
  assert.equal((await PC.readFileAuto(cadFile, { path: 'data (16).xlsx' })).tipo, 'cadastro');
  // base de atividades de verdade, mesmo dentro de uma pasta com "cadastro" no nome: continua sendo atividades
  const atv = await PC.readFileAuto(arquivo(fx('pequeno_xlsxwriter.xlsx')), { path: 'Cadastro 2026/atividades.xlsx' });
  assert.equal(atv.tipo, undefined);
  assert.equal(atv.records.length, 19);
  // arquivo que não serve para nenhum dos dois: o erro é o do leitor indicado pela dica
  await assert.rejects(PC.readFileAuto(arquivo(fx('Cadastro_sem_colunas.xlsx')), { path: 'Cadastro/data (17).xlsx' }), (e) => {
    assert.equal(e.code, 'CAD_SEM_COLUNAS');
    return true;
  });
  await assert.rejects(PC.readFileAuto(arquivo(fx('Cadastro_sem_colunas.xlsx')), { path: 'data (17).xlsx' }), (e) => {
    assert.ok(['NO_BASE_SHEET', 'NO_HEADER'].includes(e.code), e.code);
    return true;
  });
  // erros que não são "colunas diferentes" não são engolidos
  await assert.rejects(PC.readFileAuto(arquivo(fx('texto_disfarçado.xlsx')), { path: 'Cadastro/x.xlsx' }), (e) => e instanceof PC.PcError && e.code === 'NOT_XLSX');
});

test('Cadastro: lê só matrícula e TOTAL_ECO; matrícula repetida no arquivo é desconsiderada', { skip: !fs.existsSync(fx('Cadastro_pequeno.xlsx')) && 'gere as planilhas' }, async () => {
  const cad = await PC.readCadastro(arquivo(fx('Cadastro_pequeno.xlsx')), {});
  const esp = json('pequeno_esperados.json').cadastro;
  assert.equal(cad.tipo, 'cadastro');
  assert.equal(cad.aba, 'Export');
  assert.deepEqual([cad.colunaMatricula, cad.colunaTotal], ['NUM_LIGACAO', 'TOTAL_ECO']);
  for (const k of ['linhas', 'semMatricula', 'distintas', 'repetidas', 'linhasRepetidas', 'semTotal', 'usadas']) assert.equal(cad[k], esp[k], k);
  const utilizaveis = (c) => c.itens.filter(([, , t, n]) => n === 1 && t != null);
  assert.equal(utilizaveis(cad).reduce((a, [, , t]) => a + t, 0), esp.somaUnicas);
  assert.deepEqual(utilizaveis(cad).map(([m]) => m).sort(), ['1001', '3003', '4'], '00004 normalizada; 2002 (repetida) e 5005 (sem total) ficam de fora');
  assert.deepEqual(cad.itens.filter(([, , , n]) => n > 1).map(([m]) => m), ['2002']);
  assert.deepEqual(cad.meses, ['2026-10'], 'o arquivo tem um mês só (Mês/Ano = 10/2026), como o export real');
  // só matrícula, mês, total e nº de linhas são guardados: nada de nome, cidade etc.
  assert.ok(cad.itens.every((x) => x.length === 4 && typeof x[0] === 'string' && typeof x[1] === 'string' && (x[2] === null || typeof x[2] === 'number') && typeof x[3] === 'number'));
  assert.ok(!JSON.stringify(cad).includes('Cliente sintético'), 'colunas de nome/endereço não são lidas');
  // arquivo sem as colunas: mensagem clara
  await assert.rejects(PC.readCadastro(arquivo(fx('Cadastro_sem_colunas.xlsx')), {}), (e) => {
    assert.ok(e instanceof PC.PcError);
    assert.equal(e.code, 'CAD_SEM_COLUNAS');
    assert.match(e.message, /NUM_LIGACAO.*TOTAL_ECO/);
    return true;
  });
});

test('Cadastro com vários meses (Mês/Ano): repetida só conta se repetir no mesmo mês; vale o total do mês da negociação, ou o mês mais próximo', { skip: !fs.existsSync(fx('Cadastro_meses.xlsx')) && 'gere as planilhas' }, async () => {
  const cad = await PC.readCadastro(arquivo(fx('Cadastro_meses.xlsx')), {});
  const e = json('cadastro_meses_esperados.json');
  assert.equal(cad.colunaMes, 'Mês/Ano');
  for (const k of ['linhas', 'semMatricula', 'distintas', 'repetidas', 'linhasRepetidas', 'semTotal', 'usadas']) assert.equal(cad[k], e[k], k);
  assert.deepEqual(cad.meses, e.meses);
  assert.deepEqual(cad.meses, ['2026-07', '2026-08', '2026-09']);
  assert.equal(cad.repetidas, 1, 'só 2002 em 07/2026 repete no mesmo mês; 1001, em três meses, não é repetida');
  // consultas conferidas com a contagem independente (Python): mês exato, mês mais próximo, repetida, sem total e ausente
  const recs = e.consultas.map((c) => ({ matricula: c.mat, mes: c.mes }));
  PC.applyCadastro(recs, cad);
  e.consultas.forEach((c, i) => {
    assert.equal(recs[i].ecoMotivo, c.motivo, `${c.mat} em ${c.mes}`);
    assert.equal(recs[i].eco, c.eco, `${c.mat} em ${c.mes}: total`);
  });
  const q = (mat, mes) => { const r = { matricula: mat, mes }; PC.applyCadastro([r], cad); return [r.ecoMotivo, r.eco]; };
  assert.deepEqual(q('1001', '2026-07'), ['ok', 3], 'mês exato');
  assert.deepEqual(q('1001', '2026-08'), ['ok', 4]);
  assert.deepEqual(q('1001', '2026-12'), ['ok', 4], 'depois do último mês: o mais próximo (09/2026)');
  assert.deepEqual(q('1001', '2026-01'), ['ok', 3], 'antes do primeiro mês: o mais próximo (07/2026)');
  assert.deepEqual(q('2002', '2026-07'), ['rep', null], 'repetida no mesmo mês: desconsiderada');
  assert.deepEqual(q('2002', '2026-08'), ['ok', 5], 'em outro mês a mesma matrícula não repete');
  assert.deepEqual(q('3003', '2026-07'), ['ok', 2], 'só existe em 08/2026: vale para os outros meses');
  assert.deepEqual(q('00004', '2026-07'), ['ok', 2], 'zeros à esquerda');
  assert.deepEqual(q('5005', '2026-07'), ['sem', null], 'sem TOTAL_ECO no mês');
  assert.deepEqual(q('5005', '2026-09'), ['ok', 6]);
  assert.deepEqual(q('5005', '2026-08'), ['sem', null], 'empate entre 07 e 09: vale o mais antigo (sem total)');
  assert.deepEqual(q('9999', '2026-07'), ['sem', null], 'fora do Cadastro');
  // atividade sem data: vale o mês mais recente do Cadastro
  assert.deepEqual(q('1001', ''), ['ok', 4]);
  // pequeno: as 5 negociações (julho, matrícula 1001) valem o total de julho (3), não o de agosto/setembro (4)
  const res = await ler(fx('pequeno_xlsxwriter.xlsx'));
  PC.applyCadastro(res.records, cad);
  const s = PC.summarize(res.records);
  assert.equal(s.economias, 3);
  assert.equal(s.economiasMatriculas, 1);
  // formato gravado por uma versão anterior (um período só) continua funcionando
  const antigo = { tipo: 'cadastro', unicas: [['1001', 7]], repetidasLista: ['2002'] };
  const rs = ['1001', '2002', '3003'].map((m) => ({ matricula: m, mes: '2026-07' }));
  PC.applyCadastro(rs, antigo);
  assert.deepEqual(rs.map((r) => [r.ecoMotivo, r.eco]), [['ok', 7], ['rep', null], ['sem', null]]);
});

test('Serviço avulso (CSV do faturamento): lê N. da Ligacao e soma Qtd. Economia; UTF-8 com BOM e "sep=;" ou Windows-1252 sem cabeçalho de mês', { skip: !fs.existsSync(fx('Servico_avulso_07-2026.csv')) && 'gere as planilhas' }, async () => {
  const e = json('avulso_esperados.json');
  const lerCsv = (n, path) => PC.readServicoAvulso(arquivo(fx(n)), { path: path || n });
  const a07 = await lerCsv('Servico_avulso_07-2026.csv');
  assert.equal(a07.tipo, 'avulso');
  assert.deepEqual([a07.colunaMatricula, a07.colunaMes], ['N. da Ligacao', 'Referencia de Leitura']);
  assert.match(a07.colunaTotal, /Qtd\. Economia Residencial \+ Qtd\. Economia Comercial/);
  for (const k of ['linhas', 'distintas', 'repetidas', 'linhasRepetidas', 'semTotal', 'usadas', 'meses']) assert.deepEqual(a07[k], e['07'][k], '07 ' + k);
  // total = soma das cinco colunas: 1001 tem 2 residenciais + 2 comerciais; 2002 tem duas linhas (serviços diferentes) e é desconsiderada
  const it = (c, mat) => c.itens.filter(([m]) => m === mat);
  assert.deepEqual(it(a07, '1001'), [['1001', '2026-07', 4, 1]]);
  assert.deepEqual(it(a07, '2002'), [['2002', '2026-07', 1, 2]], 'duas linhas no mesmo mês: nº de linhas 2');
  assert.deepEqual(it(a07, '4'), [['4', '2026-07', 2, 1]], 'zeros à esquerda');
  assert.ok(!JSON.stringify(a07).includes('Cliente sintético'), 'nome do cliente não é guardado');
  // Windows-1252, sem BOM, sem a linha sep=; e sem coluna de mês: o mês vem do nome do arquivo
  const a08 = await lerCsv('Servico_avulso_08-2026.csv');
  for (const k of ['linhas', 'distintas', 'repetidas', 'usadas', 'meses']) assert.deepEqual(a08[k], e['08'][k], '08 ' + k);
  assert.deepEqual(it(a08, '1001'), [['1001', '2026-08', 5, 1]]);
  assert.equal(a08.colunaMes, '');
  // CSV que não é o Serviço avulso: erro próprio (o painel ignora)
  await assert.rejects(lerCsv('outro_relatorio.csv'), (er) => er instanceof PC.PcError && er.code === 'AVULSO_SEM_COLUNAS');
  // delimitador, aspas e linha sep= também em texto qualquer
  assert.deepEqual(PC.parseCsv('a;"b;c";"d ""x"" e"\r\n1;2;3', ';'), [['a', 'b;c', 'd "x" e'], ['1', '2', '3']]);
  assert.equal(PC.mesDoNome('Servico_avulso_10-2026.csv'), '2026-10');
  assert.equal(PC.mesDoNome('pasta/Avulso 2026-03.csv'), '2026-03');
  assert.equal(PC.mesDoNome('avulso.csv'), '');
  assert.equal(PC.ehAvulso('Servico_avulso_10-2026.csv'), true);
  assert.equal(PC.ehAvulso('Cadastro.xlsx'), false);
  // vários arquivos: um por mês; havendo dois do mesmo mês, vale o mais recente
  const novoA08 = { ...a08, lastModified: 9e12, name: 'novo.csv' };
  const m = PC.mesclarAvulsos([{ ...a07, lastModified: 1, name: 'a07.csv' }, { ...a08, lastModified: 2, name: 'a08.csv' }, novoA08]);
  assert.deepEqual(m.meses, ['2026-07', '2026-08']);
  assert.equal(m.arquivos, 2);
  assert.equal(m.descartados, 1);
  assert.deepEqual(m.nomes.sort(), ['a07.csv', 'novo.csv']);
  assert.equal(m.distintas, 5, 'matrículas distintas dos dois meses juntas: 1001, 2002, 3003, 7777 e 4');
  assert.equal(PC.mesclarAvulsos([]), null);
});

test('Serviço avulso primeiro, Cadastro de reserva, mínimo de 1: consultas conferidas com a contagem independente (Python)', { skip: !fs.existsSync(fx('Servico_avulso_07-2026.csv')) && 'gere as planilhas' }, async () => {
  const e = json('avulso_esperados.json');
  const a07 = await PC.readServicoAvulso(arquivo(fx('Servico_avulso_07-2026.csv')), { path: 'Servico_avulso_07-2026.csv' });
  const a08 = await PC.readServicoAvulso(arquivo(fx('Servico_avulso_08-2026.csv')), { path: 'Servico_avulso_08-2026.csv' });
  const cad = await PC.readCadastro(arquivo(fx('Cadastro_pequeno.xlsx')), {});
  const avulso = PC.mesclarAvulsos([a07, a08]);
  const recs = e.consultas.map((c) => ({ matricula: c.mat, mes: c.mes }));
  PC.applyCadastro(recs, [avulso, cad]);
  e.consultas.forEach((c, i) => {
    assert.equal(recs[i].ecoMotivo, c.motivo, `${c.mat} em ${c.mes}`);
    assert.equal(recs[i].eco, c.eco, `${c.mat} em ${c.mes}: total`);
  });
  const q = (mat, mes, fontes) => { const r = { matricula: mat, mes }; PC.applyCadastro([r], fontes); return [r.ecoMotivo, r.eco, r.ecoFonte]; };
  assert.deepEqual(q('1001', '2026-07', [avulso, cad]), ['ok', 4, 'avulso'], 'o avulso (4) vale mais que o Cadastro (3)');
  assert.deepEqual(q('1001', '2026-08', [avulso, cad]), ['ok', 5, 'avulso'], 'total do mês da negociação');
  assert.deepEqual(q('1001', '2026-07', [cad]), ['ok', 3, 'cadastro'], 'sem o avulso, o Cadastro');
  assert.deepEqual(q('2002', '2026-07', [avulso, cad]), ['rep', null, ''], 'repetida no avulso e no Cadastro: desconsiderada');
  assert.deepEqual(q('7777', '2026-07', [avulso, cad]), ['ok', 5, 'avulso'], 'só no avulso');
  assert.deepEqual(q('5005', '2026-07', [avulso, cad]), ['sem', null, ''], 'sem total no Cadastro e fora do avulso');
  assert.deepEqual(q('9999', '2026-07', [avulso, cad]), ['sem', null, ''], 'fora das duas fontes');
  assert.deepEqual(q('1001', '2026-07', [null, null]), ['nao', null, ''], 'nenhuma fonte carregada');
  // matrícula repetida no avulso passa para o Cadastro quando lá ela é única
  const so = { tipo: 'avulso', itens: [['55', '2026-07', 2, 2]] };
  const so2 = { tipo: 'cadastro', itens: [['55', '2026-07', 9, 1]] };
  assert.deepEqual(q('55', '2026-07', [so, so2]), ['ok', 9, 'cadastro']);
  // resumo: o total vem das fontes, na ordem, e o mínimo de 1 completa o resto (negociações de 1001 em julho, 2002 e 9999)
  const mk = (matricula) => ({ exec: true, exoc: false, neg: true, valor: null, matricula, mes: '2026-07' });
  const rs = ['1001', '2002', '3003', '9999', '7777'].map(mk);
  PC.applyCadastro(rs, [avulso, cad]);
  const s = PC.summarize(rs);
  assert.equal(s.economias, 4 + 1 + 1 + 1 + 5, '1001 (4) + 2002 (repetida: 1) + 3003 (1) + 9999 (fora: 1) + 7777 (5)');
  assert.equal(s.economiasDoAvulso, 3);
  assert.equal(s.economiasDoCadastro, 0);
  assert.equal(s.economiasPeloMinimo, 2);
  assert.equal(s.economiasRepetidas, 1);
  assert.equal(s.economiasSemCadastro, 1);
});

test('Cadastro: economias recuperadas = soma do TOTAL_ECO das matrículas distintas que negociaram (conferido com contagem independente)', { skip: !fs.existsSync(fx('Cadastro_grande.xlsx')) && 'gere as planilhas' }, async () => {
  for (const [base, cadFx, espFx] of [['pequeno_xlsxwriter.xlsx', 'Cadastro_pequeno.xlsx', 'pequeno_esperados.json'], ['grande_sintetico.xlsx', 'Cadastro_grande.xlsx', 'grande_esperados.json']]) {
    const res = await ler(fx(base));
    const cad = await PC.readCadastro(arquivo(fx(cadFx)), {});
    const esp = json(espFx);
    const e = esp.cadastro;
    for (const k of ['linhas', 'semMatricula', 'distintas', 'repetidas', 'linhasRepetidas', 'semTotal', 'usadas']) assert.equal(cad[k], e[k], base + ' ' + k);
    assert.equal(cad.itens.filter(([, , t, n]) => n === 1 && t != null).reduce((a, [, , t]) => a + t, 0), e.somaUnicas, base + ' soma do TOTAL_ECO das únicas');
    PC.applyCadastro(res.records, cad);
    const s = PC.summarize(res.records);
    assert.equal(s.matriculasNeg, esp.matriculasNeg, base + ' matrículas que negociaram');
    assert.equal(s.economias, e.economias, base + ' economias recuperadas');
    assert.equal(s.economiasMatriculas, e.matriculasUsadas, base + ' matrículas com economia');
    assert.equal(s.economiasRepetidas, e.negRepetidas, base + ' negociadas repetidas no Cadastro');
    assert.equal(s.economiasSemCadastro, e.negSemCadastro, base + ' negociadas fora do Cadastro');
    assert.equal(s.economiasPeloMinimo, e.peloMinimo, base + ' matrículas que contam o mínimo de 1');
    assert.equal(s.economiasSemArquivo, 0);
    assert.ok(Math.abs(s.economiasSobreExec - e.economias / esp.exec) < 1e-9, base + ' ÷ Exec');
    assert.ok(s.economias >= esp.matriculasNeg, base + ' nunca menos de 1 economia por matrícula que negociou');
    // conciliação: toda matrícula que negociou está em exatamente uma das situações
    assert.equal(s.economiasMatriculas + s.economiasRepetidas + s.economiasSemCadastro, s.matriculasNeg);
    assert.equal(s.economiasMatriculas + s.economiasPeloMinimo, s.matriculasNeg);
    assert.equal(s.neg - s.negSemMatricula - s.matriculasNeg, esp.neg - esp.negSemMatricula - esp.matriculasNeg, base + ' negociações repetidas na mesma matrícula (contagem independente)');
    // sem Cadastro carregado: cada matrícula que negociou conta o mínimo de 1
    PC.applyCadastro(res.records, null);
    const sem = PC.summarize(res.records);
    assert.equal(sem.economias, esp.matriculasNeg);
    assert.equal(sem.economiasSemArquivo, esp.matriculasNeg);
  }
});

test('matrículas fora do Cadastro: uma linha por matrícula negociada que não entra nas economias (cidade, negociações, valor, última data)', () => {
  const r = (o) => Object.assign({ neg: true, valor: null, matricula: '', cidade: 'A', categoria: 'R', data: '2026-07-01', ecoMotivo: 'sem' }, o);
  const lista = PC.matriculasForaDoCadastro([
    r({ matricula: '00123', valor: 100, data: '2026-07-01', cidade: 'Zeta' }),
    r({ matricula: ' 123 ', valor: 50.5, data: '2026-08-15', cidade: 'Beta', categoria: 'C' }), // mesma matrícula: junta e vale a cidade da última
    r({ matricula: '99', cidade: 'Beta' }),
    r({ matricula: '1000', cidade: 'Beta' }),
    r({ matricula: '5', ecoMotivo: 'rep' }), // repetida no Cadastro: não entra na lista
    r({ matricula: '6', ecoMotivo: 'ok' }), // está no Cadastro
    r({ matricula: '7', neg: false }), // sem negociação
    r({ matricula: '' }), // sem matrícula
    r({ matricula: '8', ecoMotivo: 'nao' }), // sem Cadastro carregado: nada a listar
  ]);
  assert.deepEqual(lista.map((g) => [g.matricula, g.cidade, g.categoria, g.negociacoes, g.valor, g.ultima]), [
    ['99', 'Beta', 'R', 1, 0, '2026-07-01'],
    ['00123', 'Beta', 'C', 2, 150.5, '2026-08-15'],
    ['1000', 'Beta', 'R', 1, 0, '2026-07-01'],
  ], 'ordenadas por cidade e depois pela matrícula numérica (99, 123, 1000); a matrícula aparece como veio na atividade');
  assert.deepEqual(PC.matriculasForaDoCadastro([]), []);
});

test('matrículas fora do Cadastro: lista conferida com a contagem independente e Excel que abre em outro leitor', { skip: !fs.existsSync(fx('Cadastro_grande.xlsx')) && 'gere as planilhas' }, async (t) => {
  for (const [base, cadFx, espFx] of [['pequeno_xlsxwriter.xlsx', 'Cadastro_pequeno.xlsx', 'pequeno_esperados.json'], ['grande_sintetico.xlsx', 'Cadastro_grande.xlsx', 'grande_esperados.json']]) {
    const res = await ler(fx(base));
    PC.applyCadastro(res.records, await PC.readCadastro(arquivo(fx(cadFx)), {}));
    const lista = PC.matriculasForaDoCadastro(res.records);
    const e = json(espFx).cadastro;
    assert.deepEqual(lista.map((g) => g.chave).sort(), e.foraLista, base + ' matrículas fora do Cadastro');
    assert.equal(lista.length, e.negSemCadastro);
    assert.equal(lista.reduce((a, g) => a + g.negociacoes, 0), e.foraNegociacoes, base + ' negociações dessas matrículas');
    assert.ok(Math.abs(lista.reduce((a, g) => a + g.valor, 0) - e.foraValor) < 0.005, base + ' valor negociado dessas matrículas');
    assert.equal(lista.length, PC.summarize(res.records).economiasSemCadastro, 'a lista tem tantas matrículas quanto a nota do painel');
  }
  // Excel da lista (base grande)
  const py = spawnSync('python3', ['-c', 'import openpyxl'], { encoding: 'utf8' });
  if (py.status !== 0) return t.skip('python3 com openpyxl não disponível');
  const res = await ler(fx('grande_sintetico.xlsx'));
  PC.applyCadastro(res.records, await PC.readCadastro(arquivo(fx('Cadastro_grande.xlsx')), {}));
  const lista = PC.matriculasForaDoCadastro(res.records);
  const sheets = EX.montarExportForaCadastro(lista, { geradoEm: new Date(2026, 9, 7, 10, 5), cadastro: 'data (16).xlsx', periodo: '02/01/2026 a 28/09/2026', filtros: 'nenhum', repetidasNoCadastro: 28, semMatricula: 0 });
  assert.deepEqual(sheets.map((s) => s.nome), ['Resumo', 'Fora do Cadastro']);
  const arq = path.join(os.tmpdir(), 'pc-fora-cad-' + process.pid + '.xlsx');
  fs.writeFileSync(arq, await EX.toXlsx(sheets));
  const o = spawnSync('python3', ['-c', `
import openpyxl, json, sys
wb = openpyxl.load_workbook(sys.argv[1])
ws = wb['Fora do Cadastro']; r = wb['Resumo']
hdr = [c.value for c in ws[1]]
linhas = [[c.value for c in row] for row in ws.iter_rows(min_row=2)]
print(json.dumps({'abas': wb.sheetnames, 'hdr': hdr, 'n': len(linhas), 'tipos': sorted({type(l[0]).__name__ for l in linhas}),
  'mats': sorted(str(l[0]) for l in linhas), 'neg': sum(l[3] for l in linhas), 'valor': round(sum(l[4] for l in linhas), 2),
  'cidades': [l[1] for l in linhas], 'fmt_valor': ws.cell(2, 5).number_format, 'fmt_data': ws.cell(2, 6).number_format,
  'freeze': ws.freeze_panes, 'resumo': {str(row[0].value): row[1].value for row in r.iter_rows(min_row=7) if row[0].value}}, default=str))`, arq], { encoding: 'utf8' });
  fs.unlinkSync(arq);
  assert.equal(o.status, 0, o.stderr);
  const x = JSON.parse(o.stdout);
  const e = json('grande_esperados.json').cadastro;
  assert.deepEqual(x.abas, ['Resumo', 'Fora do Cadastro']);
  assert.deepEqual(x.hdr, ['Matrícula', 'Cidade', 'Categoria', 'Negociações', 'Valor negociado (R$)', 'Última negociação', 'TOTAL_ECO (a preencher)']);
  assert.equal(x.n, e.foraLista.length);
  assert.deepEqual(x.mats, e.foraLista.slice().sort(), 'mesmas matrículas da contagem independente');
  assert.deepEqual(x.tipos, ['int'], 'matrícula como número, igual ao Cadastro');
  assert.equal(x.neg, e.foraNegociacoes);
  assert.ok(Math.abs(x.valor - e.foraValor) < 0.005);
  assert.deepEqual(x.cidades, x.cidades.slice().sort((a, b) => a.localeCompare(b, 'pt-BR')), 'ordenado por cidade');
  assert.match(x.fmt_valor, /R\$/);
  assert.match(x.fmt_data, /d|D/);
  assert.equal(x.freeze, 'A2');
  assert.equal(x.resumo['Matrículas fora do Cadastro'], e.foraLista.length);
  assert.equal(x.resumo['Matrículas repetidas no Cadastro'], 28);
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
    assert.equal(res.foraStatus, 2, 'IDs 24 (Cancelada) e 25 (Paralisada) não contam');
    assert.deepEqual(res.descartados.map((d) => d.id).sort(), ['24', '25'], 'ficam só como marca de versão, sem os demais campos');
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
  conferirEsperados(cons.records, json('pequeno_esperados.json'), { matricula: false });
  assert.equal(res.cobertura.semMatricula, true, 'sem a coluna Matrícula, as economias recuperadas ficam sinalizadas como indisponíveis');
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

test('status: só Finalizada e Encerrada com Ocorrência; a versão mais nova pode anular a antiga', () => {
  const mk = (id, status, extra) => Object.assign({ id, protocolo: 'P' + id, matricula: 'M', codigo: '110010', data: '2026-01-02', dataTxt: '02/01/2026', recurso: 'R', cidade: 'X', status, solicitante: '', linha: 1, arquivo: '' }, extra || {});
  const tomb = (id) => ({ id, protocolo: 'P' + id, matricula: 'M', codigo: '110010', data: '2026-01-02', dataTxt: '02/01/2026', recurso: 'R', linha: 1, descartado: true });
  const antigo = { path: 'antigo', lastModified: 1, records: [mk('1', 'Finalizada'), mk('2', 'Finalizada')], descartados: [] };
  const novo = { path: 'novo', lastModified: 2, records: [mk('3', 'Finalizada')], descartados: [tomb('1'), tomb('9')] };
  const c = PC.consolidate([antigo, novo]);
  assert.deepEqual(c.records.map((r) => r.id).sort(), ['2', '3'], '1 foi cancelada na versão mais nova; 9 nunca contou');
  assert.equal(c.anuladas, 2);
  assert.equal(c.lidos, 5);
  assert.equal(c.duplicatas, 1);
  assert.equal(c.records.length + c.duplicatas + c.anuladas, c.lidos, 'conciliação do painel');
  // versão mais nova finalizada volta a contar mesmo que a antiga tenha sido cancelada
  const volta = PC.consolidate([{ path: 'a', lastModified: 1, records: [], descartados: [tomb('1')] }, { path: 'b', lastModified: 2, records: [mk('1', 'Finalizada')], descartados: [] }]);
  assert.deepEqual(volta.records.map((r) => r.id), ['1']);
});

test('arquivo complementar: só completa o que não existe e, em duplicidade, vale o outro', () => {
  const mk = (id, status) => ({ id, protocolo: 'P' + id, matricula: 'M', codigo: '110010', data: '2026-01-02', dataTxt: '02/01/2026', recurso: 'R', cidade: 'X', status, solicitante: '', linha: 1, arquivo: '' });
  const pasta = { path: 'pasta.xlsx', lastModified: 100, records: [mk('1', 'Finalizada'), mk('2', 'Encerrada com Ocorrência')], descartados: [] };
  // a base foi copiada para a pasta depois (data mais nova), mas é complementar
  const base = { path: 'base.xlsx', lastModified: 999, complementar: true, records: [mk('1', 'Encerrada com Ocorrência'), mk('3', 'Finalizada'), mk('4', 'Finalizada')], descartados: [] };
  const c = PC.consolidate([base, pasta]);
  assert.deepEqual(c.records.map((r) => r.id).sort(), ['1', '2', '3', '4'], 'completa 3 e 4');
  assert.equal(c.records.find((r) => r.id === '1').status, 'Finalizada', 'na duplicidade vale o arquivo da pasta');
  assert.equal(c.duplicatas, 1);
  // sem a marca, o mais recente (a base) venceria
  const semMarca = PC.consolidate([{ ...base, complementar: false }, pasta]);
  assert.equal(semMarca.records.find((r) => r.id === '1').status, 'Encerrada com Ocorrência');
  // um cancelamento na pasta também vale sobre a base complementar
  const cancel = PC.consolidate([base, { path: 'p2', lastModified: 1, records: [], descartados: [{ id: '3', protocolo: 'P3', matricula: 'M', codigo: '110010', data: '2026-01-02', dataTxt: '02/01/2026', recurso: 'R', linha: 1, descartado: true }] }]);
  assert.ok(!cancel.records.some((r) => r.id === '3'));
  assert.deepEqual(PC.ordenarArquivos([{ path: 'b', lastModified: 5 }, { path: 'a', lastModified: 9, complementar: true }, { path: 'c', lastModified: 1 }]).map((f) => f.path), ['a', 'c', 'b']);
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

/* ------------------------------------------------------------------ */
test('indicadores em destaque: percorrido, assertividade, efetividade, equipes e produtividade', async () => {
  const res = await ler(fx('pequeno_xlsxwriter.xlsx'));
  const cons = PC.consolidate([{ ...res, path: 'p', lastModified: 1 }]);
  comFrentes({ records: cons.records, frentes: res.frentes, name: 'p' });
  const esp = json('pequeno_esperados.json');
  const s = PC.summarize(cons.records);
  const perto = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, `${m}: ${a} vs ${b}`);
  assert.equal(s.percorrido, s.exec + s.exoc, 'Percorrido = Exec + Exoc');
  assert.equal(s.percorrido, esp.atividades);
  perto(s.assertividade, esp.assertividade, 'assertividade = termos / exec');
  perto(s.efetividade, esp.efetividade, 'efetividade = negociações / exec');
  assert.equal(s.equipes, esp.equipes, 'equipes que trabalharam');
  assert.equal(s.dias, esp.dias);
  assert.equal(s.equipeDias, esp.equipeDias);
  perto(s.produtividade, esp.produtividade, 'produtividade = percorrido / equipe-dias');
  // equipes por dia: filtrando um único dia
  for (const [dia, n] of Object.entries(esp.equipesPorDia)) {
    const d = PC.summarize(PC.filterRecords(cons.records, { from: dia, to: dia }));
    assert.equal(d.equipes, n, 'equipes em ' + dia);
    assert.equal(d.dias, 1);
  }
  // produtividade por cidade
  for (const g of PC.agrupar(cons.records, 'cidade')) {
    const e = esp.porCidadeProd[g.chave.toLowerCase()];
    assert.equal(g.percorrido, e.percorrido);
    assert.equal(g.equipeDias, e.equipeDias);
    perto(g.produtividade, e.produtividade, 'produtividade da cidade');
    perto(g.assertividade, e.assertividade, 'assertividade da cidade');
    perto(g.efetividade, e.efetividade, 'efetividade da cidade');
  }
  // sem Exec não há divisão por zero
  const vazio = PC.summarize([]);
  assert.deepEqual([vazio.assertividade, vazio.efetividade, vazio.produtividade, vazio.equipes], [null, null, null, 0]);
});

test('equipe-dia: a mesma equipe em dois dias conta duas vezes; equipes sem data não entram em equipe-dias', () => {
  const r = (recurso, data, extra) => Object.assign({ recurso, data, exec: true, exoc: false, neg: false, semDesdobro: false, termo: false, t11: false, t31: false, valor: null }, extra || {});
  const s = PC.summarize([r('A', '2026-01-01'), r('A', '2026-01-01'), r('A', '2026-01-02'), r('B', '2026-01-02'), r('C', ''), r('', '2026-01-03')]);
  assert.equal(s.equipes, 3, 'A, B e C trabalharam');
  assert.equal(s.dias, 3);
  assert.equal(s.equipeDias, 3, '(A,01) (A,02) (B,02); sem data ou sem recurso não formam equipe-dia');
  assert.equal(s.percorrido, 6);
  assert.equal(s.produtividade, 2);
});

test('exportação para Excel: o .xlsx abre em outro leitor e traz os mesmos números', async (t) => {
  const py = spawnSync('python3', ['-c', 'import openpyxl'], { encoding: 'utf8' });
  if (py.status !== 0) return t.skip('python3 com openpyxl não disponível');
  const res = await ler(fx('pequeno_xlsxwriter.xlsx'));
  const cons = PC.consolidate([{ ...res, path: 'p', lastModified: 1 }]);
  comFrentes({ records: cons.records, frentes: res.frentes, name: 'p' });
  const esp = json('pequeno_esperados.json');
  const sheets = EX.montarExport(cons.records, { geradoEm: new Date(2026, 8, 30, 10, 5), fonte: 'pasta X', periodo: '03/07/2026 a 28/09/2026', filtros: 'Cidade: Cidade Norte' });
  const bytes = await EX.toXlsx(sheets);
  assert.equal(String.fromCharCode(bytes[0], bytes[1]), 'PK');
  const arq = path.join(os.tmpdir(), 'pc-export-' + process.pid + '.xlsx');
  fs.writeFileSync(arq, bytes);
  const code = `
import openpyxl, json, sys
wb = openpyxl.load_workbook(sys.argv[1])
r = wb['Resumo']
resumo = {str(row[0].value): row[1].value for row in r.iter_rows(min_row=8) if row[0].value}
reg = wb['Registros']
hdr = [c.value for c in reg[1]]
i_sol = hdr.index('Nome do Solicitante'); i_val = hdr.index('Valor Total dos Débitos'); i_dat = hdr.index('Data')
hyper = [c for c in reg.iter_rows(min_row=2) if c[i_sol].value and str(c[i_sol].value).startswith('=')]
cid = wb['Produtividade por cidade']
out = {
  'abas': wb.sheetnames, 'titulo': r['A1'].value, 'filtros': r['B5'].value, 'resumo': resumo,
  'registros': reg.max_row - 1, 'colunas': reg.max_column, 'cab': hdr[:3],
  'formula_tipo': hyper[0][i_sol].data_type if hyper else None, 'formula_valor': hyper[0][i_sol].value if hyper else None,
  'fmt_valor': reg.cell(2, i_val + 1).number_format, 'fmt_data': reg.cell(2, i_dat + 1).number_format,
  'freeze': reg.freeze_panes, 'filtro_auto': reg.auto_filter.ref,
  'cidades': [[c.value for c in row] for row in cid.iter_rows(min_row=2)],
  'pct_fmt': r['B12'].number_format,
}
print(json.dumps(out, default=str))`;
  const o = spawnSync('python3', ['-c', code, arq], { encoding: 'utf8' });
  fs.unlinkSync(arq);
  assert.equal(o.status, 0, o.stderr);
  const x = JSON.parse(o.stdout);
  assert.deepEqual(x.abas, ['Resumo', 'Mensal', 'Produtividade por cidade', 'Categorias', 'Equipes', 'Frentes', 'Registros']);
  assert.equal(x.titulo, 'Pós-Corte Interior');
  assert.equal(x.filtros, 'Cidade: Cidade Norte');
  const perto = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, a + ' vs ' + b);
  assert.equal(x.resumo['Percorrido'], esp.atividades);
  assert.equal(x.resumo['Total de Exec'], esp.exec);
  assert.equal(x.resumo['Total de Exoc'], esp.exoc);
  assert.equal(x.resumo['Termos aplicados'], esp.termos);
  assert.equal(x.resumo['Negociações'], esp.neg);
  assert.equal(x.resumo['Negociações Sem Desdobro'], esp.semDesdobro);
  perto(x.resumo['Assertividade'], esp.assertividade);
  perto(x.resumo['Efetividade'], esp.efetividade);
  perto(x.resumo['Débito informado nas negociações'], esp.debito);
  assert.equal(x.resumo['Equipes que trabalharam'], esp.equipes);
  perto(x.resumo['Produtividade (visitas por equipe por dia)'], esp.produtividade);
  assert.equal(x.registros, esp.atividades, 'todas as linhas filtradas, sem cortar');
  assert.equal(x.colunas, PC.CSV_COLUMNS.length);
  assert.notEqual(x.formula_tipo, 'f', 'texto iniciado por "=" fica como texto, não vira fórmula');
  assert.equal(x.formula_valor, '=HYPERLINK("x")');
  assert.match(x.fmt_valor, /R\$/);
  assert.equal(x.fmt_data, 'dd/mm/yyyy');
  assert.equal(x.pct_fmt, '0.0%');
  assert.equal(x.freeze, 'A2');
  assert.match(x.filtro_auto, /^A1:/);
  const e = esp.porCidadeProd['cidade norte'];
  assert.equal(x.cidades.length, 1);
  assert.equal(x.cidades[0][1], e.percorrido);
  perto(x.cidades[0][10], e.produtividade);
});

test('exportação para Excel: grande (8.136 linhas) gera arquivo válido e compacto', { skip: !fs.existsSync(fx('grande_sintetico.xlsx')) && 'gere as planilhas', timeout: 120000 }, async () => {
  const res = await ler(fx('grande_sintetico.xlsx'));
  const cons = PC.consolidate([{ ...res, path: 'g', lastModified: 1 }]);
  comFrentes({ records: cons.records, frentes: res.frentes, name: 'g' });
  const t0 = performance.now();
  const bytes = await EX.toXlsx(EX.montarExport(cons.records, {}));
  console.log(`  xlsx de ${cons.records.length} registros: ${(bytes.length / 1048576).toFixed(2)} MB em ${Math.round(performance.now() - t0)} ms`);
  assert.ok(bytes.length < 6 * 1048576, 'compactado');
  assert.equal(EX.crc32(new TextEncoder().encode('123456789')), 0xcbf43926, 'CRC-32 padrão');
});

/* ---------- Bases de campo ---------- */

test('bases de campo: data no nome do arquivo e chave normalizada', () => {
  const d = PC.dataDoNome;
  assert.equal(d('Base_Campo_28_09_2026.xlsx'), '2026-09-28');
  assert.equal(d('Base 28-09-26.xlsx'), '2026-09-28');
  assert.equal(d('base_2026-09-05.xlsx'), '2026-09-05');
  assert.equal(d('Base_28092026.xlsx'), '2026-09-28');
  assert.equal(d('base_20260928.xlsx'), '2026-09-28');
  assert.equal(d('Base_31_02_2026.xlsx'), '', 'data inexistente');
  assert.equal(d('Base sem data.xlsx'), '');
  assert.equal(PC.chaveNorm(' 00123 '), '123');
  assert.equal(PC.chaveNorm('123.0'), '123');
  assert.equal(PC.chaveNorm('ab 12'), 'AB12');
});

test('bases de campo: leitura de todas as colunas e cabeçalho de chave', { skip: !fs.existsSync(fx('Base_Campo_28_09_2026.xlsx')) && 'gere as planilhas' }, async () => {
  const b = await PC.readBaseCampo(arquivo(fx('Base_Campo_28_09_2026.xlsx')));
  assert.deepEqual(b.colunas, ['Cód. Protocolo Origem', 'Matrícula', 'Cidade', 'Endereço', 'Data do corte']);
  assert.equal(b.linhas.length, 5);
  assert.equal(b.colProtocolo, 0);
  assert.equal(b.colMatricula, 1);
  assert.equal(b.dataNome, '2026-09-28');
  assert.equal(b.linhas[0][4], '01/09/2026', 'datas em dd/mm/aaaa');
  assert.equal(b.linhas[4][0], '', 'célula vazia mantém a posição da coluna');
  await assert.rejects(PC.readBaseCampo(arquivo(fx('Base_Sem_Chave.xlsx'))), (e) => e.code === 'SEM_CHAVE');
});

test('bases de campo: cruzamento pela Matrícula, só serviços de pós-corte, data da base, repetidas e sem matrícula', () => {
  const rec = (o) => ({ codigo: '110010-PÓS CORTE', protocolo: '', matricula: '', data: '2026-09-10', recurso: 'E1', exec: true, exoc: false, neg: false, semDesdobro: false, termo: false, t11: false, t31: false, valor: null, recorte: false, recorteTipo: '', ...o });
  const records = [
    rec({ matricula: '1001', data: '2026-09-10' }),
    rec({ matricula: '1001', data: '2026-09-12', exec: false, exoc: true, recurso: 'E2' }), // mais recente
    rec({ matricula: '2002', data: '2026-01-05', neg: true, semDesdobro: true, termo: true, t11: true }),
    rec({ matricula: '5005', data: '2026-06-01', recorte: true, recorteTipo: 'RAMAL', codigo: '310012 - AVANÇADO' }),
    rec({ matricula: '6006', codigo: '180001 - OUTRO SERVIÇO' }), // fora dos serviços de pós-corte: não amarra
    rec({ matricula: '7007', codigo: '' }),
  ];
  const base = {
    colProtocolo: 0, colMatricula: 1,
    linhas: [['a', '1001'], ['b', ' 1001 '], ['c', '2002'], ['d', '3003'], ['e', ''], ['f', '5005'], ['g', '6006'], ['h', '7007']],
  };
  const av = PC.avaliarBase(base, records, '');
  assert.equal(av.duplicadas, 1, '1001 repetida');
  assert.equal(av.semChave, 1);
  assert.equal(av.total, 7);
  assert.equal(av.percorridos, 3, '1001, 2002 e 5005; 6006 e 7007 não são serviços de pós-corte');
  assert.deepEqual(av.pendentes, [3, 4, 6, 7]);
  assert.equal(av.resumo.exoc, 1, 'vale a atividade mais recente de 1001');
  assert.equal(av.resumo.exec, 2);
  assert.equal(av.resumo.neg, 1);
  assert.equal(av.resumo.semDesdobro, 1);
  assert.equal(av.resumo.termos, 1);
  assert.equal(av.resumo.recortes, 1);
  assert.deepEqual(av.resumo.recorteTipos, { RAMAL: 1 });
  assert.equal(av.resumo.equipes, 2);
  // com data da base só conta atividade a partir dela
  const com = PC.avaliarBase(base, records, '2026-09-01');
  assert.equal(com.percorridos, 1, 'só 1001 (2002 e 5005 são anteriores)');
  assert.deepEqual(com.pendentes, [2, 3, 4, 5, 6, 7]);
});

test('recorte: Fez o corte novamente = Sim e tipo por "Onde Foi Feito O Corte?"', { skip: !fs.existsSync(fx('pequeno_xlsxwriter.xlsx')) && 'gere as planilhas' }, async () => {
  const res = await ler(fx('pequeno_xlsxwriter.xlsx'));
  const s = PC.summarize(res.records);
  assert.equal(s.recortes, 5, 'ids 2, 3, 4, 6 e 7 (o 5 é NÃO)');
  assert.deepEqual(s.recorteTipos, { RAMAL: 3, 'CAVALETE SIMPLES': 1, 'NÃO INFORMADO': 1 });
  assert.equal(s.exec, 18);
  assert.ok(Math.abs(s.recorteSobreExec - 5 / 18) < 1e-9);
  assert.equal(res.cobertura.semRecorte, false);
  assert.equal(res.cobertura.semMatricula, false);
});

test('bases de campo: Excel com o resumo e as linhas que faltam', async () => {
  const base = { colunas: ['Cód. Protocolo Origem', 'Cidade'], linhas: [['OS1', 'A'], ['OS2', 'B']], colProtocolo: 0, colMatricula: -1 };
  const av = PC.avaliarBase(base, [], '');
  const sheets = EX.montarExportBase(base, av, { nome: 'b.xlsx', enviadoEm: '30/09/2026 10:00', dataBase: '28/09/2026' });
  assert.equal(sheets[1].nome, 'Faltam percorrer');
  assert.equal(sheets[1].linhas.length, 3, 'cabeçalho + 2 linhas');
  const bytes = await EX.toXlsx(sheets);
  assert.ok(bytes.length > 500);
});

test('bases de campo: com várias abas usa a de Pós Corte e reconhece NUM_LIGACAO como matrícula', { skip: !fs.existsSync(fx('Base_Multi_Abas_25_09.xlsx')) && 'gere as planilhas' }, async () => {
  const b = await PC.readBaseCampo(arquivo(fx('Base_Multi_Abas_25_09.xlsx')), { ref: new Date(2026, 8, 30) });
  assert.equal(b.aba, 'Pós Corte', 'não a primeira aba (Unijato, outro serviço)');
  assert.deepEqual(b.colunas.slice(0, 3), ['NUM_LIGACAO', 'Zona', 'Cód. Protocolo Origem']);
  assert.equal(b.colMatricula, 0);
  assert.equal(b.linhas.length, 2);
  assert.equal(b.dataNome, '2026-09-25');
});

test('categoria: agrupa por Categoria, ordena pelo maior percorrido e usa "(sem categoria)"', () => {
  const rec = (c, o) => ({ categoria: c, recurso: 'E1', data: '2026-09-10', exec: true, exoc: false, neg: false, semDesdobro: false, termo: false, t11: false, t31: false, valor: null, recorte: false, recorteTipo: '', ...o });
  const g = PC.agrupar([rec('R-RESIDENCIAL'), rec('R-RESIDENCIAL'), rec('R-RESIDENCIAL', { exec: false, exoc: true }), rec('C-COMERCIAL'), rec('C-COMERCIAL'), rec('')], 'categoria');
  assert.deepEqual(g.map((x) => [x.chave, x.percorrido]), [['R-RESIDENCIAL', 3], ['C-COMERCIAL', 2], ['(sem categoria)', 1]]);
  assert.equal(g[0].exoc, 1);
});
