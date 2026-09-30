/*!
 * Pós-Corte Interior — exportação para Excel (.xlsx gravado sem bibliotecas).
 * Depende do núcleo (core.js): summarize, monthlySeries, agrupar e CSV_COLUMNS.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.PosCorteExport = factory(root.PosCorte);
})(typeof self !== 'undefined' ? self : this, function (PC) {
  'use strict';

  const { summarize, monthlySeries, agrupar, CSV_COLUMNS } = PC;
  const pad2 = (n) => (n < 10 ? '0' + n : '' + n);

  /* ------------------------------------------------------------------ */
  /* ZIP                                                                 */
  /* ------------------------------------------------------------------ */

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(u8) {
    let c = 0xffffffff;
    for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  async function deflateRaw(u8) {
    if (typeof CompressionStream === 'undefined') return null;
    const cs = new CompressionStream('deflate-raw');
    const w = cs.writable.getWriter();
    w.write(u8);
    w.close();
    return new Uint8Array(await new Response(cs.readable).arrayBuffer());
  }

  /** Pacote ZIP: arquivos = [{ nome, dados: Uint8Array }]. */
  async function criarZip(arquivos) {
    const enc = new TextEncoder();
    const partes = [];
    const central = [];
    let offset = 0;
    for (const a of arquivos) {
      const nome = enc.encode(a.nome);
      const crc = crc32(a.dados);
      let comp = await deflateRaw(a.dados);
      let metodo = 8;
      if (!comp || comp.length >= a.dados.length) { comp = a.dados; metodo = 0; }
      const lh = new Uint8Array(30 + nome.length);
      const lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true); // nomes em UTF-8
      lv.setUint16(8, metodo, true);
      lv.setUint16(10, 0, true);
      lv.setUint16(12, 0x21, true); // 01/01/1980
      lv.setUint32(14, crc, true);
      lv.setUint32(18, comp.length, true);
      lv.setUint32(22, a.dados.length, true);
      lv.setUint16(26, nome.length, true);
      lh.set(nome, 30);
      const ch = new Uint8Array(46 + nome.length);
      const cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, metodo, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0x21, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, comp.length, true);
      cv.setUint32(24, a.dados.length, true);
      cv.setUint16(28, nome.length, true);
      cv.setUint32(42, offset, true);
      ch.set(nome, 46);
      partes.push(lh, comp);
      central.push(ch);
      offset += lh.length + comp.length;
    }
    const cdTam = central.reduce((n, c) => n + c.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, arquivos.length, true);
    ev.setUint16(10, arquivos.length, true);
    ev.setUint32(12, cdTam, true);
    ev.setUint32(16, offset, true);
    const todos = partes.concat(central, [eocd]);
    const out = new Uint8Array(todos.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of todos) { out.set(p, o); o += p.length; }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* XLSX                                                                */
  /* ------------------------------------------------------------------ */

  const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const xmlEsc = (v) => String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // índices de estilo (cellXfs) definidos em stylesXml()
  const ESTILO = { padrao: 0, cab: 1, int: 2, pct: 3, brl: 4, data: 5, dec: 6, titulo: 7, negrito: 8 };

  function colXlsx(i) {
    let s = '';
    for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    return s;
  }

  function stylesXml() {
    return (
      XML_HEAD +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="4"><numFmt numFmtId="164" formatCode="0.0%"/><numFmt numFmtId="165" formatCode="&quot;R$&quot;\\ #,##0.00"/><numFmt numFmtId="166" formatCode="dd/mm/yyyy"/><numFmt numFmtId="167" formatCode="0.0"/></numFmts>' +
      '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="15"/><name val="Calibri"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCE6F5"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="9">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
    );
  }

  /** Data ISO (aaaa-mm-dd) -> número de série do Excel. */
  function isoParaSerial(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000 : null;
  }

  /**
   * Célula: texto, número (padrão), ou { v, f } com f em cab | int | pct | brl | data | dec | titulo | negrito.
   * Textos são gravados como texto (nunca como fórmula), então "=..." não executa no Excel.
   */
  function celulaXlsx(ref, cel) {
    if (cel == null || cel === '') return '';
    let v = cel;
    let f = 'padrao';
    if (typeof cel === 'object') { v = cel.v; f = cel.f || 'padrao'; }
    if (v == null || v === '' || (typeof v === 'number' && !isFinite(v))) return f === 'cab' ? `<c r="${ref}" s="${ESTILO.cab}"/>` : '';
    const st = ESTILO[f] || 0;
    if (typeof v === 'number') return `<c r="${ref}"${st ? ` s="${st}"` : ''}><v>${v}</v></c>`;
    return `<c r="${ref}"${st ? ` s="${st}"` : ''} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
  }

  /** Planilha: { nome, colunas: [largura...], linhas: [[cel...]...], cabecalho?: nº da linha (1-based) a congelar/filtrar }. */
  function sheetXml(sh) {
    const nCols = Math.max(1, ...sh.linhas.map((l) => l.length));
    let x = XML_HEAD + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0">';
    if (sh.cabecalho) x += `<pane ySplit="${sh.cabecalho}" topLeftCell="A${sh.cabecalho + 1}" activePane="bottomLeft" state="frozen"/>`;
    x += '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>';
    if (sh.colunas && sh.colunas.length) x += '<cols>' + sh.colunas.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>';
    x += '<sheetData>';
    sh.linhas.forEach((lin, ri) => {
      const cels = lin.map((c, ci) => celulaXlsx(colXlsx(ci) + (ri + 1), c)).join('');
      x += `<row r="${ri + 1}">${cels}</row>`;
    });
    x += '</sheetData>';
    if (sh.cabecalho) x += `<autoFilter ref="A${sh.cabecalho}:${colXlsx(nCols - 1)}${sh.linhas.length}"/>`;
    return x + '</worksheet>';
  }

  /** Gera o arquivo .xlsx (Uint8Array) a partir de planilhas [{ nome, colunas, linhas, cabecalho }]. */
  async function toXlsx(sheets) {
    const enc = new TextEncoder();
    const nomes = sheets.map((sh, i) => String(sh.nome).replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Planilha' + (i + 1));
    const arqs = [];
    arqs.push({ nome: '[Content_Types].xml', dados: enc.encode(XML_HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>') });
    arqs.push({ nome: '_rels/.rels', dados: enc.encode(XML_HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') });
    arqs.push({ nome: 'xl/workbook.xml', dados: enc.encode(XML_HEAD + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + nomes.map((n, i) => `<sheet name="${xmlEsc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>') });
    arqs.push({ nome: 'xl/_rels/workbook.xml.rels', dados: enc.encode(XML_HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) });
    arqs.push({ nome: 'xl/styles.xml', dados: enc.encode(stylesXml()) });
    sheets.forEach((sh, i) => arqs.push({ nome: `xl/worksheets/sheet${i + 1}.xml`, dados: enc.encode(sheetXml(sh)) }));
    return criarZip(arqs);
  }

  /* ------------------------------------------------------------------ */
  /* Conteúdo da exportação                                              */
  /* ------------------------------------------------------------------ */

  const pctCel = (v) => ({ v, f: 'pct' });
  const intCel = (v) => ({ v, f: 'int' });
  const decCel = (v) => ({ v, f: 'dec' });
  const cab = (t) => ({ v: t, f: 'cab' });

  /**
   * Planilhas da exportação para Excel a partir dos registros já filtrados.
   * `info`: { geradoEm: Date, periodo: 'texto', filtros: 'texto', fonte: 'texto' }.
   */
  function montarExport(records, info) {
    info = info || {};
    const s = summarize(records);
    const dt = info.geradoEm instanceof Date ? info.geradoEm : new Date();
    const dtTxt = `${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
    const resumo = {
      nome: 'Resumo',
      colunas: [38, 22, 70],
      linhas: [
        [{ v: 'Pós-Corte Interior', f: 'titulo' }],
        [{ v: 'Gerado em', f: 'negrito' }, dtTxt],
        [{ v: 'Fonte', f: 'negrito' }, info.fonte || '—'],
        [{ v: 'Período dos dados', f: 'negrito' }, info.periodo || '—'],
        [{ v: 'Filtros aplicados', f: 'negrito' }, info.filtros || 'nenhum'],
        [],
        [cab('Indicador'), cab('Valor'), cab('Como é calculado')],
        ['Percorrido', intCel(s.percorrido), 'Exec + Exoc'],
        ['Total de Exec', intCel(s.exec), 'Status da Atividade = Finalizada'],
        ['Total de Exoc', intCel(s.exoc), 'Status da Atividade = Encerrada com Ocorrência'],
        ['Termos aplicados', intCel(s.termos), 'Serviço adicionais resposta contém o código 110013 (Serviços) ou 310013 (VCG)'],
        ['Assertividade', pctCel(s.assertividade), 'Termos ÷ Exec'],
        ['Negociações', intCel(s.neg), 'Negociou O Débito? = Sim'],
        ['Efetividade', pctCel(s.efetividade), 'Negociações ÷ Exec'],
        ['Negociações Sem Desdobro', intCel(s.semDesdobro), 'Negociação com Serviço adicionais resposta vazio (subconjunto das negociações)'],
        ['Débito informado nas negociações', { v: s.debito, f: 'brl' }, 'Soma de Valor Total dos Débitos das negociações; não é arrecadação nem valor pago'],
        ['Equipes que trabalharam', intCel(s.equipes), 'Recursos distintos com ao menos uma atividade no período'],
        ['Dias com atividade', intCel(s.dias), 'Datas distintas no período'],
        ['Média de equipes por dia', decCel(s.equipesPorDia), 'Equipe-dias ÷ dias com atividade'],
        ['Produtividade (visitas por equipe por dia)', decCel(s.produtividade), 'Percorrido ÷ equipe-dias (uma equipe trabalhando um dia = 1 equipe-dia)'],
      ],
    };

    const mensal = {
      nome: 'Mensal',
      colunas: [12, 12, 10, 10, 10, 13, 13, 12, 13, 10, 8, 18],
      cabecalho: 1,
      linhas: [['Mês', 'Percorrido', 'Exec', 'Exoc', 'Termos', 'Assertividade', 'Negociações', 'Efetividade', 'Sem Desdobro', 'Equipes', 'Dias', 'Débito informado'].map(cab)].concat(
        monthlySeries(records).map((m) => [m.rotulo, intCel(m.sum.percorrido), intCel(m.sum.exec), intCel(m.sum.exoc), intCel(m.sum.termos), pctCel(m.sum.assertividade), intCel(m.sum.neg), pctCel(m.sum.efetividade), intCel(m.sum.semDesdobro), intCel(m.sum.equipes), intCel(m.sum.dias), { v: m.sum.debito, f: 'brl' }])
      ),
    };

    const linhaGrupo = (g) => [g.chave, intCel(g.percorrido), intCel(g.exec), intCel(g.exoc), intCel(g.termos), pctCel(g.assertividade), intCel(g.neg), pctCel(g.efetividade), intCel(g.equipes), intCel(g.equipeDias), decCel(g.produtividade)];
    const cidades = {
      nome: 'Produtividade por cidade',
      colunas: [30, 12, 10, 10, 10, 13, 13, 12, 10, 12, 16],
      cabecalho: 1,
      linhas: [['Cidade', 'Percorrido', 'Exec', 'Exoc', 'Termos', 'Assertividade', 'Negociações', 'Efetividade', 'Equipes', 'Equipe-dias', 'Produtividade (visitas por equipe-dia)'].map(cab)].concat(agrupar(records, 'cidade').map(linhaGrupo)),
    };

    const equipes = {
      nome: 'Equipes',
      colunas: [26, 26, 12, 10, 10, 10, 13, 16, 16],
      cabecalho: 1,
      linhas: [['Equipe (recurso)', 'Frente', 'Percorrido', 'Exec', 'Exoc', 'Termos', 'Negociações', 'Dias trabalhados', 'Produtividade (visitas por dia)'].map(cab)].concat(
        agrupar(records, 'recurso').map((g) => [g.chave, g.frente, intCel(g.percorrido), intCel(g.exec), intCel(g.exoc), intCel(g.termos), intCel(g.neg), intCel(g.dias), decCel(g.dias ? g.percorrido / g.dias : null)])
      ),
    };

    const frentes = {
      nome: 'Frentes',
      colunas: [30, 12, 10, 10, 10, 13, 13, 12, 10],
      cabecalho: 1,
      linhas: [['Frente', 'Percorrido', 'Exec', 'Exoc', 'Termos', 'Assertividade', 'Negociações', 'Efetividade', 'Equipes'].map(cab)].concat(
        agrupar(records, 'frente').map((g) => [g.chave, intCel(g.percorrido), intCel(g.exec), intCel(g.exoc), intCel(g.termos), pctCel(g.assertividade), intCel(g.neg), pctCel(g.efetividade), intCel(g.equipes)])
      ),
    };

    const colsReg = CSV_COLUMNS;
    const registros = {
      nome: 'Registros',
      colunas: colsReg.map((c) => (c.header.length > 24 ? 30 : Math.max(12, c.header.length + 3))),
      cabecalho: 1,
      linhas: [colsReg.map((c) => cab(c.header))].concat(
        records.map((r) => colsReg.map((c) => {
          if (c.header === 'Data') return r.data ? { v: isoParaSerial(r.data), f: 'data' } : r.dataTxt;
          if (c.header === 'Valor Total dos Débitos') return r.valor == null ? null : { v: r.valor, f: 'brl' };
          return c.get(r);
        }))
      ),
    };
    return [resumo, mensal, cidades, equipes, frentes, registros];
  }


  /**
   * Excel de uma base enviada a campo: resumo dos indicadores e as linhas que ainda faltam percorrer.
   * `meta`: { nome, enviadoEm: 'texto', dataBase: 'texto', geradoEm: Date }.
   */
  function montarExportBase(base, av, meta) {
    meta = meta || {};
    const r = av.resumo;
    const dt = meta.geradoEm instanceof Date ? meta.geradoEm : new Date();
    const dtTxt = `${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
    const resumo = {
      nome: 'Resumo da base',
      colunas: [34, 22, 70],
      linhas: [
        [{ v: 'Pós-Corte Interior — Base enviada a campo', f: 'titulo' }],
        [{ v: 'Base', f: 'negrito' }, meta.nome || '—'],
        [{ v: 'Enviada (subida) em', f: 'negrito' }, meta.enviadoEm || '—'],
        [{ v: 'Data da base', f: 'negrito' }, meta.dataBase || 'não informada'],
        [{ v: 'Gerado em', f: 'negrito' }, dtTxt],
        [],
        [cab('Indicador'), cab('Valor'), cab('Como é calculado')],
        ['Total da base', intCel(av.total), 'Protocolos distintos da base (' + av.chave + ')'],
        ['Percorrido da base', intCel(av.percorridos), 'Protocolos da base com atividade Exec ou Exoc no histórico da base principal'],
        ['Faltam percorrer', intCel(av.faltam), 'Total da base − percorrido (linhas na aba "Faltam percorrer")'],
        ['% percorrido', pctCel(av.pct), 'Percorrido ÷ total da base'],
        ['Total de Exec', intCel(r.exec), 'Status da Atividade = Finalizada'],
        ['Total de Exoc', intCel(r.exoc), 'Status da Atividade = Encerrada com Ocorrência'],
        ['Termos aplicados', intCel(r.termos), 'Serviço adicionais resposta contém o código 110013 (Serviços) ou 310013 (VCG)'],
        ['Assertividade', pctCel(r.assertividade), 'Termos ÷ Exec'],
        ['Negociações', intCel(r.neg), 'Negociou O Débito? = Sim'],
        ['Efetividade', pctCel(r.efetividade), 'Negociações ÷ Exec'],
        ['Negociações Sem Desdobro', intCel(r.semDesdobro), 'Negociação com Serviço adicionais resposta vazio'],
        ['Equipes que trabalharam', intCel(r.equipes), 'Recursos distintos nas atividades desta base'],
        ['Recortes realizados', intCel(r.recortes), 'Fez o corte novamente = Sim'],
        ['Recortes ÷ Exec', pctCel(r.recorteSobreExec), 'Total de recortes ÷ total de Exec'],
      ].concat(Object.entries(r.recorteTipos || {}).sort((a, b) => b[1] - a[1]).map(([t, n]) => ['Recorte: ' + t, intCel(n), (r.recortes ? (n / r.recortes * 100).toFixed(1).replace('.', ',') : '0') + '% dos recortes (Onde Foi Feito O Corte?)'])),
    };
    const faltam = {
      nome: 'Faltam percorrer',
      colunas: base.colunas.map((c) => (c.length > 24 ? 30 : Math.max(14, c.length + 3))),
      cabecalho: 1,
      linhas: [base.colunas.map(cab)].concat(av.pendentes.map((i) => base.linhas[i])),
    };
    return [resumo, faltam];
  }
  return { toXlsx, montarExport, montarExportBase, criarZip, crc32, isoParaSerial };
});
