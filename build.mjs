#!/usr/bin/env node
// Junta src/ em um único arquivo HTML independente (CSS, JS e mapeamento de frentes incorporados).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = dirname(fileURLToPath(import.meta.url));
const ler = (f) => readFileSync(join(raiz, 'src', f), 'utf8');
const seguro = (js) => js.replace(/<\/(script|style)/gi, '<\\/$1');

let html = ler('template.html');
const partes = { css: ler('styles.css'), frentes: ler('frentes-padrao.js'), core: ler('core.js'), exportar: ler('exportar.js'), app: ler('app.js') };
for (const [k, v] of Object.entries(partes)) {
  const marca = `/*INLINE:${k}*/`;
  if (!html.includes(marca)) throw new Error('marcador ausente no template: ' + marca);
  html = html.replace(marca, () => seguro(v));
}
const saida = join(raiz, 'Acompanhamento_Pos_Corte.html');
writeFileSync(saida, html);
// Cópia para o GitHub Pages (Settings > Pages > Branch main, pasta /docs): o painel não contém dados, só código.
mkdirSync(join(raiz, 'docs'), { recursive: true });
writeFileSync(join(raiz, 'docs', 'index.html'), html);
console.log('gerado', saida, '(+ docs/index.html)', (html.length / 1024).toFixed(0) + ' KB');
