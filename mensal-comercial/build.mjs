// Gera Dashboard_Mensal_Comercial.html: embute o JSON do dia no modelo dashboard.src.html.
// Uso: node mensal-comercial/build.mjs [dados/AAAA-MM-DD.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const dadosPath = resolve(aqui, process.argv[2] || 'dados/2026-09-29.json');
const dados = JSON.parse(readFileSync(dadosPath, 'utf8')); // falha cedo se o JSON for inválido
// "<" escapado: o JSON nunca fecha a tag <script> nem abre comentário HTML.
const json = JSON.stringify(dados)
  .replace(/</g, '\\u003c')
  .replace(new RegExp('[\\u2028\\u2029]', 'g'), (c) => '\\u' + c.charCodeAt(0).toString(16));
const modelo = readFileSync(resolve(aqui, 'dashboard.src.html'), 'utf8');
if (!modelo.includes('__DADOS__')) throw new Error('Marcador __DADOS__ não encontrado em dashboard.src.html');
const html = modelo.replace('__DADOS__', () => json);
const saida = resolve(aqui, 'Dashboard_Mensal_Comercial.html');
writeFileSync(saida, html);
console.log(`Gerado ${saida} (${(html.length / 1024).toFixed(0)} KB) a partir de ${dadosPath}`);
