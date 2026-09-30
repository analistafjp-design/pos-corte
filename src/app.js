/*!
 * Acompanhamento de Pós Corte — interface (AnalistaFJP)
 * Depende de window.PosCorte (core.js) e window.FRENTES_PADRAO (frentes-padrao.js).
 */
(function () {
  'use strict';
  const PC = window.PosCorte;
  const INDS = PC.INDICADORES;
  const IND = PC.INDICADOR_BY_KEY;
  const $ = (s, r) => (r || document).querySelector(s);

  /* ------------------------------------------------------------------ */
  /* Utilitários                                                         */
  /* ------------------------------------------------------------------ */

  const nf = new Intl.NumberFormat('pt-BR');
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtInt = (n) => nf.format(n);
  const fmtPct = (a, b) => (b ? ((a / b) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%' : '—');
  const plural = (n, um, varios) => (n === 1 ? um : varios);
  const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
  const hhmmss = (d) => pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  const fmtDataHora = (ms) => {
    const d = new Date(ms);
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  };
  const fmtBytes = (b) => (b >= 1048576 ? (b / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

  /** Cria elementos sem innerHTML: todo texto de dados entra como textContent. */
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const k of Object.keys(props)) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'style') {
          for (const sk of Object.keys(v)) {
            if (sk.startsWith('--')) el.style.setProperty(sk, v[sk]);
            else el.style[sk] = v[sk];
          }
        } else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else if (k === 'value') el.value = v;
        else if (k === 'disabled' || k === 'hidden' || k === 'checked' || k === 'selected') el[k] = !!v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of kids.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ICONS = {
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    dash: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    table: '<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>',
    book: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/>',
  };
  function icon(name, size) {
    const s = document.createElementNS(SVG_NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('width', size || 18);
    s.setAttribute('height', size || 18);
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('class', 'ico');
    s.innerHTML = ICONS[name]; // ícones estáticos, nunca dados
    return s;
  }

  /* ------------------------------------------------------------------ */
  /* Estado                                                              */
  /* ------------------------------------------------------------------ */

  const COR = {
    atividades: 'var(--atv)',
    exec: 'var(--exec)',
    exoc: 'var(--exoc)',
    neg: 'var(--neg)',
    termos: 'var(--termo)',
    semDesdobro: 'var(--sem)',
    outros: 'var(--outros)',
  };

  const state = {
    records: [],
    files: [], // resultados da última leitura (válidos e com erro)
    consolidado: null,
    cobertura: {},
    frenteMap: new Map(),
    source: null, // { kind: 'folder'|'files', mode: 'handle'|'input', name, handle?, entries? }
    cache: new Map(),
    lastSig: '',
    lastRead: null,
    lastCheck: null,
    filters: { from: '', to: '', cidade: '', frente: '', equipe: '' },
    chartInd: 'atividades',
    view: 'geral',
    an: { ind: 'atividades', busca: '', page: 1, expanded: new Set() },
    showAll: { frente: false, cidade: false, recurso: false },
    loading: false,
    status: null,
    aliases: {},
    ignoradosFormato: [],
    auditoriaAberta: false,
    limiteConfirmado: false,
  };
  let vm = null; // modelo de visualização calculado a partir dos filtros
  let anRows = []; // linhas do analítico (filtros + indicador + busca)

  for (const f of window.FRENTES_PADRAO || []) {
    state.frenteMap.set(f.nomenclatura.trim().toUpperCase(), { nomenclatura: f.nomenclatura, frente: f.frente, origem: 'padrão incorporado' });
  }
  try {
    state.aliases = JSON.parse(localStorage.getItem('poscorte.aliases') || '{}') || {};
  } catch (_) {
    state.aliases = {};
  }
  function salvarAliases() {
    try { localStorage.setItem('poscorte.aliases', JSON.stringify(state.aliases)); } catch (_) { /* sem armazenamento: vale só nesta sessão */ }
  }

  /* ------------------------------------------------------------------ */
  /* Dica flutuante (hover e foco)                                       */
  /* ------------------------------------------------------------------ */

  const tip = h('div', { id: 'tip', role: 'tooltip', hidden: true });
  document.body.append(tip);
  let tipTimer = null;
  function posTip(x, y) {
    const w = tip.offsetWidth, hh = tip.offsetHeight;
    let left = x + 14, top = y + 16;
    if (left + w > window.innerWidth - 8) left = Math.max(8, x - w - 14);
    if (top + hh > window.innerHeight - 8) top = Math.max(8, y - hh - 12);
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }
  function showTip(el, x, y) {
    const t = el.getAttribute('data-tip');
    if (!t) return;
    const [first, ...rest] = t.split('\n');
    tip.replaceChildren(h('strong', { text: first }), ...rest.map((l) => h('div', { text: l })));
    tip.hidden = false;
    posTip(x, y);
  }
  const hideTip = () => { tip.hidden = true; clearTimeout(tipTimer); };
  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (!el) return;
    showTip(el, e.clientX, e.clientY);
    if (e.pointerType === 'touch') { clearTimeout(tipTimer); tipTimer = setTimeout(hideTip, 2200); }
  });
  document.addEventListener('pointermove', (e) => { if (!tip.hidden && e.pointerType !== 'touch') posTip(e.clientX, e.clientY); });
  document.addEventListener('pointerout', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (el && !(e.relatedTarget && el.contains(e.relatedTarget))) hideTip();
  });
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (el && e.target.matches(':focus-visible')) { const r = el.getBoundingClientRect(); showTip(el, r.left + 12, r.bottom - 6); }
  });
  document.addEventListener('focusout', hideTip);
  window.addEventListener('scroll', hideTip, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); });

  /* ------------------------------------------------------------------ */
  /* Mensagens de status                                                 */
  /* ------------------------------------------------------------------ */

  function setStatus(s) {
    state.status = s;
    renderStatus();
  }
  function renderStatus() {
    const box = $('#status');
    const s = state.status;
    if (!s) { box.replaceChildren(); return; }
    const ic = s.kind === 'success' ? 'check' : s.kind === 'warning' || s.kind === 'error' ? 'alert' : 'info';
    const body = h('div', null,
      h('div', { class: 'st-title', text: s.title }),
      s.detail ? h('div', { class: 'st-detail', text: s.detail }) : null,
      s.items && s.items.length ? h('ul', null, s.items.map((t) => h('li', { text: t }))) : null,
      s.progress != null ? h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Progresso da leitura', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(s.progress * 100) }, h('span', { style: { width: Math.round(s.progress * 100) + '%' } })) : null
    );
    const acts = h('div', { class: 'status-actions' },
      (s.actions || []).map((a) => h('button', { class: 'btn small', type: 'button', text: a.label, onclick: a.run })),
      s.progress == null ? h('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'Fechar mensagem', onclick: () => setStatus(null) }, icon('x', 16)) : null
    );
    box.replaceChildren(h('div', { class: 'status ' + s.kind, role: s.kind === 'error' ? 'alert' : 'status' }, icon(ic, 20), body, acts));
  }

  /* ------------------------------------------------------------------ */
  /* Fontes: pasta (acesso contínuo ou seleção manual) e arquivos        */
  /* ------------------------------------------------------------------ */

  const temPicker = () => typeof window.showDirectoryPicker === 'function';

  const idb = {
    open() {
      return new Promise((res, rej) => {
        const r = indexedDB.open('poscorte', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    },
    async get(k) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const q = db.transaction('kv').objectStore('kv').get(k);
        q.onsuccess = () => res(q.result);
        q.onerror = () => rej(q.error);
      });
    },
    async set(k, v) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(v, k);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    },
  };

  async function listarPasta(dir, prefixo, prof) {
    const out = [];
    for await (const [name, handle] of dir.entries()) {
      const path = prefixo + name;
      if (handle.kind === 'file') {
        out.push({ name, path, getFile: () => handle.getFile() });
      } else if (handle.kind === 'directory' && prof < 10) {
        out.push(...(await listarPasta(handle, path + '/', prof + 1)));
      }
    }
    return out;
  }

  function entradasDeArquivos(fileList) {
    return [...fileList].map((f) => ({ name: f.name, path: f.webkitRelativePath || f.name, getFile: async () => f }));
  }

  function friendly(err) {
    if (err instanceof PC.PcError) return err.message;
    const n = err && err.name;
    if (n === 'NotFoundError') return 'Arquivo não encontrado (foi movido ou apagado durante a leitura).';
    if (n === 'NotReadableError' || n === 'SecurityError') {
      return 'Não foi possível ler o arquivo. Se ele está no OneDrive, confirme que está baixado neste computador ("Sempre manter neste dispositivo") e que não está bloqueado por outro programa.';
    }
    if (err instanceof RangeError) return 'Memória insuficiente ao processar o arquivo.';
    return 'Falha inesperada ao ler o arquivo (' + (n || 'erro') + ': ' + (err && err.message) + ').';
  }

  const LIMITE_ARQUIVOS = 40;
  const LIMITE_BYTES = 800 * 1048576;
  const isXlsx = (n) => /\.xlsx$/i.test(n);
  const isFormatoAntigo = (n) => /\.(xls|xlsb|xlsm)$/i.test(n);

  /**
   * Lê os arquivos, consolida e atualiza o painel.
   * Mantém a base anterior quando nenhuma base válida é carregada.
   */
  async function carregar(entries, opts) {
    opts = opts || {};
    if (state.loading) return;
    state.loading = true;
    renderActions();
    const rotulo = state.source ? state.source.name : '';
    try {
      const xlsx = [];
      const ignoradosFormato = [];
      for (const e of entries) {
        if (e.name.startsWith('~$')) continue; // temporários do Excel
        if (isXlsx(e.name)) xlsx.push(e);
        else if (isFormatoAntigo(e.name)) ignoradosFormato.push(e.path);
      }
      if (!xlsx.length) {
        setStatus({
          kind: 'warning',
          title: 'Nenhum arquivo .xlsx encontrado',
          detail: (rotulo ? 'Fonte: ' + rotulo + '. ' : '') + 'Coloque arquivos .xlsx na pasta (subpastas são lidas; arquivos ~$ temporários são ignorados).' + (state.records.length ? ' A base anterior foi mantida.' : ''),
          items: ignoradosFormato.map((p) => 'Formato não suportado (salve como .xlsx): ' + p),
        });
        return;
      }

      // Pastas muito grandes podem esgotar a memória da aba: pede confirmação antes de ler.
      if (!opts.confirmado && !state.limiteConfirmado) {
        let nNovos = 0;
        let bytes = 0;
        for (const e of xlsx) {
          try {
            const f = await e.getFile();
            if (!state.cache.has(e.path + '|' + f.size + '|' + f.lastModified)) { nNovos++; bytes += f.size; }
          } catch (_) { /* o erro aparece na leitura */ }
        }
        if (nNovos > LIMITE_ARQUIVOS || bytes > LIMITE_BYTES) {
          setStatus({
            kind: 'warning',
            title: 'Pasta grande: confirme antes de ler',
            detail: fmtInt(nNovos) + ' ' + plural(nNovos, 'arquivo', 'arquivos') + ' (' + fmtBytes(bytes) + ') para ler em "' + rotulo + '". Cada arquivo lido ocupa vários MB de memória do navegador e ler muitos de uma vez pode travar a aba. Deixe na pasta só os arquivos necessários; se todos forem, confirme.',
            actions: [{ label: 'Ler mesmo assim', run: () => { state.limiteConfirmado = true; carregar(entries, {}); } }],
          });
          return;
        }
      }

      const ok = [];
      const falhas = [];
      const chaves = [];
      const novos = [];
      let ultimoProgresso = 0;
      for (let i = 0; i < xlsx.length; i++) {
        const e = xlsx[i];
        const prefixo = 'Arquivo ' + (i + 1) + ' de ' + xlsx.length + ': ' + e.name;
        let file;
        try {
          file = await e.getFile();
        } catch (err) {
          falhas.push({ path: e.path, motivo: friendly(err) });
          chaves.push('ERR:' + e.path);
          continue;
        }
        const chave = e.path + '|' + file.size + '|' + file.lastModified;
        chaves.push(chave);
        let res = state.cache.get(chave);
        if (!res) {
          if (!opts.auto) setStatus({ kind: 'info', title: 'Lendo arquivos…', detail: prefixo, progress: 0 });
          try {
            res = await PC.readSpreadsheetFile(file, {
              path: e.path,
              aliases: state.aliases,
              onProgress: (p) => {
                if (opts.auto || (p.fraction < 1 && Date.now() - ultimoProgresso < 120)) return;
                ultimoProgresso = Date.now();
                setStatus({ kind: 'info', title: 'Lendo arquivos…', detail: prefixo + ' — ' + p.phase + ' (' + Math.round(p.fraction * 100) + '%)', progress: (i + p.fraction) / xlsx.length });
              },
            });
            res.path = e.path;
            res.name = e.name;
            res.size = file.size;
            res.lastModified = file.lastModified;
            state.cache.set(chave, res);
            novos.push(e.path);
          } catch (err) {
            falhas.push({ path: e.path, motivo: friendly(err) });
            continue;
          }
        }
        ok.push(res);
      }
      for (const k of [...state.cache.keys()]) if (!chaves.includes(k)) state.cache.delete(k);
      state.lastCheck = new Date();

      const sig = chaves.slice().sort().join('\n') + '\n' + JSON.stringify(state.aliases);
      if (opts.auto && sig === state.lastSig && ok.length) {
        renderSideFoot();
        return; // nada mudou desde a última leitura
      }

      if (!ok.length) {
        setStatus({
          kind: 'error',
          title: 'Nenhuma base válida foi carregada',
          detail: state.records.length ? 'A base anterior foi mantida na tela.' : 'Verifique os arquivos abaixo.',
          items: falhas.map((f) => f.path + ' — ' + f.motivo),
        });
        renderSideFoot();
        return;
      }

      state.lastSig = sig;
      const cons = PC.consolidate(ok);
      const ordemMod = ok.slice().sort((a, b) => a.lastModified - b.lastModified || (a.path < b.path ? -1 : 1));
      state.frenteMap = PC.mergeFrentes(state.frenteMap, ordemMod.map((r) => ({ nome: r.name, frentes: r.frentes })));
      PC.applyFrentes(cons.records, state.frenteMap);
      state.records = cons.records;
      state.consolidado = cons;
      state.files = ok.map((r) => ({ ok: true, res: r })).concat(falhas.map((f) => ({ ok: false, path: f.path, motivo: f.motivo })));
      state.ignoradosFormato = ignoradosFormato;
      state.lastRead = new Date();
      calcularCobertura(ok);
      sanitizarFiltros();
      resetarAnalitico();
      montarFiltros();
      renderTudo();

      const itens = [];
      falhas.forEach((f) => itens.push('Não importado: ' + f.path + ' — ' + f.motivo));
      ignoradosFormato.forEach((p) => itens.push('Ignorado (formato não suportado, salve como .xlsx): ' + p));
      const indisp = Object.entries(state.cobertura.indisponiveis || {});
      indisp.forEach(([k, nomes]) => itens.push(IND[k].curto + ' não pôde ser calculado em: ' + nomes.join(', ')));
      if (cons.semChave) itens.push(fmtInt(cons.semChave) + ' ' + plural(cons.semChave, 'linha', 'linhas') + ' sem chave de deduplicação completa (ID da Atividade ausente e Protocolo/Matrícula/Código/Data/Recurso incompleto): não são unidas a linhas de outros arquivos; se houver arquivos acumulados sobrepostos, as contagens podem duplicar.');
      const nAvisos = ok.reduce((a, r) => a + r.warnings.length, 0);
      const parcial = falhas.length > 0;
      const alerta = parcial || indisp.length > 0 || cons.semChave > 0;
      setStatus({
        kind: alerta ? 'warning' : 'success',
        title: parcial
          ? 'Importação parcial: ' + ok.length + ' de ' + (ok.length + falhas.length) + ' arquivos'
          : (opts.auto && novos.length ? 'Pasta atualizada: ' : 'Base carregada: ') + fmtInt(cons.records.length) + ' ' + plural(cons.records.length, 'atividade', 'atividades') + ' de ' + ok.length + ' ' + plural(ok.length, 'arquivo', 'arquivos'),
        detail:
          (parcial ? fmtInt(cons.records.length) + ' atividades foram carregadas dos arquivos válidos. ' : '') +
          (cons.duplicatas ? fmtInt(cons.duplicatas) + ' ' + plural(cons.duplicatas, 'duplicata removida', 'duplicatas removidas') + '. ' : '') +
          (nAvisos ? nAvisos + ' ' + plural(nAvisos, 'aviso de leitura', 'avisos de leitura') + ' em "Base e regras". ' : ''),
        items: itens,
      });
    } catch (err) {
      setStatus({ kind: 'error', title: 'Erro ao atualizar', detail: friendly(err) + (state.records.length ? ' A base anterior foi mantida.' : '') });
    } finally {
      state.loading = false;
      renderActions();
      renderSideFoot();
    }
  }

  function calcularCobertura(ok) {
    const indisponiveis = {};
    for (const r of ok) {
      for (const k of r.cobertura.indisponiveis) (indisponiveis[k] = indisponiveis[k] || []).push(r.name);
    }
    state.cobertura = { indisponiveis };
  }

  async function lerPastaHandle(auto) {
    const s = state.source;
    if (!s || s.mode !== 'handle') return;
    try {
      let perm = await s.handle.queryPermission({ mode: 'read' });
      if (perm !== 'granted') {
        if (auto) {
          setStatus({ kind: 'warning', title: 'Permissão de acesso à pasta expirou', detail: 'Clique em "Atualizar" para autorizar novamente. A base atual continua na tela.' });
          return;
        }
        perm = await s.handle.requestPermission({ mode: 'read' });
        if (perm !== 'granted') {
          setStatus({ kind: 'error', title: 'Acesso à pasta não autorizado', detail: 'Sem permissão de leitura não é possível atualizar. A base atual foi mantida.' });
          return;
        }
      }
      const entries = await listarPasta(s.handle, '', 0);
      await carregar(entries, { auto });
    } catch (err) {
      setStatus({ kind: 'error', title: 'Não foi possível ler a pasta', detail: friendly(err) + (state.records.length ? ' A base anterior foi mantida.' : '') });
    }
  }

  async function conectarPasta() {
    if (temPicker()) {
      let handle;
      try {
        handle = await window.showDirectoryPicker({ id: 'pos-corte-onedrive', mode: 'read' });
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        setStatus({ kind: 'error', title: 'Não foi possível abrir o seletor de pasta', detail: err && err.message });
        return;
      }
      state.source = { kind: 'folder', mode: 'handle', name: handle.name, handle };
      state.lastSig = '';
      state.limiteConfirmado = false;
      idb.set('pasta', handle).catch(() => {});
      await lerPastaHandle(false);
    } else {
      $('#inp-folder').click();
    }
  }

  function atualizar() {
    const s = state.source;
    if (!s) return conectarPasta();
    if (s.mode === 'handle') return lerPastaHandle(false);
    if (s.kind === 'folder') {
      setStatus({ kind: 'info', title: 'Selecione a pasta novamente', detail: 'Este navegador não mantém acesso contínuo à pasta. Escolha-a de novo para reler os arquivos.' });
      $('#inp-folder').click();
    } else {
      setStatus({ kind: 'info', title: 'Selecione os arquivos novamente', detail: 'A importação manual não monitora os arquivos. Selecione-os de novo para reler.' });
      $('#inp-files').click();
    }
  }

  /** Reaplica as regras (ex.: novo nome alternativo de coluna) aos arquivos já selecionados. */
  async function reprocessar() {
    state.cache.clear();
    state.lastSig = '';
    const s = state.source;
    if (!s) return;
    if (s.mode === 'handle') await lerPastaHandle(false);
    else if (s.entries) await carregar(s.entries, {});
  }

  $('#inp-folder').addEventListener('change', (e) => {
    const files = e.target.files;
    if (!files || !files.length) return;
    const primeiro = files[0].webkitRelativePath || '';
    state.source = { kind: 'folder', mode: 'input', name: primeiro.split('/')[0] || 'pasta selecionada', entries: entradasDeArquivos(files) };
    state.lastSig = '';
    state.limiteConfirmado = false;
    carregar(state.source.entries, {});
    e.target.value = '';
  });
  $('#inp-files').addEventListener('change', (e) => {
    const files = e.target.files;
    if (!files || !files.length) return;
    state.source = { kind: 'files', mode: 'input', name: files.length + ' ' + plural(files.length, 'arquivo selecionado', 'arquivos selecionados'), entries: entradasDeArquivos(files) };
    state.lastSig = '';
    state.limiteConfirmado = false;
    carregar(state.source.entries, {});
    e.target.value = '';
  });

  // Leitura periódica (60 s) apenas com a página visível e acesso contínuo autorizado.
  const INTERVALO_MS = 60000;
  function verificarPasta() {
    const s = state.source;
    if (document.visibilityState !== 'visible' || state.loading || !s || s.mode !== 'handle') return;
    lerPastaHandle(true);
  }
  setInterval(verificarPasta, INTERVALO_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.lastCheck && Date.now() - state.lastCheck.getTime() >= INTERVALO_MS) verificarPasta();
  });

  async function restaurarPasta() {
    if (!temPicker() || !window.indexedDB) return;
    let handle;
    try { handle = await idb.get('pasta'); } catch (_) { return; }
    if (!handle || state.source) return;
    state.source = { kind: 'folder', mode: 'handle', name: handle.name, handle, restaurada: true };
    let perm = 'prompt';
    try { perm = await handle.queryPermission({ mode: 'read' }); } catch (_) { /* ignora */ }
    if (perm === 'granted') {
      await lerPastaHandle(false);
    } else {
      setStatus({
        kind: 'info',
        title: 'Última pasta usada: "' + handle.name + '"',
        detail: 'Autorize a leitura para carregar os arquivos novamente.',
        actions: [{ label: 'Reconectar pasta', run: () => lerPastaHandle(false) }],
      });
    }
    renderActions();
    renderSideFoot();
  }

  /* ------------------------------------------------------------------ */
  /* Filtros e cálculo                                                   */
  /* ------------------------------------------------------------------ */

  function calcular() {
    const filtered = PC.filterRecords(state.records, state.filters);
    let min = '', max = '';
    for (const r of filtered) {
      if (!r.data) continue;
      if (!min || r.data < min) min = r.data;
      if (!max || r.data > max) max = r.data;
    }
    vm = {
      filtered,
      sum: PC.summarize(filtered),
      months: PC.monthlySeries(filtered),
      status: PC.statusBreakdown(filtered),
      min,
      max,
      rank: {
        frente: PC.ranking(filtered, 'frente', state.chartInd),
        cidade: PC.ranking(filtered, 'cidade', state.chartInd),
        recurso: PC.ranking(filtered, 'recurso', state.chartInd),
      },
    };
    anRows = PC.filterRecords(state.records, Object.assign({}, state.filters, { indicador: state.an.ind, busca: state.an.busca }));
    anRows.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0) || a.recurso.localeCompare(b.recurso, 'pt-BR') || a.protocolo.localeCompare(b.protocolo, 'pt-BR'));
  }

  function sanitizarFiltros() {
    const f = state.filters;
    if (f.cidade && !state.records.some((r) => r.cidade === f.cidade)) f.cidade = '';
    if (f.frente && !state.records.some((r) => r.frente === f.frente)) f.frente = '';
    if (f.equipe && !state.records.some((r) => r.recurso === f.equipe)) f.equipe = '';
  }
  function resetarAnalitico() {
    state.an.page = 1;
    state.an.expanded = new Set();
  }

  function setFiltro(chave, valor) {
    const atual = state.filters[chave];
    state.filters[chave] = atual === valor ? '' : valor; // clicar de novo no mesmo item limpa o filtro
    aplicarFiltros();
  }
  function aplicarFiltros() {
    resetarAnalitico();
    sincronizarFiltros();
    renderTudo();
  }
  function limparFiltros() {
    state.filters = { from: '', to: '', cidade: '', frente: '', equipe: '' };
    aplicarFiltros();
  }

  function preencherSelect(sel, valores, rotuloTodos, atual) {
    const opts = [h('option', { value: '', text: rotuloTodos })];
    for (const v of valores) opts.push(h('option', { value: v, text: v }));
    sel.replaceChildren(...opts);
    sel.value = valores.includes(atual) ? atual : '';
  }
  function montarFiltros() {
    const fr = PC.distinct(state.records, 'frente').filter((v) => v !== PC.NAO_MAPEADA);
    if (state.records.some((r) => r.frente === PC.NAO_MAPEADA)) fr.push(PC.NAO_MAPEADA);
    preencherSelect($('#f-cidade'), PC.distinct(state.records, 'cidade'), 'Todas', state.filters.cidade);
    preencherSelect($('#f-frente'), fr, 'Todas', state.filters.frente);
    preencherSelect($('#f-equipe'), PC.distinct(state.records, 'recurso'), 'Todas', state.filters.equipe);
    sincronizarFiltros();
  }
  function sincronizarFiltros() {
    const f = state.filters;
    $('#f-from').value = f.from;
    $('#f-to').value = f.to;
    $('#f-cidade').value = f.cidade;
    $('#f-frente').value = f.frente;
    $('#f-equipe').value = f.equipe;
    $('#f-ind').value = state.chartInd;
  }

  function chipsAtivos() {
    const f = state.filters;
    const out = [];
    const br = PC.isoToBR;
    if (f.from || f.to) out.push({ k: 'periodo', t: 'Período: ' + (f.from ? br(f.from) : 'início') + ' a ' + (f.to ? br(f.to) : 'hoje') });
    if (f.cidade) out.push({ k: 'cidade', t: 'Cidade: ' + f.cidade });
    if (f.frente) out.push({ k: 'frente', t: 'Frente: ' + f.frente });
    if (f.equipe) out.push({ k: 'equipe', t: 'Equipe: ' + f.equipe });
    return out;
  }
  function renderChips() {
    const box = $('#chips');
    const chips = chipsAtivos();
    if (!chips.length || !state.records.length) { box.replaceChildren(); return; }
    box.replaceChildren(
      ...chips.map((c) => h('span', { class: 'chip' }, c.t, h('button', {
        type: 'button', 'aria-label': 'Remover filtro ' + c.t,
        onclick: () => {
          if (c.k === 'periodo') { state.filters.from = ''; state.filters.to = ''; }
          else state.filters[c.k] = '';
          aplicarFiltros();
        },
      }, icon('x', 14)))),
      h('button', { class: 'btn small ghost', type: 'button', text: 'Limpar filtros', onclick: limparFiltros }),
      vm ? h('span', { class: 'count-note', text: fmtInt(vm.filtered.length) + ' de ' + fmtInt(state.records.length) + ' atividades' }) : null
    );
    if (f_periodoInvertido()) box.append(h('span', { class: 'count-note', text: '⚠ A data inicial é posterior à data final: nenhum registro atende ao período.' }));
  }
  const f_periodoInvertido = () => state.filters.from && state.filters.to && state.filters.from > state.filters.to;

  /* ------------------------------------------------------------------ */
  /* Navegação e ações                                                   */
  /* ------------------------------------------------------------------ */

  const VIEWS = [
    { k: 'geral', t: 'Visão geral', i: 'dash' },
    { k: 'analitico', t: 'Analítico', i: 'table' },
    { k: 'base', t: 'Base e regras', i: 'book' },
  ];
  function montarNav() {
    for (const [sel, cls] of [['#nav-side', ''], ['#nav-bottom', '']]) {
      $(sel).replaceChildren(...VIEWS.map((v) => h('button', {
        type: 'button', dataset: { view: v.k }, onclick: () => irPara(v.k), 'aria-current': state.view === v.k ? 'page' : null,
      }, icon(v.i, 20), h('span', { text: v.t }))));
    }
  }
  function irPara(v) {
    state.view = v;
    for (const b of document.querySelectorAll('[data-view]')) {
      if (b.dataset.view === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    }
    for (const x of VIEWS) $('#view-' + x.k).hidden = x.k !== v;
    $('#f-ind-wrap').hidden = v !== 'geral';
    renderTudo();
    window.scrollTo({ top: 0 });
  }

  function renderActions() {
    const s = state.source;
    const carregando = state.loading;
    const pasta = $('#btn-pasta');
    pasta.replaceChildren(icon('folder'), h('span', { text: s && s.kind === 'folder' ? 'Trocar pasta' : 'Conectar pasta' }));
    pasta.disabled = carregando;
    const at = $('#btn-atualizar');
    at.replaceChildren(icon('refresh'), h('span', { text: 'Atualizar' }));
    at.querySelector('svg').classList.toggle('spin', carregando);
    at.disabled = carregando;
    const im = $('#btn-importar');
    im.replaceChildren(icon('upload'), h('span', { text: 'Importar Excel' }));
    im.disabled = carregando;
  }
  $('#btn-pasta').addEventListener('click', conectarPasta);
  $('#btn-atualizar').addEventListener('click', atualizar);
  $('#btn-importar').addEventListener('click', () => $('#inp-files').click());

  function renderSideFoot() {
    const s = state.source;
    const foot = $('#side-foot');
    const okFiles = state.files.filter((f) => f.ok).length;
    const rows = [];
    if (s) {
      rows.push(h('div', null, h('strong', { text: s.kind === 'folder' ? 'Pasta' : 'Arquivos' }), ': ', s.name));
      rows.push(h('div', { text: s.mode === 'handle' ? 'Acesso contínuo (lê a cada 60 s)' : 'Seleção manual (sem monitoramento)' }));
      if (state.files.length) rows.push(h('div', { text: okFiles + ' de ' + state.files.length + ' ' + plural(state.files.length, 'arquivo válido', 'arquivos válidos') }));
      if (state.lastCheck) rows.push(h('div', { text: 'Verificado às ' + hhmmss(state.lastCheck) }));
    } else {
      rows.push(h('div', { text: 'Nenhuma fonte conectada' }));
    }
    foot.replaceChildren(...rows);
    const sub = $('#top-sub');
    if (state.records.length && state.lastRead) {
      sub.textContent = fmtInt(state.records.length) + ' atividades · atualizado às ' + hhmmss(state.lastRead);
    } else {
      sub.textContent = 'Exec, Exoc, negociações, termos aplicados e frentes de serviço';
    }
  }

  /* ------------------------------------------------------------------ */
  /* Componentes de gráfico                                              */
  /* ------------------------------------------------------------------ */

  const valorInd = (s, k) => s[k];

  function legenda(itens) {
    return h('ul', { class: 'legend' }, itens.map((i) => h('li', null, h('span', { class: 'sw', style: { '--c': i.cor } }), i.t)));
  }

  function alertaIndisponivel(k) {
    const nomes = (state.cobertura.indisponiveis || {})[k];
    if (!nomes || !nomes.length) return null;
    return h('div', { class: 'note warn', text: '⚠ ' + IND[k].curto + ' não pôde ser calculado em ' + nomes.length + ' ' + plural(nomes.length, 'arquivo', 'arquivos') + ' (coluna ausente): ' + nomes.join(', ') + '. Esses arquivos contam 0.' });
  }

  function periodoTexto() {
    if (!vm.min) return 'sem datas no filtro';
    return PC.isoToBR(vm.min) + ' a ' + PC.isoToBR(vm.max);
  }

  function renderKpis() {
    const s = vm.sum;
    const cards = [
      { k: 'atividades', t: 'Atividades', v: s.atividades, sub: [periodoTexto()] },
      { k: 'exec', t: 'Finalizadas (Exec)', v: s.exec, sub: [fmtPct(s.exec, s.atividades) + ' das atividades'] },
      { k: 'exoc', t: 'Encerradas com Ocorrência (Exoc)', v: s.exoc, sub: [fmtPct(s.exoc, s.atividades) + ' das atividades'] },
      { k: 'neg', t: 'Negociações', v: s.neg, sub: ['Débito informado: ' + brl.format(s.debito)].concat(s.debitoNaoInformado ? [s.debitoNaoInformado + ' sem valor informado'] : []) },
      { k: 'termos', t: 'Termos aplicados', v: s.termos, sub: ['Irregularidade identificada', '110013 Serviços: ' + fmtInt(s.t11) + ' · 310013 VCG: ' + fmtInt(s.t31)] },
      { k: 'semDesdobro', t: 'Negociações Sem Desdobro', v: s.semDesdobro, sub: ['Parte das negociações (' + fmtPct(s.semDesdobro, s.neg) + ')'] },
    ];
    return h('div', { class: 'kpis' }, cards.map((c) => {
      const indisp = (state.cobertura.indisponiveis || {})[c.k];
      return h('button', {
        class: 'kpi', type: 'button', style: { '--kc': COR[c.k] }, dataset: { fk: 'kpi:' + c.k },
        'aria-label': c.t + ': ' + fmtInt(c.v) + '. Abrir no analítico.',
        onclick: () => abrirAnalitico(c.k),
      },
        h('span', { class: 'kpi-label', text: c.t }),
        h('span', { class: 'kpi-value num', text: fmtInt(c.v) }),
        c.sub.map((t) => h('span', { class: 'kpi-sub', text: t })),
        indisp && indisp.length ? h('span', { class: 'kpi-sub', text: '⚠ indisponível em ' + indisp.length + ' ' + plural(indisp.length, 'arquivo', 'arquivos') }) : null,
        h('span', { class: 'kpi-go', text: 'Ver no analítico →' })
      );
    }));
  }

  function mesAtivo(mes) {
    if (!mes) return false;
    const r = PC.monthRange(mes);
    return state.filters.from === r.from && state.filters.to === r.to;
  }
  function filtrarMes(mes) {
    const r = PC.monthRange(mes);
    if (mesAtivo(mes)) { state.filters.from = ''; state.filters.to = ''; }
    else { state.filters.from = r.from; state.filters.to = r.to; }
    aplicarFiltros();
  }

  function renderMensal() {
    const ind = state.chartInd;
    const meses = vm.months;
    const max = Math.max(1, ...meses.map((m) => valorInd(m.sum, ind)));
    const empilhado = ind === 'atividades';
    const temOutros = vm.sum.outros > 0;
    const linhas = meses.map((m) => {
      const s = m.sum;
      const v = valorInd(s, ind);
      const r = v / max;
      const partes = empilhado
        ? [{ n: 'Exec', v: s.exec, c: COR.exec }, { n: 'Exoc', v: s.exoc, c: COR.exoc }, { n: 'Outros status', v: s.outros, c: COR.outros }].filter((p) => p.v > 0)
        : [];
      const tipText = m.rotulo + '\n' + fmtInt(v) + ' ' + IND[ind].curto.toLowerCase() + (empilhado ? partes.map((p) => '\n' + p.n + ': ' + fmtInt(p.v)).join('') : '') + (ind !== 'atividades' ? '\n' + fmtInt(s.atividades) + ' atividades no mês' : '');
      const barra = v === 0 ? null : empilhado
        ? h('span', { class: 'bar', style: { '--r': Math.max(r, 0.006) } }, partes.map((p) => h('i', { style: { flex: p.v + ' 1 0px', '--c': p.c } })))
        : h('span', { class: 'bar solid', style: { '--r': Math.max(r, 0.006), '--c': COR[ind] } });
      const conteudo = [h('span', { class: 'brow-label', text: m.rotulo }), h('span', { class: 'track' }, barra, h('span', { class: 'bval', text: fmtInt(v) }))];
      const aria = m.rotulo + ': ' + fmtInt(v) + ' ' + IND[ind].curto + (m.mes ? '. Filtrar este mês.' : '');
      return m.mes
        ? h('button', { class: 'brow' + (mesAtivo(m.mes) ? ' is-active' : ''), type: 'button', dataset: { fk: 'mes:' + m.mes }, 'data-tip': tipText, 'aria-label': aria, 'aria-pressed': mesAtivo(m.mes) ? 'true' : 'false', onclick: () => filtrarMes(m.mes) }, conteudo)
        : h('div', { class: 'brow', 'data-tip': tipText, tabindex: 0, 'aria-label': aria }, conteudo);
    });
    return h('section', { class: 'card', 'aria-labelledby': 'h-mensal' },
      h('div', { class: 'card-head' },
        h('div', null, h('h2', { id: 'h-mensal', text: 'Produção mensal — ' + IND[ind].rotulo }), h('p', { class: 'hint', text: 'Clique em um mês para filtrar. Valores por mês também na tabela abaixo.' }))),
      empilhado ? legenda([{ cor: COR.exec, t: 'Exec' }, { cor: COR.exoc, t: 'Exoc' }].concat(temOutros ? [{ cor: COR.outros, t: 'Outros status' }] : [])) : null,
      meses.length ? h('div', { class: 'stack' }, linhas) : h('p', { class: 'note', text: 'Nenhum registro no filtro atual.' }),
      alertaIndisponivel(ind === 'atividades' ? 'exec' : ind)
    );
  }

  function renderStatusDist() {
    const total = vm.sum.atividades;
    const max = Math.max(1, ...vm.status.map((x) => x.value));
    const norm = PC.norm;
    const cor = (st) => (norm(st) === 'finalizada' ? COR.exec : norm(st) === 'encerrada com ocorrencia' ? COR.exoc : COR.outros);
    return h('section', { class: 'card', 'aria-labelledby': 'h-status' },
      h('div', { class: 'card-head' }, h('div', null, h('h2', { id: 'h-status', text: 'Distribuição dos status' }), h('p', { class: 'hint', text: 'Todos os status encontrados na base filtrada.' }))),
      h('div', { class: 'rank-list' }, vm.status.map((x) =>
        h('div', { class: 'rrow', 'data-tip': x.status + '\n' + fmtInt(x.value) + ' (' + fmtPct(x.value, total) + ')', tabindex: 0 },
          h('span', { class: 'rl', text: x.status }),
          h('span', { class: 'rv num' }, fmtInt(x.value), h('small', { text: fmtPct(x.value, total) })),
          h('span', { class: 'track' }, h('span', { class: 'bar solid', style: { width: Math.max((x.value / max) * 100, 0.6) + '%', '--c': cor(x.status) } }))))),
      vm.sum.outros > 0 ? h('p', { class: 'note warn', text: 'Há ' + fmtInt(vm.sum.outros) + ' atividades com status diferente de Finalizada e Encerrada com Ocorrência: Exec + Exoc não é igual ao total de atividades.' }) : null
    );
  }

  function renderNegTermo() {
    const meses = vm.months;
    const max = Math.max(1, ...meses.map((m) => Math.max(m.sum.neg, m.sum.termos)));
    const linhas = meses.map((m) => {
      const s = m.sum;
      const tipText = m.rotulo + '\nNegociações: ' + fmtInt(s.neg) + '\nTermos aplicados: ' + fmtInt(s.termos) + '\nSem Desdobro: ' + fmtInt(s.semDesdobro);
      const linha = (v, cor) => h('span', { class: 'track' },
        v > 0 ? h('span', { class: 'bar solid', style: { '--r': Math.max(v / max, 0.008), '--c': cor } }) : null,
        h('span', { class: 'bval' }, h('span', { class: 'sw', style: { '--c': cor } }), fmtInt(v)));
      const conteudo = [
        h('span', { class: 'brow-label', text: m.rotulo }),
        h('span', { class: 'tracks' }, linha(s.neg, COR.neg), linha(s.termos, COR.termos)),
      ];
      const aria = m.rotulo + ': ' + fmtInt(s.neg) + ' negociações e ' + fmtInt(s.termos) + ' termos aplicados' + (m.mes ? '. Filtrar este mês.' : '');
      return m.mes
        ? h('button', { class: 'mgroup' + (mesAtivo(m.mes) ? ' is-active' : ''), type: 'button', dataset: { fk: 'mesnt:' + m.mes }, 'data-tip': tipText, 'aria-label': aria, 'aria-pressed': mesAtivo(m.mes) ? 'true' : 'false', onclick: () => filtrarMes(m.mes) }, conteudo)
        : h('div', { class: 'mgroup', 'data-tip': tipText, tabindex: 0, 'aria-label': aria }, conteudo);
    });
    return h('section', { class: 'card', 'aria-labelledby': 'h-nt' },
      h('div', { class: 'card-head' }, h('div', null, h('h2', { id: 'h-nt', text: 'Negociações e termos aplicados por mês' }), h('p', { class: 'hint', text: 'Mesma escala nas duas séries. Uma atividade pode ter negociação e termo.' }))),
      legenda([{ cor: COR.neg, t: 'Negociações' }, { cor: COR.termos, t: 'Termos aplicados' }]),
      meses.length ? h('div', { class: 'stack' }, linhas) : h('p', { class: 'note', text: 'Nenhum registro no filtro atual.' }),
      alertaIndisponivel('neg'), alertaIndisponivel('termos')
    );
  }

  function renderTabelaMensal() {
    const s = vm.sum;
    const cab = ['Mês', 'Atividades', 'Exec', 'Exoc', 'Negociações', 'Sem Desdobro', 'Termos', 'Débito informado (negociações)'];
    return h('section', { class: 'card', 'aria-labelledby': 'h-tm' },
      h('div', { class: 'card-head' }, h('div', null, h('h2', { id: 'h-tm', text: 'Valores mensais' }), h('p', { class: 'hint', text: 'Débito informado = soma de "Valor Total dos Débitos" das negociações. Não é arrecadação nem valor pago.' }))),
      h('div', { class: 'table-wrap' }, h('table', null,
        h('thead', null, h('tr', null, cab.map((c, i) => h('th', { scope: 'col', class: i ? 'n' : '', text: c })))),
        h('tbody', null, vm.months.map((m) => h('tr', null,
          h('th', { scope: 'row', text: m.rotulo }),
          [m.sum.atividades, m.sum.exec, m.sum.exoc, m.sum.neg, m.sum.semDesdobro, m.sum.termos].map((v) => h('td', { class: 'n', text: fmtInt(v) })),
          h('td', { class: 'n', text: brl.format(m.sum.debito) })))),
        h('tfoot', null, h('tr', null,
          h('td', { text: 'Total' }),
          [s.atividades, s.exec, s.exoc, s.neg, s.semDesdobro, s.termos].map((v) => h('td', { class: 'n', text: fmtInt(v) })),
          h('td', { class: 'n', text: brl.format(s.debito) })))))
    );
  }

  const LIMITE_RANK = 8;
  function renderRank(titulo, dim, filtroKey, chave) {
    const { items, total } = vm.rank[dim];
    const todos = state.showAll[dim];
    const lista = todos ? items : items.slice(0, LIMITE_RANK);
    const max = Math.max(1, ...items.map((i) => i.value));
    const ind = state.chartInd;
    const semFiltro = new Set(['(sem cidade)', '(sem recurso)']);
    const nMapeadas = dim === 'frente' ? (items.find((i) => i.key === PC.NAO_MAPEADA) || { value: 0 }).value : 0;
    return h('section', { class: 'card', 'aria-labelledby': 'h-' + dim },
      h('div', { class: 'card-head' }, h('div', null, h('h2', { id: 'h-' + dim, text: titulo }), h('p', { class: 'hint', text: IND[ind].curto + ' · ' + fmtInt(total) + ' no filtro · ' + items.length + ' ' + plural(items.length, 'item', 'itens') }))),
      items.length ? h('div', { class: 'rank-list' }, lista.map((it) => {
        const ativo = state.filters[filtroKey] === it.key;
        const cont = [
          h('span', { class: 'rl', text: it.key }),
          h('span', { class: 'rv num' }, fmtInt(it.value), h('small', { text: fmtPct(it.value, total) })),
          h('span', { class: 'track' }, h('span', { class: 'bar solid', style: { width: Math.max((it.value / max) * 100, 0.8) + '%', '--c': COR[ind] } })),
        ];
        const tipText = it.key + '\n' + fmtInt(it.value) + ' ' + IND[ind].curto.toLowerCase() + ' (' + fmtPct(it.value, total) + ')';
        return semFiltro.has(it.key)
          ? h('div', { class: 'rrow', 'data-tip': tipText, tabindex: 0 }, cont)
          : h('button', { class: 'rrow' + (ativo ? ' is-active' : ''), type: 'button', dataset: { fk: 'rank:' + dim + ':' + it.key }, 'data-tip': tipText, 'aria-pressed': ativo ? 'true' : 'false', 'aria-label': it.key + ': ' + fmtInt(it.value) + '. Filtrar.', onclick: () => setFiltro(filtroKey, it.key) }, cont);
      })) : h('p', { class: 'note', text: 'Nenhum registro no filtro atual.' }),
      items.length > LIMITE_RANK ? h('button', { class: 'btn small more', type: 'button', text: todos ? 'Mostrar menos' : 'Mostrar todos (' + items.length + ')', onclick: () => { state.showAll[dim] = !todos; renderGeral(); } }) : null,
      dim === 'frente' && nMapeadas > 0 ? h('p', { class: 'note warn', text: fmtInt(nMapeadas) + ' ' + plural(nMapeadas, 'atividade sem frente mapeada', 'atividades sem frente mapeada') + ' (Recurso sem Nomenclatura na aba Frente de Serviço). Veja quais em "Base e regras".' }) : null
    );
  }

  /* ------------------------------------------------------------------ */
  /* Visão geral                                                         */
  /* ------------------------------------------------------------------ */

  function estadoVazio() {
    const suportaPasta = temPicker();
    return h('div', { class: 'card empty' },
      icon('folder', 40),
      h('h2', { text: 'Nenhuma base carregada' }),
      h('p', { text: 'O painel calcula os indicadores a partir dos arquivos Excel (.xlsx) da pasta do OneDrive. Nenhum dado é enviado para a internet: a leitura acontece neste computador.' }),
      h('ol', null,
        h('li', { text: suportaPasta ? 'Clique em "Conectar pasta" e escolha a pasta sincronizada do OneDrive (as subpastas também são lidas).' : 'Clique em "Conectar pasta" e escolha a pasta sincronizada do OneDrive (este navegador exige selecionar a pasta a cada atualização).' }),
        h('li', { text: 'Ou clique em "Importar Excel" para escolher um ou vários arquivos .xlsx.' }),
        h('li', { text: 'Depois, use "Atualizar" (ou aguarde a leitura automática de 60 s, quando o navegador permitir).' })),
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', type: 'button', onclick: conectarPasta }, icon('folder'), 'Conectar pasta'),
        h('button', { class: 'btn', type: 'button', onclick: () => $('#inp-files').click() }, icon('upload'), 'Importar Excel'))
    );
  }

  function renderGeral() {
    const root = $('#view-geral');
    if (!state.records.length) { root.replaceChildren(estadoVazio()); return; }
    root.replaceChildren(h('div', { class: 'stack' },
      renderKpis(),
      h('div', { class: 'grid-2' }, renderMensal(), renderStatusDist()),
      renderNegTermo(),
      renderTabelaMensal(),
      h('div', { class: 'grid-rank' },
        renderRank('Frente de serviço', 'frente', 'frente'),
        renderRank('Cidade', 'cidade', 'cidade'),
        renderRank('Equipe (recurso)', 'recurso', 'equipe'))
    ));
  }

  /* ------------------------------------------------------------------ */
  /* Analítico                                                           */
  /* ------------------------------------------------------------------ */

  const POR_PAGINA = 50;

  function abrirAnalitico(k) {
    state.an.ind = k;
    state.an.page = 1;
    state.an.expanded = new Set();
    const sel = $('#an-ind');
    if (sel) sel.value = k;
    irPara('analitico');
  }

  function tag(t, cls) { return h('span', { class: 'tag ' + (cls || ''), text: t }); }

  function detalheRegistro(r) {
    const dl = h('dl', { class: 'detail-grid' });
    const add = (k, v) => dl.append(h('div', null, h('dt', { text: k }), h('dd', { text: v === '' || v == null ? '—' : String(v) })));
    add('Recurso (equipe)', r.recurso); add('Frente', r.frente); add('Cód. Protocolo Origem', r.protocolo); add('ID da Atividade', r.id);
    add('Matrícula', r.matricula); add('Código/Descrição', r.codigo); add('Data', r.dataTxt); add('Status da Atividade', r.status);
    add('Nome do Solicitante', r.solicitante); add('Cidade', r.cidade); add('Início do SLA', r.slaInicio); add('Fim do SLA', r.slaFim);
    add('Tipo do Corte Realizado', r.tipoCorte); add('Qual a situação do imóvel?', r.situacaoPergunta); add('Irregularidade Encontrada?', r.irregularidade);
    add('Valor Total dos Débitos', r.valor == null ? '' : brl.format(r.valor)); add('Negociou O Débito?', r.negociou); add('Categoria', r.categoria);
    add('Situação Do Imóvel', r.situacaoImovel); add('Serviço adicionais resposta', r.servAdic); add('Arquivo de origem', r.arquivo);
    return dl;
  }

  function renderAnTabela() {
    const box = $('#an-tabela');
    const total = anRows.length;
    const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    if (state.an.page > paginas) state.an.page = paginas;
    const ini = (state.an.page - 1) * POR_PAGINA;
    const pagina = anRows.slice(ini, ini + POR_PAGINA);
    $('#an-contagem').textContent = fmtInt(total) + ' ' + plural(total, 'registro', 'registros') + ' · ' + IND[state.an.ind].rotulo;
    const cols = ['', 'Data', 'Protocolo / O.S.', 'Matrícula', 'Solicitante', 'Cidade', 'Equipe', 'Frente', 'Status', 'Negociação', 'Débito', 'Termo'];
    const linhas = [];
    pagina.forEach((r, i) => {
      const idx = ini + i;
      const aberto = state.an.expanded.has(idx);
      linhas.push(h('tr', null,
        h('td', null, h('button', { class: 'expander', type: 'button', 'aria-expanded': aberto ? 'true' : 'false', 'aria-label': (aberto ? 'Recolher' : 'Expandir') + ' detalhes de ' + (r.protocolo || r.matricula || 'registro'), text: aberto ? '−' : '+', onclick: () => { if (aberto) state.an.expanded.delete(idx); else state.an.expanded.add(idx); renderAnTabela(); } })),
        h('td', { class: 'num', text: r.dataTxt }),
        h('td', { text: r.protocolo }),
        h('td', { class: 'num', text: r.matricula }),
        h('td', { text: r.solicitante }),
        h('td', { text: r.cidade }),
        h('td', { text: r.recurso }),
        h('td', { text: r.frente }),
        h('td', null, r.exec ? tag('Finalizada', 'exec') : r.exoc ? tag('Encerrada c/ ocorrência', 'exoc') : tag(r.status || '—')),
        h('td', null, r.semDesdobro ? tag('Sem Desdobro', 'sem') : r.neg ? tag('Negociou', 'neg') : '—'),
        h('td', { class: 'n', text: r.valor == null ? '—' : brl.format(r.valor) }),
        h('td', null, r.termo ? [r.t11 ? tag('110013', 'termo') : null, ' ', r.t31 ? tag('310013', 'termo') : null] : '—')));
      if (aberto) linhas.push(h('tr', { class: 'detail-row' }, h('td', { colspan: cols.length }, h('div', { class: 'detail-inner' }, detalheRegistro(r)))));
    });
    box.replaceChildren(
      h('div', { class: 'table-wrap', style: { maxHeight: '68vh' } }, h('table', null,
        h('caption', { class: 'sr-only', text: 'Atividades filtradas' }),
        h('thead', null, h('tr', null, cols.map((c, i) => h('th', { scope: 'col', class: c === 'Débito' ? 'n' : '', text: c || undefined }, i === 0 ? h('span', { class: 'sr-only', text: 'Detalhes' }) : null)))),
        h('tbody', null, linhas.length ? linhas : h('tr', null, h('td', { colspan: cols.length, text: 'Nenhum registro para os filtros atuais.' }))))),
      h('div', { class: 'pager' },
        h('span', { text: total ? 'Exibindo ' + fmtInt(ini + 1) + '–' + fmtInt(Math.min(total, ini + POR_PAGINA)) + ' de ' + fmtInt(total) + ' · página ' + state.an.page + ' de ' + paginas : '' }),
        h('div', { class: 'btns' },
          h('button', { class: 'btn small', type: 'button', text: '« Primeira', disabled: state.an.page <= 1, onclick: () => irPagina(1) }),
          h('button', { class: 'btn small', type: 'button', text: '‹ Anterior', disabled: state.an.page <= 1, onclick: () => irPagina(state.an.page - 1) }),
          h('button', { class: 'btn small', type: 'button', text: 'Próxima ›', disabled: state.an.page >= paginas, onclick: () => irPagina(state.an.page + 1) }),
          h('button', { class: 'btn small', type: 'button', text: 'Última »', disabled: state.an.page >= paginas, onclick: () => irPagina(paginas) })))
    );
    const larg = box.querySelector('.table-wrap').clientWidth;
    for (const d of box.querySelectorAll('.detail-inner')) d.style.width = Math.max(larg - 2, 200) + 'px';
  }
  function irPagina(p) {
    state.an.page = p;
    state.an.expanded = new Set();
    renderAnTabela();
    const t = $('#an-tabela');
    if (t) t.scrollIntoView({ block: 'nearest' });
  }

  function exportarCsv() {
    if (!anRows.length) { setStatus({ kind: 'warning', title: 'Nada para exportar', detail: 'Nenhum registro atende aos filtros atuais.' }); return; }
    const csv = PC.toCsv(anRows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const d = new Date();
    const nome = 'pos-corte_' + state.an.ind + '_' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '.csv';
    const a = h('a', { href: url, download: nome });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  let anMontado = false;
  function montarAnalitico() {
    const root = $('#view-analitico');
    let debounce = null;
    root.replaceChildren(h('div', { class: 'stack' },
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('div', null, h('h2', { text: 'Analítico' }), h('p', { class: 'hint', text: 'Os filtros de data, cidade, frente e equipe valem aqui. A exportação inclui todas as linhas filtradas, não só a página exibida.' }))),
        h('div', { class: 'toolbar' },
          h('div', { class: 'field' }, h('label', { for: 'an-ind', text: 'Indicador' }),
            h('select', { id: 'an-ind', onchange: (e) => { state.an.ind = e.target.value; state.an.page = 1; state.an.expanded = new Set(); calcular(); renderAnTabela(); } },
              INDS.map((i) => h('option', { value: i.key, text: i.key === 'atividades' ? 'Todas as atividades' : i.rotulo, selected: i.key === state.an.ind })))),
          h('div', { class: 'field grow' }, h('label', { for: 'an-busca', text: 'Buscar matrícula, protocolo/O.S., ID ou nome' }),
            h('input', { id: 'an-busca', type: 'search', autocomplete: 'off', value: state.an.busca, oninput: (e) => {
              clearTimeout(debounce);
              const v = e.target.value;
              debounce = setTimeout(() => { state.an.busca = v; state.an.page = 1; state.an.expanded = new Set(); calcular(); renderAnTabela(); }, 200);
            } })),
          h('div', { class: 'field', style: { flex: '0 0 auto' } }, h('label', { text: ' ' }), h('button', { class: 'btn primary', type: 'button', onclick: exportarCsv }, icon('download'), 'Exportar CSV'))),
        h('p', { class: 'count-note', id: 'an-contagem', style: { marginTop: '10px' } })),
      h('section', { class: 'card' }, h('div', { id: 'an-tabela' }))
    ));
    anMontado = true;
  }
  function renderAnalitico() {
    if (!state.records.length) { $('#view-analitico').replaceChildren(estadoVazio()); anMontado = false; return; }
    if (!anMontado) montarAnalitico();
    $('#an-ind').value = state.an.ind;
    renderAnTabela();
  }

  /* ------------------------------------------------------------------ */
  /* Base e regras                                                       */
  /* ------------------------------------------------------------------ */

  function verificacoes() {
    const recs = state.records;
    const s = PC.summarize(recs);
    const out = [];
    const add = (ok, t, d) => out.push({ ok, t, d });
    add(s.exec + s.exoc + s.outros === s.atividades, 'Exec + Exoc + outros status = Atividades', fmtInt(s.exec) + ' + ' + fmtInt(s.exoc) + ' + ' + fmtInt(s.outros) + ' = ' + fmtInt(s.atividades));
    add(s.semDesdobro <= s.neg, 'Sem Desdobro é subconjunto das negociações', fmtInt(s.semDesdobro) + ' de ' + fmtInt(s.neg));
    for (const [dim, nome] of [['frente', 'frentes'], ['cidade', 'cidades'], ['recurso', 'equipes']]) {
      const r = PC.ranking(recs, dim, 'atividades');
      const soma = r.items.reduce((a, i) => a + i.value, 0);
      add(soma === s.atividades, 'Soma dos rankings de ' + nome + ' = Atividades', fmtInt(soma) + ' de ' + fmtInt(s.atividades));
    }
    const meses = PC.monthlySeries(recs);
    const somaMeses = meses.reduce((a, m) => a + m.sum.atividades, 0);
    add(somaMeses === s.atividades, 'Soma dos meses = Atividades', fmtInt(somaMeses) + ' de ' + fmtInt(s.atividades));
    const cons = state.consolidado;
    if (cons) add(cons.records.length + cons.duplicatas === cons.lidos, 'Registros lidos − duplicatas = Atividades', fmtInt(cons.lidos) + ' − ' + fmtInt(cons.duplicatas) + ' = ' + fmtInt(cons.records.length));
    const semData = recs.filter((r) => !r.data).length;
    add(semData === 0, 'Registros com data válida', semData ? fmtInt(semData) + ' sem data válida (saem de filtros de período)' : 'todos');
    const naoMap = recs.filter((r) => r.frente === PC.NAO_MAPEADA).length;
    add(naoMap === 0, 'Registros com frente mapeada', naoMap ? fmtInt(naoMap) + ' em "Não mapeada"' : 'todos');
    return out;
  }

  function tabelaArquivos() {
    const linhas = state.files
      .slice()
      .sort((a, b) => (a.ok && b.ok ? a.res.lastModified - b.res.lastModified : a.ok ? -1 : 1))
      .map((f) => {
        if (!f.ok) return h('tr', null, h('td', { text: f.path }), h('td', { text: '—' }), h('td', { text: '—' }), h('td', { text: '—' }), h('td', { class: 'n', text: '—' }), h('td', null, tag('Erro', 'exoc'), ' ' + f.motivo));
        const r = f.res;
        const conf = r.conferencia.map((c) => c.erro ? c.rotulo + ': ' + c.erro : c.rotulo + ': ' + (c.conciliado ? 'conciliado com a aba ' + c.aba + ' (' + fmtInt(c.linhas) + ')' : 'DIVERGE da aba ' + c.aba + ' (aba ' + fmtInt(c.linhas) + ' · cálculo ' + fmtInt(c.calculadoNaBase) + ' · na Base ' + fmtInt(c.naBase) + ')'));
        return h('tr', null,
          h('td', { text: r.path }), h('td', { class: 'num', text: fmtDataHora(r.lastModified) }), h('td', { class: 'num', text: fmtBytes(r.size) }),
          h('td', { text: r.abaBase }), h('td', { class: 'n', text: fmtInt(r.records.length) }),
          h('td', null, tag('OK', 'exec'), r.warnings.length ? h('ul', { style: { margin: '6px 0 0', paddingLeft: '18px' } }, r.warnings.map((w) => h('li', { text: w }))) : null,
            conf.length ? h('ul', { style: { margin: '6px 0 0', paddingLeft: '18px' } }, conf.map((c) => h('li', { text: c }))) : null));
      });
    return h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null, ['Arquivo', 'Modificado em', 'Tamanho', 'Aba usada', 'Linhas lidas', 'Resultado'].map((c, i) => h('th', { scope: 'col', class: i === 4 ? 'n' : '', text: c })))),
      h('tbody', null, linhas)));
  }

  function cardFonte() {
    const s = state.source;
    const c = state.consolidado;
    const kv = h('dl', { class: 'kv' });
    const add = (k, v) => { kv.append(h('dt', { text: k }), h('dd', { text: v })); };
    add('Fonte', s ? (s.kind === 'folder' ? 'Pasta "' + s.name + '"' : s.name) : 'nenhuma');
    add('Modo', !s ? '—' : s.mode === 'handle' ? 'Acesso contínuo: leitura a cada 60 s com a página visível, e botão Atualizar' : 'Seleção manual: selecione novamente para atualizar (sem monitoramento automático)');
    add('Última leitura com mudanças', state.lastRead ? fmtDataHora(state.lastRead.getTime()) : '—');
    add('Última verificação', state.lastCheck ? hhmmss(state.lastCheck) : '—');
    add('Arquivos válidos', state.files.length ? state.files.filter((f) => f.ok).length + ' de ' + state.files.length : '—');
    add('Registros lidos / atividades', c ? fmtInt(c.lidos) + ' / ' + fmtInt(c.records.length) : '—');
    add('Duplicatas removidas', c ? fmtInt(c.duplicatas) : '—');
    if (c && c.semChave) add('Linhas sem chave completa', fmtInt(c.semChave) + ' (nunca são unidas a outras)');
    if (state.records.length) {
      let mn = '', mx = '';
      for (const r of state.records) if (r.data) { if (!mn || r.data < mn) mn = r.data; if (!mx || r.data > mx) mx = r.data; }
      add('Período dos dados', mn ? PC.isoToBR(mn) + ' a ' + PC.isoToBR(mx) : 'sem datas');
    }
    return h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', { text: 'Fonte e arquivos lidos' })),
      kv,
      state.files.length ? h('div', { style: { marginTop: '12px' } }, tabelaArquivos()) : null,
      state.ignoradosFormato.length ? h('p', { class: 'note warn', text: 'Ignorados (formato não suportado; salve como .xlsx): ' + state.ignoradosFormato.join(', ') }) : null,
      h('p', { class: 'note', text: 'A ordem dos arquivos para deduplicação é a data de modificação (do mais antigo ao mais recente). É um critério operacional, não garante que o conteúdo seja o mais atual: evite misturar versões conflitantes na pasta.' })
    );
  }

  function cardVerificacoes() {
    const v = verificacoes();
    return h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('div', null, h('h2', { text: 'Conferências automáticas' }), h('p', { class: 'hint', text: 'Calculadas sobre a base completa, sem filtros.' }))),
      h('ul', { class: 'checks' }, v.map((x) => h('li', null, h('span', { class: x.ok ? 'ok' : 'bad' }, icon(x.ok ? 'check' : 'alert', 18)), h('div', null, h('strong', { text: x.t }), h('div', { class: 'count-note', text: x.d }))))));
  }

  function cardColunas() {
    const okFiles = state.files.filter((f) => f.ok).map((f) => f.res);
    const campos = PC.FIELDS;
    const sel = h('select', { id: 'al-campo', 'aria-label': 'Campo do painel' }, campos.map((f) => h('option', { value: f.key, text: f.header })));
    const inp = h('input', { id: 'al-nome', type: 'text', autocomplete: 'off', placeholder: 'Nome da coluna no seu arquivo' });
    const adicionar = () => {
      const nome = inp.value.trim();
      if (!nome) return;
      const lista = state.aliases[sel.value] || (state.aliases[sel.value] = []);
      if (!lista.includes(nome)) lista.push(nome);
      salvarAliases();
      inp.value = '';
      reprocessar();
    };
    const listaAl = Object.entries(state.aliases).flatMap(([k, ns]) => ns.map((n) => ({ k, n })));
    return h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('div', null, h('h2', { text: 'Colunas reconhecidas' }), h('p', { class: 'hint', text: 'O painel usa só estas 19 colunas; as demais são apenas auditadas. A comparação ignora maiúsculas, acentos e pontuação.' }))),
      okFiles.length ? okFiles.map((r) => h('details', { style: { marginBottom: '8px' } },
        h('summary', { text: r.name + ' — ' + r.cobertura.reconhecidas.length + ' de ' + campos.length + ' colunas reconhecidas' + (r.cobertura.ausentes.length ? ' (' + r.cobertura.ausentes.length + ' ausentes)' : '') }),
        h('div', { class: 'table-wrap', style: { marginTop: '8px' } }, h('table', null,
          h('thead', null, h('tr', null, ['Campo esperado', 'Coluna no arquivo', 'Situação'].map((c) => h('th', { scope: 'col', text: c })))),
          h('tbody', null, campos.map((f) => {
            const rec = r.cobertura.reconhecidas.find((x) => x.campo === f.key);
            return h('tr', null, h('td', { text: f.header }), h('td', { text: rec ? rec.planilha : '—' }), h('td', null, rec ? tag('reconhecida', 'exec') : tag('ausente', 'exoc')));
          })))))) : h('p', { class: 'note', text: 'Carregue um arquivo para ver as colunas reconhecidas.' }),
      h('h3', { style: { fontSize: '14px', margin: '14px 0 6px' }, text: 'Nomes alternativos de colunas' }),
      h('p', { class: 'hint', text: 'Se em algum arquivo uma coluna tem outro nome (por exemplo, "Status" em vez de "Status da Atividade"), informe o nome alternativo. Fica salvo neste navegador e vale para todos os arquivos.' }),
      h('div', { class: 'toolbar', style: { marginTop: '8px' } },
        h('div', { class: 'field' }, h('label', { for: 'al-campo', text: 'Campo' }), sel),
        h('div', { class: 'field grow' }, h('label', { for: 'al-nome', text: 'Nome no arquivo' }), inp),
        h('div', { class: 'field', style: { flex: '0 0 auto' } }, h('label', { text: ' ' }), h('button', { class: 'btn', type: 'button', text: 'Adicionar e reler', onclick: adicionar }))),
      listaAl.length ? h('ul', { class: 'checks', style: { marginTop: '10px' } }, listaAl.map((a) => h('li', null, h('span', null), h('div', null,
        h('strong', { text: campos.find((f) => f.key === a.k).header }), ' ← "', a.n, '" ',
        h('button', { class: 'btn small ghost', type: 'button', text: 'Remover', onclick: () => { state.aliases[a.k] = state.aliases[a.k].filter((x) => x !== a.n); if (!state.aliases[a.k].length) delete state.aliases[a.k]; salvarAliases(); reprocessar(); } }))))) : null
    );
  }

  function cardFrentes() {
    const map = [...state.frenteMap.values()].sort((a, b) => a.frente.localeCompare(b.frente, 'pt-BR') || a.nomenclatura.localeCompare(b.nomenclatura, 'pt-BR'));
    const naoMap = new Map();
    for (const r of state.records) if (r.frente === PC.NAO_MAPEADA) naoMap.set(r.recurso || '(sem recurso)', (naoMap.get(r.recurso || '(sem recurso)') || 0) + 1);
    const lista = [...naoMap].sort((a, b) => b[1] - a[1]);
    const total = lista.reduce((a, x) => a + x[1], 0);
    return h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('div', null, h('h2', { text: 'Frentes de serviço' }), h('p', { class: 'hint', text: 'A frente é definida pelo início do Recurso (Nomenclatura), sem diferenciar maiúsculas; havendo mais de um prefixo, vale o mais longo. Sem correspondência: "Não mapeada".' }))),
      total ? h('div', { class: 'note warn' },
        h('strong', { text: fmtInt(total) + ' atividades em "Não mapeada". ' }), 'Recursos sem Nomenclatura correspondente: ',
        lista.slice(0, 30).map((x) => x[0] + ' (' + fmtInt(x[1]) + ')').join(', ') + (lista.length > 30 ? ', … +' + (lista.length - 30) : '') + '. Para mapear, inclua a Nomenclatura na aba "Frente de Serviço" do arquivo.') : h('p', { class: 'note', text: 'Todos os recursos da base têm frente mapeada.' }),
      h('details', { style: { marginTop: '10px' } }, h('summary', { text: 'Mapeamento em uso (' + map.length + ' nomenclaturas)' }),
        h('div', { class: 'table-wrap', style: { marginTop: '8px', maxHeight: '320px' } }, h('table', null,
          h('thead', null, h('tr', null, ['Nomenclatura (prefixo do Recurso)', 'Frente', 'Origem'].map((c) => h('th', { scope: 'col', text: c })))),
          h('tbody', null, map.map((m) => h('tr', null, h('td', { text: m.nomenclatura }), h('td', { text: m.frente }), h('td', { text: m.origem || '—' })))))))
    );
  }

  function cardAuditoria() {
    const arq = state.files.filter((f) => f.ok).map((f) => f.res).sort((a, b) => b.lastModified - a.lastModified)[0];
    if (!arq) return null;
    const cols = arq.audit.colunas;
    const linhas = arq.audit.linhas;
    const aberta = state.auditoriaAberta;
    const dados = cols.slice().sort((a, b) => (b.mantida - a.mantida) || a.coluna - b.coluna);
    return h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('div', null, h('h2', { text: 'Auditoria de preenchimento das colunas' }), h('p', { class: 'hint', text: 'Arquivo mais recente: ' + arq.name + ' · ' + fmtInt(linhas) + ' linhas · ' + cols.length + ' colunas com cabeçalho · ' + cols.filter((c) => c.mantida).length + ' usadas pelo painel.' }))),
      h('details', { ontoggle: (e) => { state.auditoriaAberta = e.target.open; } , open: aberta },
        h('summary', { text: 'Ver todas as colunas' }),
        h('div', { class: 'table-wrap', style: { marginTop: '8px', maxHeight: '420px' } }, h('table', null,
          h('thead', null, h('tr', null, ['Coluna', 'Nome', 'Preenchidas', '%', 'Usada no painel'].map((c, i) => h('th', { scope: 'col', class: i === 2 || i === 3 ? 'n' : '', text: c })))),
          h('tbody', null, dados.map((c) => h('tr', null,
            h('td', { class: 'num', text: colLetra(c.coluna) }), h('td', { text: c.nome }), h('td', { class: 'n', text: fmtInt(c.preenchidas) }),
            h('td', { class: 'n', text: fmtPct(c.preenchidas, linhas) }), h('td', null, c.mantida ? tag('sim', 'exec') : '—'))))))));
  }
  function colLetra(i) {
    let s = '';
    for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    return s;
  }

  function cardRegras() {
    const li = (...t) => h('li', null, ...t);
    return h('section', { class: 'card rules' },
      h('div', { class: 'card-head' }, h('h2', { text: 'Regras dos indicadores' })),
      h('h3', { text: 'Atividades' }),
      h('p', { text: 'Registros da aba Base após a deduplicação entre arquivos e os filtros escolhidos. As abas de Termos e Negociações são recortes da Base: não são somadas a ela (só conferidas).' }),
      h('h3', { text: 'Exec e Exoc' }),
      h('ul', null, li(h('strong', { text: 'Exec' }), ': Status da Atividade = ', h('code', { text: 'Finalizada' }), '.'), li(h('strong', { text: 'Exoc' }), ': Status da Atividade = ', h('code', { text: 'Encerrada com Ocorrência' }), '. Outros status aparecem na distribuição dos status.')),
      h('h3', { text: 'Negociações e Sem Desdobro' }),
      h('ul', null,
        li('Só há negociação quando ', h('code', { text: 'Negociou O Débito?' }), ' é ', h('strong', { text: 'Sim' }), ' (espaços nas pontas e maiúsculas/minúsculas são ignorados). Códigos, texto livre, valor do débito ou desdobro não criam negociação.'),
        li(h('strong', { text: 'Sem Desdobro' }), ': negociação com ', h('code', { text: 'Serviço adicionais resposta' }), ' vazio, nulo ou só com espaços. Continua contando como negociação: é um subconjunto, não um indicador a somar.')),
      h('h3', { text: 'Irregularidade identificada — Termos aplicados' }),
      h('ul', null,
        li('Conta quando ', h('code', { text: 'Serviço adicionais resposta' }), ' contém o código completo ', h('code', { text: '110013' }), ' (termo do time de Serviços) ou ', h('code', { text: '310013' }), ' (termo do VCG), em qualquer posição do texto.'),
        li('Os códigos precisam ter limites numéricos: ', h('code', { text: '1100130' }), ' ou ', h('code', { text: '9310013' }), ' não contam.'),
        li('Cada atividade conta uma única vez, mesmo com os dois códigos. ', h('code', { text: 'Irregularidade Encontrada? = Sim' }), ' sozinho não conta.'),
        li('Negociação e termo podem ocorrer na mesma atividade; não some os dois para obter visitas. Não há filtro adicional de status.')),
      h('h3', { text: 'Valores' }),
      h('p', { text: 'O valor das negociações é o débito informado nas atividades (Valor Total dos Débitos, no padrão brasileiro R$ 1.234,56). Não é arrecadação, valor recebido nem valor pago.' }),
      h('h3', { text: 'Deduplicação' }),
      h('ul', null,
        li('Chave: ', h('code', { text: 'ID da Atividade' }), '. Sem ID: Protocolo + Matrícula + Código/Descrição + Data + Recurso (se algum desses campos estiver vazio, a linha não é unida a nenhuma outra).'),
        li('Chave repetida: prevalece o registro do arquivo com a data de modificação mais recente. Matrículas repetidas com IDs diferentes são visitas distintas e são preservadas.'),
        li('Arquivos temporários (~$) são ignorados; subpastas são lidas.')),
      h('h3', { text: 'Formatos e limites' }),
      h('ul', null,
        li('Lê .xlsx sem senha. Não lê .xls, .xlsb, arquivos com senha nem ZIP64. Fórmulas são lidas pelo resultado gravado, sem recalcular.'),
        li('Arquivos com menos colunas ou outra aba principal são aceitos: a aba "Base" é preferida; sem ela, vale a única aba com as colunas esperadas. Indicadores sem a coluna necessária são marcados como indisponíveis, nunca como zero silencioso.'),
        li('Este painel não grava no OneDrive nem atualiza com a página fechada. A base carregada não fica salva no arquivo HTML: ao reabrir, conecte a pasta novamente (o navegador pode lembrar a última pasta).'))
    );
  }

  function renderBase() {
    const root = $('#view-base');
    root.replaceChildren(h('div', { class: 'stack' },
      state.records.length ? [cardFonte(), cardVerificacoes(), cardColunas(), cardFrentes(), cardAuditoria(), cardRegras()] : [estadoVazio(), cardColunas(), cardRegras()]
    ));
  }

  /* ------------------------------------------------------------------ */
  /* Renderização geral                                                  */
  /* ------------------------------------------------------------------ */

  function renderTudo() {
    const ativo = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fk : '';
    const tem = state.records.length > 0;
    $('#filters').hidden = !tem;
    calcular();
    renderChips();
    if (state.view === 'geral') renderGeral();
    else if (state.view === 'analitico') renderAnalitico();
    else renderBase();
    renderSideFoot();
    if (ativo) {
      const el = [...document.querySelectorAll('[data-fk]')].find((x) => x.dataset.fk === ativo);
      if (el) el.focus({ preventScroll: true });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Inicialização                                                       */
  /* ------------------------------------------------------------------ */

  function init() {
    $('#f-ind').replaceChildren(...INDS.map((i) => h('option', { value: i.key, text: i.rotulo })));
    $('#f-ind').addEventListener('change', (e) => { state.chartInd = e.target.value; renderTudo(); });
    $('#f-from').addEventListener('change', (e) => { state.filters.from = e.target.value; aplicarFiltros(); });
    $('#f-to').addEventListener('change', (e) => { state.filters.to = e.target.value; aplicarFiltros(); });
    $('#f-cidade').addEventListener('change', (e) => { state.filters.cidade = e.target.value; aplicarFiltros(); });
    $('#f-frente').addEventListener('change', (e) => { state.filters.frente = e.target.value; aplicarFiltros(); });
    $('#f-equipe').addEventListener('change', (e) => { state.filters.equipe = e.target.value; aplicarFiltros(); });
    montarNav();
    montarFiltros();
    renderActions();
    renderTudo();
    if (typeof DecompressionStream === 'undefined' || typeof Blob === 'undefined' || !Blob.prototype.stream) {
      setStatus({ kind: 'error', title: 'Navegador sem suporte', detail: 'Este painel precisa de um Chrome ou Edge atualizado para ler arquivos Excel.' });
      for (const id of ['#btn-pasta', '#btn-atualizar', '#btn-importar']) $(id).disabled = true;
      return;
    }
    if (!temPicker()) {
      setStatus({ kind: 'info', title: 'Seleção manual de pasta', detail: 'Este navegador não permite acesso contínuo à pasta. Use "Conectar pasta" para escolhê-la e selecione-a de novo quando quiser atualizar. Para leitura automática a cada 60 s, abra o painel no Chrome ou no Edge.' });
    }
    restaurarPasta();
  }
  window.__poscorte = { state, PC, carregar, get vm() { return vm; }, get anRows() { return anRows; } }; // gancho para testes e diagnóstico
  init();
})();
