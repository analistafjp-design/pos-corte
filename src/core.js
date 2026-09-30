/*!
 * Acompanhamento de Pós Corte — núcleo de dados (AnalistaFJP)
 *
 * Contém: leitor de .xlsx por streaming (ZIP + XML incremental, sem árvore DOM),
 * regras dos indicadores, deduplicação, frentes de serviço, agregações e CSV.
 * Roda no navegador (Chrome/Edge) e no Node (testes) sem dependências externas.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PosCorte = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Erros e utilitários de texto                                        */
  /* ------------------------------------------------------------------ */

  class PcError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'PcError';
      this.code = code;
    }
  }

  const stripAccents = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const norm = (v) => stripAccents(String(v == null ? '' : v)).toLowerCase().replace(/\s+/g, ' ').trim();
  const normHeader = (v) => norm(v).replace(/[^a-z0-9]+/g, ' ').trim();
  const isBlank = (v) => v == null || String(v).trim() === '';

  /** Versão das regras de leitura; muda quando o resultado gravado deixa de valer. */
  const PARSER_VERSION = 2;

  /** Serviços considerados (início de "Código/Descrição"); os demais não são carregados. */
  const CODIGOS_SERVICO = ['110010', '110011', '110012', '210010', '210011', '210012', '310010', '310011', '310012'];
  const RE_CODIGO_SERVICO = /^\s*(\d{6})(?!\d)/;
  function codigoServico(v) {
    const m = RE_CODIGO_SERVICO.exec(String(v == null ? '' : v));
    return m ? m[1] : '';
  }

  const NAO_MAPEADA = 'Não mapeada';
  const SEM_DATA = 'Sem data';

  /* ------------------------------------------------------------------ */
  /* Campos mantidos no modelo de atividades                             */
  /* ------------------------------------------------------------------ */

  // `critical`: sem esta coluna o indicador seria calculado errado; o arquivo é recusado.
  const FIELDS = [
    { key: 'recurso', header: 'Recurso', critical: true },
    { key: 'protocolo', header: 'Cód. Protocolo Origem', aliases: ['Código Protocolo Origem'] },
    { key: 'id', header: 'ID da Atividade' },
    { key: 'matricula', header: 'Matrícula' },
    { key: 'codigo', header: 'Código/Descrição' },
    { key: 'data', header: 'Data', critical: true },
    { key: 'status', header: 'Status da Atividade', critical: true },
    { key: 'solicitante', header: 'Nome do Solicitante' },
    { key: 'cidade', header: 'Cidade' },
    { key: 'slaInicio', header: 'Início do SLA' },
    { key: 'slaFim', header: 'Fim do SLA' },
    { key: 'tipoCorte', header: 'Tipo do Corte Realizado' },
    { key: 'situacaoPergunta', header: 'Qual a situação do imóvel?' },
    { key: 'irregularidade', header: 'Irregularidade Encontrada?' },
    { key: 'valor', header: 'Valor Total dos Débitos' },
    { key: 'negociou', header: 'Negociou O Débito?', critical: true },
    { key: 'categoria', header: 'Categoria' },
    { key: 'situacaoImovel', header: 'Situação Do Imóvel' },
    { key: 'servAdic', header: 'Serviço adicionais resposta', aliases: ['Serviços adicionais resposta'], critical: true },
  ];
  const FIELD_INDEX = {};
  FIELDS.forEach((f, i) => (FIELD_INDEX[f.key] = i));

  const HEADER_MATCHER = new Map();
  FIELDS.forEach((f, i) => {
    for (const a of [f.header].concat(f.aliases || [])) HEADER_MATCHER.set(normHeader(a), i);
  });

  const MIN_HEADER_MATCHES = 4; // colunas esperadas que precisam aparecer para reconhecer a linha de cabeçalho
  const MAX_HEADER_SCAN_ROWS = 30;

  /* ------------------------------------------------------------------ */
  /* Datas e valores                                                     */
  /* ------------------------------------------------------------------ */

  const pad2 = (n) => (n < 10 ? '0' + n : '' + n);

  function validYMD(y, m, d) {
    if (m < 1 || m > 12 || d < 1 || y < 1900 || y > 2200) return false;
    const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
    const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
    return d <= dim;
  }

  /** Data serial do Excel -> {y,m,d,H,M,S,time}. */
  function serialToParts(serial, date1904) {
    if (!isFinite(serial) || serial < 1 || serial > 2958465) return null;
    let days = Math.floor(serial);
    let secs = Math.round((serial - days) * 86400);
    if (secs >= 86400) {
      secs -= 86400;
      days += 1;
    }
    const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
    const d = new Date(base + days * 86400000);
    const p = {
      y: d.getUTCFullYear(),
      m: d.getUTCMonth() + 1,
      d: d.getUTCDate(),
      H: Math.floor(secs / 3600),
      M: Math.floor((secs % 3600) / 60),
      S: secs % 60,
    };
    p.time = secs > 0;
    return p;
  }

  const RE_DATE_BR = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?)?\s*$/;
  const RE_DATE_ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]+(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?)?(?:Z|[+-]\d{2}:?\d{2})?\s*$/;

  /** Texto de data (dd/mm/aaaa, aaaa-mm-dd, com ou sem hora) -> partes, ou null. */
  function parseDateText(s) {
    s = String(s).trim();
    if (!s) return null;
    let m = RE_DATE_ISO.exec(s);
    let y, mo, d, H, M, S, time;
    if (m) {
      y = +m[1]; mo = +m[2]; d = +m[3];
      H = m[4] ? +m[4] : 0; M = m[5] ? +m[5] : 0; S = m[6] ? +m[6] : 0;
      time = m[4] !== undefined;
    } else if ((m = RE_DATE_BR.exec(s))) {
      d = +m[1]; mo = +m[2]; y = +m[3];
      if (m[3].length === 2) y += 2000;
      H = m[4] ? +m[4] : 0; M = m[5] ? +m[5] : 0; S = m[6] ? +m[6] : 0;
      time = m[4] !== undefined;
    } else {
      return null;
    }
    if (!validYMD(y, mo, d) || H > 23 || M > 59 || S > 59) return null;
    return { y, m: mo, d, H, M, S, time };
  }

  /**
   * Interpreta um valor de célula de data. `kind`: 0 texto, 1 número cru,
   * 2 número de célula com formato de data já convertido pelo leitor (texto ISO).
   */
  function parseDateValue(val, kind, date1904) {
    if (val == null || val === '') return null;
    if (kind === 1) {
      const n = Number(val);
      return n >= 20000 && n < 80000 ? serialToParts(n, date1904) : null;
    }
    const p = parseDateText(val);
    if (p) return p;
    if (kind === 0 && /^\d{5}(\.\d+)?$/.test(String(val).trim())) {
      const n = Number(val);
      return n >= 20000 && n < 80000 ? serialToParts(n, date1904) : null;
    }
    return null;
  }

  const isoDate = (p) => p.y + '-' + pad2(p.m) + '-' + pad2(p.d);
  function fmtBR(p) {
    let s = pad2(p.d) + '/' + pad2(p.m) + '/' + p.y;
    if (p.time) s += ' ' + pad2(p.H) + ':' + pad2(p.M) + ':' + pad2(p.S);
    return s;
  }
  function isoToBR(iso) {
    if (!iso) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return m ? m[3] + '/' + m[2] + '/' + m[1] : iso;
  }

  /** Valor monetário no padrão brasileiro (R$ 1.234,56). Retorna número, null (vazio) ou NaN. */
  function parseValor(val, kind) {
    if (val == null) return null;
    if (kind === 1) {
      const n = Number(val);
      return isFinite(n) ? n : NaN;
    }
    let s = String(val).trim();
    if (!s) return null;
    let neg = false;
    if (/^\(.*\)$/.test(s)) {
      neg = true;
      s = s.slice(1, -1);
    }
    s = s.replace(/R\s*\$/gi, '').replace(/\s+/g, '');
    if (s === '') return null; // "R$ " sozinho = sem valor informado
    if (/^[-\u2212]/.test(s)) {
      neg = !neg;
      s = s.slice(1);
    }
    if (!/^[.,]?\d[\d.,]*$/.test(s)) return NaN; // aceita ",03"
    const dots = (s.match(/\./g) || []).length;
    const commas = (s.match(/,/g) || []).length;
    if (dots && commas) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (commas) {
      s = commas === 1 ? s.replace(',', '.') : s.replace(/,/g, '');
    } else if (dots) {
      if (dots > 1) s = s.replace(/\./g, '');
      else if (/^[1-9]\d{0,2}\.\d{3}$/.test(s)) s = s.replace('.', '');
    }
    const n = Number(s);
    if (!isFinite(n)) return NaN;
    return neg ? -n : n;
  }

  /* ------------------------------------------------------------------ */
  /* Regras dos indicadores                                              */
  /* ------------------------------------------------------------------ */

  // Código completo, com limites numéricos: 1100130 e 9310013 não contam.
  const RE_TERMO_SERVICOS = /(?:^|[^0-9])110013(?![0-9])/;
  const RE_TERMO_VCG = /(?:^|[^0-9])310013(?![0-9])/;

  /** Aplica as regras de negócio a campos já normalizados. */
  function classify(status, negociou, servAdic, hasServ) {
    const st = norm(status);
    const sa = servAdic == null ? '' : String(servAdic);
    const neg = norm(negociou) === 'sim';
    const t11 = RE_TERMO_SERVICOS.test(sa);
    const t31 = RE_TERMO_VCG.test(sa);
    return {
      exec: st === 'finalizada',
      exoc: st === 'encerrada com ocorrencia',
      neg,
      // Sem a coluna "Serviço adicionais resposta" não dá para afirmar que ela está vazia.
      semDesdobro: neg && hasServ !== false && sa.trim() === '',
      t11,
      t31,
      termo: t11 || t31,
    };
  }

  /* ------------------------------------------------------------------ */
  /* ZIP (leitura por Blob.slice + DecompressionStream)                  */
  /* ------------------------------------------------------------------ */

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  function tick() {
    if (typeof MessageChannel !== 'undefined') {
      return new Promise((resolve) => {
        const ch = new MessageChannel();
        ch.port1.onmessage = () => {
          ch.port1.close();
          resolve();
        };
        ch.port2.postMessage(0);
      });
    }
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  async function readBytes(file, start, end) {
    return new Uint8Array(await file.slice(start, end).arrayBuffer());
  }

  async function openZip(file) {
    const size = file.size;
    if (!size) throw new PcError('EMPTY', 'O arquivo está vazio (0 bytes). Pode ainda estar sendo sincronizado pelo OneDrive.');
    if (size < 22) throw new PcError('NOT_XLSX', 'O arquivo é pequeno demais para ser um .xlsx válido.');

    const head = await readBytes(file, 0, Math.min(8, size));
    if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) {
      throw new PcError(
        'OLE2',
        'Formato incompatível: é um .xls antigo ou um Excel protegido por senha. Abra no Excel e salve uma cópia como .xlsx sem senha.'
      );
    }

    const tailStart = Math.max(0, size - 65557);
    const tail = await readBytes(file, tailStart, size);
    let e = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) {
        e = i;
        break;
      }
    }
    if (e < 0) {
      if (head[0] === 0x50 && head[1] === 0x4b) {
        throw new PcError('TRUNCATED', 'Arquivo incompleto ou corrompido (fim do .xlsx não encontrado). Se estiver no OneDrive, aguarde a sincronização terminar.');
      }
      throw new PcError('NOT_XLSX', 'O arquivo não é um .xlsx válido (não é um pacote ZIP/OOXML).');
    }
    const dv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
    let total = dv.getUint16(e + 10, true);
    const cdSize = dv.getUint32(e + 12, true);
    const cdOffset = dv.getUint32(e + 16, true);
    const zip64Locator = e >= 20 && dv.getUint32(e - 20, true) === 0x07064b50;
    if (zip64Locator || total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
      throw new PcError('ZIP64', 'Arquivo com ZIP64, não suportado por este leitor. Salve uma cópia .xlsx compatível pelo Excel.');
    }
    if (cdOffset + cdSize > size) {
      throw new PcError('TRUNCATED', 'Arquivo incompleto ou corrompido (diretório interno fora do arquivo).');
    }

    const cd = await readBytes(file, cdOffset, cdOffset + cdSize);
    const cdv = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
    const entries = new Map();
    const dec = new TextDecoder('utf-8');
    let p = 0;
    for (let i = 0; i < total; i++) {
      if (p + 46 > cd.length || cdv.getUint32(p, true) !== 0x02014b50) {
        throw new PcError('CORRUPT', 'Arquivo corrompido (diretório interno inválido).');
      }
      const flags = cdv.getUint16(p + 8, true);
      const method = cdv.getUint16(p + 10, true);
      const csize = cdv.getUint32(p + 20, true);
      const usize = cdv.getUint32(p + 24, true);
      const nlen = cdv.getUint16(p + 28, true);
      const xlen = cdv.getUint16(p + 30, true);
      const clen = cdv.getUint16(p + 32, true);
      const loff = cdv.getUint32(p + 42, true);
      const name = dec.decode(cd.subarray(p + 46, p + 46 + nlen)).replace(/\\/g, '/');
      p += 46 + nlen + xlen + clen;
      if (csize === 0xffffffff || usize === 0xffffffff || loff === 0xffffffff) {
        throw new PcError('ZIP64', 'Arquivo com ZIP64, não suportado por este leitor. Salve uma cópia .xlsx compatível pelo Excel.');
      }
      if (name.endsWith('/')) continue;
      entries.set(name, { name, flags, method, csize, usize, loff });
    }
    return { file, entries };
  }

  function findEntry(zip, path) {
    if (zip.entries.has(path)) return zip.entries.get(path);
    const lower = path.toLowerCase();
    for (const [k, v] of zip.entries) if (k.toLowerCase() === lower) return v;
    return null;
  }

  async function entryStream(zip, entry) {
    if (entry.flags & 1) {
      throw new PcError('ENCRYPTED', `A parte "${entry.name}" está criptografada. Remova a senha do arquivo.`);
    }
    if (entry.method !== 0 && entry.method !== 8) {
      throw new PcError('METHOD', `Compressão não suportada na parte "${entry.name}" (método ${entry.method}).`);
    }
    const lh = await readBytes(zip.file, entry.loff, entry.loff + 30);
    const lv = new DataView(lh.buffer, lh.byteOffset, lh.byteLength);
    if (lh.length < 30 || lv.getUint32(0, true) !== 0x04034b50) {
      throw new PcError('CORRUPT', `Arquivo corrompido (cabeçalho local inválido em "${entry.name}").`);
    }
    const start = entry.loff + 30 + lv.getUint16(26, true) + lv.getUint16(28, true);
    const blob = zip.file.slice(start, start + entry.csize);
    let stream = blob.stream();
    if (entry.method === 8) stream = stream.pipeThrough(new DecompressionStream('deflate-raw'));
    return stream;
  }

  /** Lê uma parte do pacote como texto UTF-8 em pedaços, chamando onText(str); onText pode devolver true para parar. */
  async function streamEntryText(zip, entry, onText, onBytes) {
    const stream = await entryStream(zip, entry);
    const reader = stream.getReader();
    const dec = new TextDecoder('utf-8');
    let last = now();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (onBytes) onBytes(value.byteLength);
        if (onText(dec.decode(value, { stream: true })) === true) {
          await reader.cancel().catch(() => {});
          return;
        }
        if (now() - last > 40) {
          await tick();
          last = now();
        }
      }
      const rest = dec.decode();
      if (rest) onText(rest);
    } catch (err) {
      if (err instanceof PcError) throw err;
      throw new PcError('CORRUPT', `Arquivo corrompido ou incompleto (falha ao descompactar "${entry.name}").`);
    }
  }

  /* ------------------------------------------------------------------ */
  /* XML incremental (estilo SAX)                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Devolve uma cópia independente do texto. Trechos (substring) de textos longos ficam presos ao
   * pedaço grande de XML de onde saíram e o mantêm na memória; copiar libera esses pedaços.
   * O espaço inicial é removido: todo consumidor aplica trim aos valores.
   */
  function own(s) {
    return s.length < 13 ? s : (' ' + s).trimStart();
  }

  function decodeEntities(s) {
    if (s.indexOf('&') < 0) return s;
    return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|lt|gt|amp|quot|apos);/g, (m, e) => {
      switch (e) {
        case 'lt': return '<';
        case 'gt': return '>';
        case 'amp': return '&';
        case 'quot': return '"';
        case 'apos': return "'";
      }
      const cp = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try {
        return String.fromCodePoint(cp);
      } catch (_) {
        return m;
      }
    });
  }

  /** Texto de nó: entidades XML e escapes _xHHHH_ do OOXML. */
  function decodeText(s) {
    if (s.indexOf('&') >= 0) s = decodeEntities(s);
    if (s.indexOf('_x') >= 0) s = s.replace(/_x([0-9A-Fa-f]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
    return s;
  }

  const IRREGULAR_ATTRS = /[\t\r\n]|\s=|=\s/;
  function getAttr(inner, name) {
    let p = inner.indexOf(' ' + name + '=');
    if (p < 0) {
      if (!IRREGULAR_ATTRS.test(inner)) return undefined;
      const m = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')').exec(inner);
      return m ? (m[1] !== undefined ? m[1] : m[2]) : undefined;
    }
    p += name.length + 2;
    const q = inner.charCodeAt(p);
    if (q !== 34 && q !== 39) return undefined;
    const e = inner.indexOf(q === 34 ? '"' : "'", p + 1);
    return e < 0 ? undefined : inner.substring(p + 1, e);
  }

  /**
   * Tokenizador incremental: recebe pedaços de texto via write(), emite
   * open(name, inner, selfClosing) / close(name) / text(str, raw).
   * Nomes vêm sem prefixo de namespace. Nunca monta árvore DOM.
   */
  class XmlStream {
    constructor(handlers) {
      this.h = handlers;
      this.tail = '';
    }

    write(chunk) {
      const h = this.h;
      const s = this.tail ? this.tail + chunk : chunk;
      let i = 0;
      for (;;) {
        const lt = s.indexOf('<', i);
        if (lt < 0) break;
        const c1 = s.charCodeAt(lt + 1);
        if (c1 !== c1) break; // fim do pedaço logo após '<'
        let end; // índice do último caractere da marcação
        if (c1 === 33) {
          // <!
          if (s.startsWith('<!--', lt)) {
            end = s.indexOf('-->', lt + 4);
            if (end < 0) break;
            end += 2;
            if (lt > i) h.text(s.substring(i, lt), false);
          } else if (s.startsWith('<![CDATA[', lt)) {
            end = s.indexOf(']]>', lt + 9);
            if (end < 0) break;
            if (lt > i) h.text(s.substring(i, lt), false);
            const cd = s.substring(lt + 9, end);
            if (cd) h.text(cd, true);
            end += 2;
          } else {
            end = s.indexOf('>', lt + 2);
            if (end < 0) break;
            if (lt > i) h.text(s.substring(i, lt), false);
          }
        } else if (c1 === 63) {
          // <?
          end = s.indexOf('?>', lt + 2);
          if (end < 0) break;
          end += 1;
          if (lt > i) h.text(s.substring(i, lt), false);
        } else if (c1 === 47) {
          // </
          end = s.indexOf('>', lt + 2);
          if (end < 0) break;
          if (lt > i) h.text(s.substring(i, lt), false);
          let name = s.substring(lt + 2, end).trim();
          const cp = name.indexOf(':');
          if (cp >= 0) name = name.substring(cp + 1);
          h.close(name);
        } else {
          end = s.indexOf('>', lt + 1);
          if (end < 0) break;
          if (lt > i) h.text(s.substring(i, lt), false);
          const inner = s.substring(lt + 1, end);
          const selfClosing = inner.charCodeAt(inner.length - 1) === 47;
          let ne = 0;
          const L = inner.length;
          while (ne < L) {
            const c = inner.charCodeAt(ne);
            if (c === 32 || c === 47 || c === 9 || c === 10 || c === 13) break;
            ne++;
          }
          let name = inner.substring(0, ne);
          const cp = name.indexOf(':');
          if (cp >= 0) name = name.substring(cp + 1);
          h.open(name, inner, selfClosing);
          if (selfClosing) h.close(name);
        }
        i = end + 1;
      }
      this.tail = i < s.length ? s.substring(i) : '';
    }

    end() {
      if (this.tail.trim() !== '') {
        throw new PcError('XML_TRUNCATED', 'Conteúdo XML incompleto (arquivo cortado ou corrompido).');
      }
    }
  }

  const NOOP_HANDLERS = { open() {}, close() {}, text() {} };

  async function parseSmallPart(zip, path, handlers, { required = true } = {}) {
    const entry = findEntry(zip, path);
    if (!entry) {
      if (required) throw new PcError('MISSING_PART', `Estrutura do .xlsx incompleta: parte "${path}" não encontrada.`);
      return false;
    }
    const xs = new XmlStream(Object.assign({}, NOOP_HANDLERS, handlers));
    await streamEntryText(zip, entry, (t) => xs.write(t));
    xs.end();
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Pacote OOXML: workbook, relacionamentos, strings, estilos           */
  /* ------------------------------------------------------------------ */

  const dirname = (p) => (p.lastIndexOf('/') >= 0 ? p.substring(0, p.lastIndexOf('/')) : '');
  const basename = (p) => p.substring(p.lastIndexOf('/') + 1);

  function resolveTarget(baseDir, target) {
    if (target.startsWith('/')) return target.substring(1);
    const parts = (baseDir ? baseDir.split('/') : []).concat(target.split('/'));
    const out = [];
    for (const seg of parts) {
      if (seg === '' || seg === '.') continue;
      if (seg === '..') out.pop();
      else out.push(seg);
    }
    return out.join('/');
  }

  async function readRels(zip, path) {
    const rels = [];
    const ok = await parseSmallPart(
      zip,
      path,
      {
        open(name, inner) {
          if (name === 'Relationship') {
            rels.push({
              id: decodeEntities(getAttr(inner, 'Id') || ''),
              type: decodeEntities(getAttr(inner, 'Type') || ''),
              target: decodeEntities(getAttr(inner, 'Target') || ''),
              mode: getAttr(inner, 'TargetMode') || '',
            });
          }
        },
      },
      { required: false }
    );
    return ok ? rels : null;
  }

  const BUILTIN_DATE_FMT = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

  function isDateFormatCode(code) {
    const t = code.trim().toLowerCase();
    if (t === 'general' || t === 'standard') return false;
    if (/\[(h+|m+|s+)\]/i.test(code)) return true;
    const clean = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '').replace(/[_*]./g, '');
    return /[dmyhs]/i.test(clean);
  }

  async function openWorkbook(file) {
    const zip = await openZip(file);

    let wbPath = null;
    const rootRels = await readRels(zip, '_rels/.rels');
    if (rootRels) {
      const r = rootRels.find((x) => /\/officeDocument$/.test(x.type));
      if (r) wbPath = resolveTarget('', r.target);
    }
    if (!wbPath && findEntry(zip, 'xl/workbook.xml')) wbPath = 'xl/workbook.xml';
    if (!wbPath || !findEntry(zip, wbPath)) {
      if (findEntry(zip, 'xl/workbook.bin')) {
        throw new PcError('XLSB', 'Formato .xlsb não suportado. Abra no Excel e salve uma cópia como .xlsx.');
      }
      throw new PcError('NOT_XLSX', 'O arquivo é um ZIP, mas não tem a estrutura de uma planilha Excel (.xlsx): workbook não encontrado.');
    }
    const wbDir = dirname(wbPath);
    const relsList = (await readRels(zip, (wbDir ? wbDir + '/' : '') + '_rels/' + basename(wbPath) + '.rels')) || [];
    const rels = new Map(relsList.map((r) => [r.id, r]));

    const sheetsRaw = [];
    let date1904 = false;
    await parseSmallPart(zip, wbPath, {
      open(name, inner) {
        if (name === 'workbookPr') {
          const d = getAttr(inner, 'date1904');
          date1904 = d === '1' || d === 'true';
        } else if (name === 'sheet') {
          const m = /\s[\w.-]+:id\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(inner);
          sheetsRaw.push({
            name: decodeEntities(getAttr(inner, 'name') || ''),
            rid: m ? (m[1] !== undefined ? m[1] : m[2]) : '',
            state: getAttr(inner, 'state') || 'visible',
          });
        }
      },
    });
    if (!sheetsRaw.length) throw new PcError('NO_SHEETS', 'A planilha não contém abas.');

    const sheets = sheetsRaw.map((s, i) => {
      const rel = rels.get(s.rid);
      let path = rel ? resolveTarget(wbDir, rel.target) : '';
      if (!rel || rel.mode === 'External' || !findEntry(zip, path)) {
        throw new PcError('MISSING_PART', `A aba "${s.name}" aponta para uma parte inexistente no arquivo (arquivo corrompido ou incompleto).`);
      }
      return { name: s.name, path, state: s.state, index: i };
    });

    const relByType = (suffix) => {
      const r = relsList.find((x) => x.type.endsWith('/' + suffix) && x.mode !== 'External');
      return r ? resolveTarget(wbDir, r.target) : null;
    };

    const wb = {
      zip,
      sheets,
      date1904,
      sstPath: relByType('sharedStrings'),
      stylesPath: relByType('styles'),
      _ctx: null,
    };
    wb.loadContext = async function () {
      if (wb._ctx) return wb._ctx;
      const sst = [];
      if (wb.sstPath && findEntry(zip, wb.sstPath)) {
        let inSi = false, inT = false, inRPh = false, acc = '';
        await parseSmallPart(zip, wb.sstPath, {
          open(name) {
            if (name === 'si') { inSi = true; acc = ''; }
            else if (name === 't' && inSi && !inRPh) inT = true;
            else if (name === 'rPh') inRPh = true;
          },
          close(name) {
            if (name === 't') inT = false;
            else if (name === 'rPh') inRPh = false;
            else if (name === 'si') { sst.push(own(acc)); inSi = false; }
          },
          text(t, raw) {
            if (inT) acc += raw ? t : decodeText(t);
          },
        });
      }
      const dateStyle = [];
      if (wb.stylesPath && findEntry(zip, wb.stylesPath)) {
        const custom = new Set();
        let inXfs = false;
        await parseSmallPart(zip, wb.stylesPath, {
          open(name, inner) {
            if (name === 'numFmt') {
              const id = +getAttr(inner, 'numFmtId');
              if (isDateFormatCode(decodeEntities(getAttr(inner, 'formatCode') || ''))) custom.add(id);
            } else if (name === 'cellXfs') inXfs = true;
            else if (name === 'xf' && inXfs) {
              const id = +(getAttr(inner, 'numFmtId') || 0);
              dateStyle.push(BUILTIN_DATE_FMT.has(id) || custom.has(id));
            }
          },
          close(name) {
            if (name === 'cellXfs') inXfs = false;
          },
        });
      }
      wb._ctx = { sst, dateStyle, date1904 };
      return wb._ctx;
    };
    return wb;
  }

  /* ------------------------------------------------------------------ */
  /* Varredura de uma aba (linhas -> células)                            */
  /* ------------------------------------------------------------------ */

  function colFromRef(ref) {
    let n = 0;
    for (let i = 0; i < ref.length; i++) {
      const c = ref.charCodeAt(i);
      if (c >= 65 && c <= 90) n = n * 26 + (c - 64);
      else if (c >= 97 && c <= 122) n = n * 26 + (c - 96);
      else break;
    }
    return n - 1;
  }

  /**
   * Percorre a aba emitindo onRow(n, cols, vals, kinds) por linha (arrays reutilizados).
   * kinds: 0 texto, 1 número cru (texto original de <v>), 2 número com formato de data (já ISO).
   */
  async function scanSheet(wb, sheet, ctx, onRow, onProgress, wantCol) {
    const entry = findEntry(wb.zip, sheet.path);
    const { sst, dateStyle, date1904 } = ctx;
    const cols = [], vals = [], kinds = [];
    let n = 0, nextCol = 0;
    let cCol = 0, cType = 'n', cStyle = 0;
    let inV = false, inT = false, inIs = false, inRPh = false;
    let vAcc = '', tAcc = '';
    let badSst = 0;
    let stopped = false;

    function finishCell() {
      if (wantCol !== undefined && !wantCol(cCol)) return; // coluna que o painel não usa: nem é lida
      let v, k = 0;
      switch (cType) {
        case 's': {
          if (vAcc === '') return;
          v = sst[+vAcc];
          if (v === undefined) { badSst++; return; }
          break;
        }
        case 'inlineStr': v = own(tAcc); break;
        case 'str': v = own(decodeText(vAcc)); break;
        case 'b': v = vAcc === '1' ? 'VERDADEIRO' : 'FALSO'; break;
        case 'e': return;
        case 'd': v = vAcc; break;
        default: {
          if (vAcc === '') return;
          if (dateStyle[cStyle] === true) {
            const p = serialToParts(+vAcc, date1904);
            if (p) {
              v = isoDate(p) + (p.time ? ' ' + pad2(p.H) + ':' + pad2(p.M) + ':' + pad2(p.S) : '');
              k = 2;
            } else { v = vAcc; k = 1; }
          } else { v = vAcc; k = 1; }
        }
      }
      cols[n] = cCol; vals[n] = v; kinds[n] = k; n++;
    }

    const xs = new XmlStream({
      open(name, inner) {
        switch (name) {
          case 'c': {
            const r = getAttr(inner, 'r');
            cCol = r !== undefined ? colFromRef(r) : nextCol;
            nextCol = cCol + 1;
            cType = getAttr(inner, 't') || 'n';
            const s = getAttr(inner, 's');
            cStyle = s === undefined ? 0 : +s;
            vAcc = ''; tAcc = '';
            break;
          }
          case 'v': inV = true; vAcc = ''; break;
          case 'is': inIs = true; tAcc = ''; break;
          case 't': if (inIs && !inRPh) inT = true; break;
          case 'rPh': inRPh = true; break;
          case 'row': n = 0; nextCol = 0; break;
        }
      },
      close(name) {
        switch (name) {
          case 'v': inV = false; break;
          case 't': inT = false; break;
          case 'rPh': inRPh = false; break;
          case 'is': inIs = false; break;
          case 'c': finishCell(); break;
          case 'row':
            if (n > 0 && !stopped && onRow(n, cols, vals, kinds) === true) stopped = true;
            n = 0;
            break;
        }
      },
      text(t, raw) {
        if (inV) vAcc += t;
        else if (inT) tAcc += raw ? t : decodeText(t);
      },
    });

    let bytes = 0;
    const total = entry.usize || 1;
    await streamEntryText(
      wb.zip,
      entry,
      (t) => {
        xs.write(t);
        return stopped; // onRow pode encerrar a leitura antecipadamente (ex.: só o cabeçalho)
      },
      (b) => {
        bytes += b;
        if (onProgress) onProgress(Math.min(1, bytes / total));
      }
    );
    if (!stopped) xs.end();
    return { badSst };
  }

  /* ------------------------------------------------------------------ */
  /* Leitura das abas: registros de atividades e frentes                 */
  /* ------------------------------------------------------------------ */

  const trimStr = (v) => (v == null ? '' : String(v).trim());

  /** Tabela cabeçalho normalizado -> campo, com os nomes alternativos cadastrados pelo usuário. */
  function makeMatcher(aliases) {
    const m = new Map(HEADER_MATCHER);
    if (aliases) {
      for (const [key, list] of Object.entries(aliases)) {
        const fi = FIELD_INDEX[key];
        if (fi === undefined) continue;
        for (const a of list || []) {
          const k = normHeader(a);
          if (k) m.set(k, fi);
        }
      }
    }
    return m;
  }

  /** Lê a aba de atividades (Base ou recortes) e devolve registros com indicadores calculados. */
  async function readRecordsSheet(wb, sheet, ctx, opts) {
    opts = opts || {};
    const matcher = opts.matcher || HEADER_MATCHER;
    const fieldOfCol = new Int16Array(16384).fill(-1);
    let header = null;
    let headers = [];
    let scanned = 0;
    let dataRows = 0;
    let ignoredRows = 0;
    let bestMatch = 0;
    let firstNames = null;
    let hasServ = true;
    const records = [];
    const stats = { semData: 0, dataInvalida: 0, valorInvalido: 0 };
    const codigos = opts.codigos === undefined ? new Set(CODIGOS_SERVICO) : opts.codigos; // null = sem filtro
    let foraServico = 0;
    let filtroAtivo = false;
    const fv = new Array(FIELDS.length);
    const fk = new Array(FIELDS.length);
    const D1904 = ctx.date1904;

    function tryHeader(n, cols, vals) {
      const found = new Map();
      const dups = new Map();
      const names = [];
      for (let j = 0; j < n; j++) {
        const name = trimStr(vals[j]);
        names[cols[j]] = name;
        const fi = matcher.get(normHeader(name));
        if (fi === undefined) continue;
        if (found.has(fi)) dups.set(fi, (dups.get(fi) || 1) + 1);
        else found.set(fi, cols[j]);
      }
      if (!firstNames) firstNames = names.filter(Boolean);
      bestMatch = Math.max(bestMatch, found.size);
      if (found.size < MIN_HEADER_MATCHES) return false;
      header = { found, dups };
      headers = names;
      hasServ = found.has(FIELD_INDEX.servAdic);
      filtroAtivo = codigos !== null && found.has(FIELD_INDEX.codigo);
      for (const [fi, c] of found) fieldOfCol[c] = fi;
      return true;
    }

    function buildRecord() {
      const get = (i) => trimStr(fv[i]);
      const status = get(FIELD_INDEX.status);
      const negociou = get(FIELD_INDEX.negociou);
      const servAdic = get(FIELD_INDEX.servAdic);

      let dataISO = '';
      let dataTxt = '';
      const dRaw = fv[FIELD_INDEX.data];
      if (dRaw !== undefined && trimStr(dRaw) !== '') {
        const dp = parseDateValue(dRaw, fk[FIELD_INDEX.data], D1904);
        if (dp) { dataISO = isoDate(dp); dataTxt = fmtBR(dp); }
        else { dataTxt = trimStr(dRaw); stats.dataInvalida++; }
      }
      if (!dataISO) stats.semData++;

      const dtField = (i) => {
        const raw = fv[i];
        if (raw === undefined || trimStr(raw) === '') return '';
        const p = parseDateValue(raw, fk[i], D1904);
        return p ? fmtBR(p) : trimStr(raw);
      };

      let valor = null;
      const vRaw = fv[FIELD_INDEX.valor];
      if (vRaw !== undefined && trimStr(vRaw) !== '') {
        const v = parseValor(vRaw, fk[FIELD_INDEX.valor]);
        if (Number.isNaN(v)) stats.valorInvalido++;
        else valor = v;
      }

      const c = classify(status, negociou, servAdic, hasServ);
      return {
        recurso: get(FIELD_INDEX.recurso),
        protocolo: get(FIELD_INDEX.protocolo),
        id: get(FIELD_INDEX.id),
        matricula: get(FIELD_INDEX.matricula),
        codigo: get(FIELD_INDEX.codigo),
        data: dataISO,
        dataTxt,
        mes: dataISO ? dataISO.substring(0, 7) : '',
        status,
        solicitante: get(FIELD_INDEX.solicitante),
        cidade: get(FIELD_INDEX.cidade),
        slaInicio: dtField(FIELD_INDEX.slaInicio),
        slaFim: dtField(FIELD_INDEX.slaFim),
        tipoCorte: get(FIELD_INDEX.tipoCorte),
        situacaoPergunta: get(FIELD_INDEX.situacaoPergunta),
        irregularidade: get(FIELD_INDEX.irregularidade),
        valor,
        negociou,
        categoria: get(FIELD_INDEX.categoria),
        situacaoImovel: get(FIELD_INDEX.situacaoImovel),
        servAdic,
        exec: c.exec,
        exoc: c.exoc,
        neg: c.neg,
        semDesdobro: c.semDesdobro,
        t11: c.t11,
        t31: c.t31,
        termo: c.termo,
        frente: '',
        arquivo: opts.arquivo || '',
        linha: dataRows,
      };
    }

    const res = await scanSheet(
      wb,
      sheet,
      ctx,
      (n, cols, vals, kinds) => {
        if (!header) {
          if (++scanned > MAX_HEADER_SCAN_ROWS) return true;
          tryHeader(n, cols, vals);
          return;
        }
        dataRows++;
        fv.fill(undefined);
        fk.fill(0);
        let any = false;
        for (let j = 0; j < n; j++) {
          const c = cols[j];
          const v = vals[j];
          const blank = kinds[j] === 0 && (v.length === 0 || v.trim().length === 0);
          const fi = c < 16384 ? fieldOfCol[c] : -1;
          if (fi >= 0) {
            fv[fi] = v;
            fk[fi] = kinds[j];
            if (!blank) any = true;
          }
        }
        if (!any) { ignoredRows++; dataRows--; return; }
        if (filtroAtivo && !codigos.has(codigoServico(fv[FIELD_INDEX.codigo]))) { foraServico++; dataRows--; return; }
        records.push(buildRecord());
      },
      opts.onProgress,
      (c) => header === null || (c < 16384 && fieldOfCol[c] >= 0)
    );

    if (!header) {
      const vistas = (firstNames || []).slice(0, 12).join(', ');
      throw new PcError(
        'NO_HEADER',
        `Cabeçalho não encontrado na aba "${sheet.name}": no máximo ${bestMatch} das ${FIELDS.length} colunas esperadas foram reconhecidas nas primeiras ${MAX_HEADER_SCAN_ROWS} linhas (mínimo ${MIN_HEADER_MATCHES}).` +
          (vistas ? ` Primeiras colunas da aba: ${vistas}.` : '') +
          ' Se as colunas têm outros nomes, cadastre o nome alternativo em "Base e regras".'
      );
    }

    const has = (k) => header.found.has(FIELD_INDEX[k]);
    if (!has('status') && !has('negociou') && !has('servAdic')) {
      throw new PcError(
        'MISSING_COLUMNS',
        `Nenhum indicador pode ser calculado na aba "${sheet.name}": faltam "Status da Atividade", "Negociou O Débito?" e "Serviço adicionais resposta".`
      );
    }

    const warnings = [];
    const indisponiveis = [];
    const tratadas = new Set();
    const aviso = (campo, texto) => { tratadas.add(campo); warnings.push(texto); };
    if (!has('status')) {
      indisponiveis.push('exec', 'exoc');
      aviso('status', 'Coluna "Status da Atividade" não encontrada: Exec e Exoc não puderam ser calculados neste arquivo (contam 0).');
    }
    if (!has('negociou')) {
      indisponiveis.push('neg', 'semDesdobro');
      aviso('negociou', 'Coluna "Negociou O Débito?" não encontrada: Negociações e Sem Desdobro não puderam ser calculadas neste arquivo (contam 0).');
    } else if (!has('servAdic')) {
      indisponiveis.push('semDesdobro');
    }
    if (!has('servAdic')) {
      indisponiveis.push('termos');
      aviso('servAdic', 'Coluna "Serviço adicionais resposta" não encontrada: Termos aplicados e Sem Desdobro não puderam ser calculados neste arquivo (contam 0).');
    }
    if (!has('data')) aviso('data', 'Coluna "Data" não encontrada: os registros ficam "Sem data" e saem de qualquer filtro de período.');
    if (!has('recurso')) aviso('recurso', 'Coluna "Recurso" não encontrada: a equipe fica vazia e a frente aparece como "Não mapeada".');
    const missing = FIELDS.filter((f, i) => !header.found.has(i));
    const outras = missing.filter((f) => !tratadas.has(f.key));
    if (outras.length) {
      warnings.push(`Colunas não encontradas em "${sheet.name}" (esses campos ficam vazios): ${outras.map((f) => f.header).join(', ')}.`);
    }
    if (header.dups.size) {
      warnings.push(
        `Colunas repetidas em "${sheet.name}" (usada a primeira ocorrência): ${[...header.dups]
          .map(([fi, k]) => `${FIELDS[fi].header} (${k}x)`)
          .join(', ')}.`
      );
    }
    if (!has('id')) {
      warnings.push('Coluna "ID da Atividade" não encontrada: a deduplicação usa a chave Protocolo + Matrícula + Código/Descrição + Data + Recurso, e linhas com algum desses campos vazio não são unidas a outras.');
    }
    if (res.badSst) warnings.push(`${res.badSst} células referenciam textos inexistentes na tabela de strings do arquivo.`);
    if (stats.dataInvalida) warnings.push(`${stats.dataInvalida} registros com "Data" que não pôde ser interpretada.`);
    if (stats.valorInvalido) warnings.push(`${stats.valorInvalido} registros com "Valor Total dos Débitos" que não pôde ser interpretado.`);

    if (codigos !== null && !has('codigo')) {
      warnings.push('Coluna "Código/Descrição" não encontrada: o filtro pelos serviços 110010-110012, 210010-210012 e 310010-310012 não pôde ser aplicado; todas as linhas foram carregadas.');
    }
    const found = {};
    const reconhecidas = [];
    for (const [fi, c] of header.found) {
      found[FIELDS[fi].key] = c;
      reconhecidas.push({ campo: FIELDS[fi].key, esperado: FIELDS[fi].header, planilha: headers[c] });
    }
    return {
      records,
      headers,
      dataRows,
      ignoredRows,
      foraServico,
      filtroServico: filtroAtivo,
      stats,
      warnings,
      missing: missing.map((f) => f.header),
      columns: found,
      cobertura: {
        reconhecidas,
        ausentes: missing.map((f) => ({ campo: f.key, esperado: f.header })),
        indisponiveis,
        semData: !has('data'),
        semRecurso: !has('recurso'),
        semChaveId: !has('id'),
      },
    };
  }

  /** Só procura o cabeçalho (para decidir qual aba é a base); interrompe a leitura ao achá-lo. */
  async function probeHeader(wb, sheet, ctx, matcher) {
    let scanned = 0;
    let best = 0;
    let ok = false;
    await scanSheet(wb, sheet, ctx, (n, cols, vals) => {
      if (++scanned > MAX_HEADER_SCAN_ROWS) return true;
      const found = new Set();
      for (let j = 0; j < n; j++) {
        const fi = matcher.get(normHeader(trimStr(vals[j])));
        if (fi !== undefined) found.add(fi);
      }
      best = Math.max(best, found.size);
      if (found.size >= MIN_HEADER_MATCHES) { ok = true; return true; }
      return false;
    });
    return { ok, best };
  }

  /** Lê a aba de mapeamento Frente/Nomenclatura. */
  async function readFrenteSheet(wb, sheet, ctx) {
    let map = null;
    let scanned = 0;
    const out = [];
    let empty = 0;
    await scanSheet(wb, sheet, ctx, (n, cols, vals) => {
      if (!map) {
        if (++scanned > MAX_HEADER_SCAN_ROWS) return true;
        let cf = -1, cn = -1;
        for (let j = 0; j < n; j++) {
          const h = normHeader(vals[j]);
          if (h === 'frente' && cf < 0) cf = cols[j];
          else if (h === 'nomenclatura' && cn < 0) cn = cols[j];
        }
        if (cf >= 0 && cn >= 0) map = { cf, cn };
        return;
      }
      let f = '', nm = '';
      for (let j = 0; j < n; j++) {
        if (cols[j] === map.cf) f = trimStr(vals[j]);
        else if (cols[j] === map.cn) nm = trimStr(vals[j]);
      }
      if (!f && !nm) return;
      if (!f || !nm) { empty++; return; }
      out.push({ nomenclatura: nm, frente: f });
    });
    if (!map) throw new PcError('NO_HEADER', `A aba "${sheet.name}" não tem as colunas Frente e Nomenclatura.`);
    return { frentes: out, incompletas: empty };
  }

  /* ------------------------------------------------------------------ */
  /* Chave de deduplicação e conciliação dos recortes                    */
  /* ------------------------------------------------------------------ */

  /**
   * ID da Atividade; sem ID, Protocolo + Matrícula + Código/Descrição + Data + Recurso.
   * Retorna null quando a chave alternativa está incompleta (nada é unido a partir de chave fraca).
   */
  function recordKey(r) {
    if (r.id) return 'id:' + norm(r.id);
    const parts = [r.protocolo, r.matricula, r.codigo, r.data || r.dataTxt, r.recurso].map(norm);
    if (parts.some((p) => !p)) return null;
    return 'alt:' + parts.join('|');
  }

  const RECORTE_DEFS = [
    { key: 'termos', test: (n) => n.includes('termo'), label: 'Termos', rule: (r) => r.termo, indicador: 'termos' },
    { key: 'negociacoes', test: (n) => n.includes('negocia'), label: 'Negociações', rule: (r) => r.neg, indicador: 'neg' },
  ];

  const isFrenteName = (n) => n === 'frente de servico' || n.startsWith('frente');
  const recorteDe = (n) => RECORTE_DEFS.find((d) => d.test(n));

  /** Escolhe a aba principal: "Base"; se não existir, a única aba com as colunas esperadas. */
  async function pickSheets(wb, ctx, matcher, warnings) {
    const info = wb.sheets.map((s) => ({ s, n: norm(s.name) }));
    let base = info.find((x) => x.n === 'base');
    const frente = info.find((x) => x.n === 'frente de servico') || info.find((x) => x !== base && isFrenteName(x.n));
    if (!base) {
      const cands = [];
      const melhores = [];
      for (const x of info) {
        if (x === frente) continue;
        const probe = await probeHeader(wb, x.s, ctx, matcher);
        melhores.push(`${x.s.name}: ${probe.best}`);
        if (probe.ok) cands.push(x);
      }
      const principais = cands.filter((x) => !recorteDe(x.n));
      const lista = (arr) => arr.map((x) => `"${x.s.name}"`).join(', ');
      if (principais.length === 1) base = principais[0];
      else if (principais.length > 1) {
        throw new PcError('AMBIGUOUS_SHEET', `Várias abas parecem conter atividades (${lista(principais)}). Renomeie a aba principal para "Base".`);
      } else if (cands.length === 1) base = cands[0];
      else if (cands.length > 1) {
        throw new PcError('AMBIGUOUS_SHEET', `Não há aba "Base" e mais de uma aba tem as colunas esperadas (${lista(cands)}). Renomeie a aba principal para "Base".`);
      } else {
        throw new PcError(
          'NO_BASE_SHEET',
          `Aba "Base" não encontrada e nenhuma aba tem as colunas esperadas (reconhecidas por aba: ${melhores.join('; ') || 'nenhuma'}; mínimo ${MIN_HEADER_MATCHES}). Abas do arquivo: ${wb.sheets.map((s) => s.name).join(', ')}.`
        );
      }
      warnings.push(`Aba "Base" não encontrada: foi usada a aba "${base.s.name}", a única com as colunas esperadas.`);
    }
    return { base, frente };
  }

  /**
   * Lê um arquivo .xlsx completo: aba principal (obrigatória), Frente de Serviço (opcional)
   * e as abas de recorte (Termos/Negociações) somente para conferência.
   * opts: { path, onProgress, aliases }
   */
  async function readSpreadsheetFile(file, opts) {
    opts = opts || {};
    const progress = opts.onProgress || (() => {});
    const matcher = makeMatcher(opts.aliases);
    const wb = await openWorkbook(file);
    const sheetNames = wb.sheets.map((s) => s.name);
    const ctx = await wb.loadContext();
    const warnings = [];
    const { base, frente } = await pickSheets(wb, ctx, matcher, warnings);
    const baseRes = await readRecordsSheet(wb, base.s, ctx, {
      arquivo: opts.path || file.name,
      matcher,
      codigos: opts.codigos,
      onProgress: (f) => progress({ phase: `Lendo aba ${base.s.name}`, fraction: f }),
    });
    warnings.push(...baseRes.warnings);

    let frentes = null;
    if (frente) {
      try {
        progress({ phase: 'Lendo aba Frente de Serviço', fraction: 0 });
        const fr = await readFrenteSheet(wb, frente.s, ctx);
        frentes = fr.frentes;
        if (fr.incompletas) warnings.push(`${fr.incompletas} linhas da aba "${frente.s.name}" com Frente ou Nomenclatura vazia foram ignoradas.`);
      } catch (e) {
        if (!(e instanceof PcError)) throw e;
        warnings.push(`${e.message} O mapeamento de frentes anterior foi mantido.`);
      }
    }

    const baseKeys = new Set();
    let baseSemChave = 0;
    for (const r of baseRes.records) {
      const k = recordKey(r);
      if (k) baseKeys.add(k);
      else baseSemChave++;
    }
    const indisp = new Set(baseRes.cobertura.indisponiveis);
    const conferencia = [];
    for (const def of RECORTE_DEFS) {
      const sh = abaRecorte(wb, base, frente, def);
      if (!sh) continue;
      if (indisp.has(def.indicador)) {
        conferencia.push({ tipo: def.key, rotulo: def.label, aba: sh.name, erro: `Sem conferência: a Base deste arquivo não tem as colunas necessárias para calcular ${def.label}.` });
        continue;
      }
      try {
        progress({ phase: `Conferindo aba ${sh.name}`, fraction: 0 });
        const rr = await readRecordsSheet(wb, sh, ctx, { arquivo: '', matcher, codigos: opts.codigos });
        let naBase = 0;
        let regraOk = 0;
        let semChave = 0;
        for (const r of rr.records) {
          const k = recordKey(r);
          if (!k) semChave++;
          else if (baseKeys.has(k)) naBase++;
          if (def.rule(r)) regraOk++;
        }
        const calculado = baseRes.records.filter(def.rule).length;
        conferencia.push({
          tipo: def.key,
          rotulo: def.label,
          aba: sh.name,
          linhas: rr.records.length,
          naBase,
          semChave,
          seguemRegra: regraOk,
          calculadoNaBase: calculado,
          conciliado: rr.records.length === calculado && naBase === rr.records.length && regraOk === rr.records.length,
        });
      } catch (e) {
        if (!(e instanceof PcError)) throw e;
        conferencia.push({ tipo: def.key, rotulo: def.label, aba: sh.name, erro: e.message });
      }
    }

    return {
      sheetNames,
      abaBase: base.s.name,
      records: baseRes.records,
      frentes,
      warnings,
      conferencia,
      cobertura: baseRes.cobertura,
      semChave: baseSemChave,
      audit: { linhas: baseRes.dataRows, linhasIgnoradas: baseRes.ignoredRows },
      foraServico: baseRes.foraServico,
      filtroServico: baseRes.filtroServico,
      stats: baseRes.stats,
      colunasNaoEncontradas: baseRes.missing,
    };
  }

  /** Aba de recorte (Termos/Negociações) que não seja a base nem a de frentes. */
  function abaRecorte(wb, base, frente, def) {
    const x = wb.sheets.find((s) => s !== base.s && (!frente || s !== frente.s) && def.test(norm(s.name)));
    return x || null;
  }

  /* ------------------------------------------------------------------ */
  /* Frentes, dimensões e consolidação                                   */
  /* ------------------------------------------------------------------ */

  function buildFrenteIndex(map) {
    const list = [];
    for (const v of map.values()) list.push({ prefix: v.nomenclatura.trim().toUpperCase(), frente: v.frente, nomenclatura: v.nomenclatura });
    list.sort((a, b) => b.prefix.length - a.prefix.length || (a.prefix < b.prefix ? -1 : 1));
    return list.filter((e) => e.prefix);
  }

  function frenteFor(recurso, index) {
    const r = String(recurso || '').trim().toUpperCase();
    if (r) for (const e of index) if (r.startsWith(e.prefix)) return e.frente;
    return NAO_MAPEADA;
  }

  function applyFrentes(records, map) {
    const index = buildFrenteIndex(map);
    const cache = new Map();
    for (const r of records) {
      let f = cache.get(r.recurso);
      if (f === undefined) { f = frenteFor(r.recurso, index); cache.set(r.recurso, f); }
      r.frente = f;
    }
  }

  /**
   * Junta mapeamentos: entradas existentes são preservadas; para a mesma nomenclatura o mais recente substitui.
   * `fontes`: [{ nome, frentes }] em ordem cronológica (do mais antigo ao mais recente).
   */
  function mergeFrentes(map, fontes) {
    const out = new Map(map);
    for (const fonte of fontes) {
      if (!fonte || !fonte.frentes) continue;
      for (const f of fonte.frentes) {
        out.set(f.nomenclatura.trim().toUpperCase(), { nomenclatura: f.nomenclatura.trim(), frente: f.frente, origem: fonte.nome || '' });
      }
    }
    return out;
  }

  /** Uniformiza variações de caixa/acentos/espaços de um campo, usando a grafia mais frequente. */
  function canonicalize(records, field) {
    const groups = new Map();
    for (const r of records) {
      const v = r[field];
      if (!v) continue;
      const k = norm(v);
      let g = groups.get(k);
      if (!g) groups.set(k, (g = new Map()));
      g.set(v, (g.get(v) || 0) + 1);
    }
    const canon = new Map();
    for (const [k, g] of groups) {
      let best = null, bc = -1;
      for (const [v, c] of g) if (c > bc || (c === bc && v < best)) { best = v; bc = c; }
      canon.set(k, best);
    }
    for (const r of records) if (r[field]) r[field] = canon.get(norm(r[field]));
  }

  /**
   * Consolida resultados de arquivos válidos: ordena por data de modificação,
   * remove duplicatas (o arquivo modificado mais recentemente prevalece).
   */
  function consolidate(files) {
    const ordered = files.slice().sort((a, b) => a.lastModified - b.lastModified || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const byKey = new Map();
    let lidos = 0;
    let semChave = 0;
    for (const f of ordered) {
      for (const r of f.records) {
        lidos++;
        let k = recordKey(r);
        if (k === null) {
          // chave alternativa incompleta: a linha nunca é unida a outra
          semChave++;
          k = 'linha:' + f.path + '#' + r.linha;
        }
        byKey.set(k, r); // Map mantém a posição da primeira inserção; o valor é o mais recente
      }
    }
    const records = [...byKey.values()];
    const duplicatas = lidos - records.length;
    for (const r of records) r.busca = norm([r.matricula, r.protocolo, r.solicitante, r.id].join(' '));
    canonicalize(records, 'cidade');
    canonicalize(records, 'recurso');
    return { records, lidos, duplicatas, semChave, ordemArquivos: ordered.map((f) => f.path) };
  }

  /* ------------------------------------------------------------------ */
  /* Filtros e agregações                                                */
  /* ------------------------------------------------------------------ */

  const INDICADORES = [
    { key: 'atividades', rotulo: 'Atividades', curto: 'Atividades', test: () => true },
    { key: 'exec', rotulo: 'Finalizadas (Exec)', curto: 'Exec', test: (r) => r.exec },
    { key: 'exoc', rotulo: 'Encerradas com Ocorrência (Exoc)', curto: 'Exoc', test: (r) => r.exoc },
    { key: 'neg', rotulo: 'Negociações', curto: 'Negociações', test: (r) => r.neg },
    { key: 'termos', rotulo: 'Irregularidade identificada (Termos aplicados)', curto: 'Termos', test: (r) => r.termo },
    { key: 'semDesdobro', rotulo: 'Negociações Sem Desdobro', curto: 'Sem Desdobro', test: (r) => r.semDesdobro },
  ];
  const INDICADOR_BY_KEY = Object.fromEntries(INDICADORES.map((i) => [i.key, i]));

  function filterRecords(records, f) {
    f = f || {};
    const from = f.from || '';
    const to = f.to || '';
    const cidade = f.cidade || '';
    const frente = f.frente || '';
    const equipe = f.equipe || '';
    const ind = f.indicador && f.indicador !== 'atividades' ? INDICADOR_BY_KEY[f.indicador].test : null;
    const q = f.busca ? norm(f.busca) : '';
    const dated = !!(from || to);
    return records.filter((r) => {
      if (dated) {
        if (!r.data) return false;
        if (from && r.data < from) return false;
        if (to && r.data > to) return false;
      }
      if (cidade && r.cidade !== cidade) return false;
      if (frente && r.frente !== frente) return false;
      if (equipe && r.recurso !== equipe) return false;
      if (ind && !ind(r)) return false;
      if (q && !r.busca.includes(q)) return false;
      return true;
    });
  }

  function summarize(records) {
    const s = { atividades: 0, exec: 0, exoc: 0, outros: 0, neg: 0, semDesdobro: 0, termos: 0, t11: 0, t31: 0, negETermo: 0, debito: 0, debitoNaoInformado: 0 };
    for (const r of records) {
      s.atividades++;
      if (r.exec) s.exec++;
      else if (r.exoc) s.exoc++;
      else s.outros++;
      if (r.neg) {
        s.neg++;
        if (r.valor == null) s.debitoNaoInformado++;
        else s.debito += r.valor;
        if (r.semDesdobro) s.semDesdobro++;
      }
      if (r.termo) {
        s.termos++;
        if (r.t11) s.t11++;
        if (r.t31) s.t31++;
        if (r.neg) s.negETermo++;
      }
    }
    return s;
  }

  function addMonth(ym, k) {
    let y = +ym.substring(0, 4);
    let m = +ym.substring(5, 7) - 1 + k;
    y += Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    return y + '-' + pad2(m + 1);
  }

  const MAX_MESES_CONTINUOS = 60;
  /** Série mensal contínua (meses sem registros aparecem zerados) + linha "Sem data". */
  function monthlySeries(records) {
    const by = new Map();
    let semData = null;
    for (const r of records) {
      let b;
      if (!r.mes) {
        b = semData || (semData = { mes: '', rotulo: SEM_DATA, records: [] });
      } else {
        b = by.get(r.mes);
        if (!b) by.set(r.mes, (b = { mes: r.mes, rotulo: monthLabel(r.mes), records: [] }));
      }
      b.records.push(r);
    }
    const keys = [...by.keys()].sort();
    const out = [];
    if (keys.length) {
      const span = (+keys[keys.length - 1].substring(0, 4) - +keys[0].substring(0, 4)) * 12 + (+keys[keys.length - 1].substring(5, 7) - +keys[0].substring(5, 7)) + 1;
      if (span <= MAX_MESES_CONTINUOS) {
        for (let m = keys[0]; m <= keys[keys.length - 1]; m = addMonth(m, 1)) {
          out.push(by.get(m) || { mes: m, rotulo: monthLabel(m), records: [] });
        }
      } else {
        // período absurdamente longo (ex.: data digitada com ano errado): mostra só os meses com registros
        for (const k of keys) out.push(by.get(k));
      }
    }
    if (semData) out.push(semData);
    for (const b of out) b.sum = summarize(b.records);
    return out;
  }

  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const monthLabel = (ym) => MESES[+ym.substring(5, 7) - 1] + '/' + ym.substring(0, 4);
  function monthRange(ym) {
    const y = +ym.substring(0, 4);
    const m = +ym.substring(5, 7);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { from: ym + '-01', to: ym + '-' + pad2(last) };
  }

  /** Ranking por dimensão ('frente' | 'cidade' | 'recurso') para um indicador. */
  function ranking(records, dim, indicador) {
    const test = INDICADOR_BY_KEY[indicador].test;
    const m = new Map();
    let total = 0;
    for (const r of records) {
      if (!test(r)) continue;
      total++;
      const k = r[dim] || (dim === 'recurso' ? '(sem recurso)' : dim === 'cidade' ? '(sem cidade)' : NAO_MAPEADA);
      m.set(k, (m.get(k) || 0) + 1);
    }
    const items = [...m].map(([key, value]) => ({ key, value }));
    items.sort((a, b) => b.value - a.value || a.key.localeCompare(b.key, 'pt-BR'));
    return { items, total };
  }

  function distinct(records, field) {
    const s = new Set();
    for (const r of records) s.add(r[field] || '');
    return [...s].filter((v) => v).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  function statusBreakdown(records) {
    const m = new Map();
    for (const r of records) {
      const k = r.status || '(vazio)';
      m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m].map(([status, value]) => ({ status, value })).sort((a, b) => b.value - a.value);
  }

  /* ------------------------------------------------------------------ */
  /* CSV                                                                 */
  /* ------------------------------------------------------------------ */

  const sn = (b) => (b ? 'Sim' : 'Não');
  const CSV_COLUMNS = [
    { header: 'Recurso', get: (r) => r.recurso },
    { header: 'Cód. Protocolo Origem', get: (r) => r.protocolo },
    { header: 'ID da Atividade', get: (r) => r.id },
    { header: 'Matrícula', get: (r) => r.matricula },
    { header: 'Código/Descrição', get: (r) => r.codigo },
    { header: 'Data', get: (r) => r.dataTxt },
    { header: 'Status da Atividade', get: (r) => r.status },
    { header: 'Nome do Solicitante', get: (r) => r.solicitante },
    { header: 'Cidade', get: (r) => r.cidade },
    { header: 'Início do SLA', get: (r) => r.slaInicio },
    { header: 'Fim do SLA', get: (r) => r.slaFim },
    { header: 'Tipo do Corte Realizado', get: (r) => r.tipoCorte },
    { header: 'Qual a situação do imóvel?', get: (r) => r.situacaoPergunta },
    { header: 'Irregularidade Encontrada?', get: (r) => r.irregularidade },
    { header: 'Valor Total dos Débitos', get: (r) => r.valor, numeric: true },
    { header: 'Negociou O Débito?', get: (r) => r.negociou },
    { header: 'Categoria', get: (r) => r.categoria },
    { header: 'Situação Do Imóvel', get: (r) => r.situacaoImovel },
    { header: 'Serviço adicionais resposta', get: (r) => r.servAdic },
    { header: 'Frente', get: (r) => r.frente },
    { header: 'Exec', get: (r) => sn(r.exec) },
    { header: 'Exoc', get: (r) => sn(r.exoc) },
    { header: 'Negociação', get: (r) => sn(r.neg) },
    { header: 'Sem Desdobro', get: (r) => sn(r.semDesdobro) },
    { header: 'Termo 110013 (Serviços)', get: (r) => sn(r.t11) },
    { header: 'Termo 310013 (VCG)', get: (r) => sn(r.t31) },
    { header: 'Termo aplicado', get: (r) => sn(r.termo) },
    { header: 'Arquivo de origem', get: (r) => r.arquivo },
  ];

  function csvCell(v, numeric) {
    if (v == null || v === '') return '';
    if (numeric && typeof v === 'number') return v.toFixed(2).replace('.', ',');
    let s = String(v);
    // Protege contra execução de fórmulas ao abrir no Excel.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (/[;"\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCsv(records, columns) {
    columns = columns || CSV_COLUMNS;
    const lines = [columns.map((c) => csvCell(c.header)).join(';')];
    for (const r of records) lines.push(columns.map((c) => csvCell(c.get(r), c.numeric)).join(';'));
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
  }

  /* ------------------------------------------------------------------ */

  return {
    PcError, PARSER_VERSION, CODIGOS_SERVICO, codigoServico, FIELDS, INDICADORES, INDICADOR_BY_KEY, NAO_MAPEADA, SEM_DATA, CSV_COLUMNS,
    norm, normHeader, isBlank, decodeEntities, decodeText,
    parseDateText, parseDateValue, serialToParts, parseValor, fmtBR, isoToBR, isDateFormatCode,
    classify, recordKey,
    XmlStream, openZip, openWorkbook, readSpreadsheetFile, readRecordsSheet, makeMatcher,
    buildFrenteIndex, frenteFor, applyFrentes, mergeFrentes, consolidate,
    filterRecords, summarize, monthlySeries, monthLabel, monthRange, ranking, distinct, statusBreakdown,
    toCsv, csvCell,
  };
});
