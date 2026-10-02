// Exemplos de pedido gerados a partir da operação (método, caminho, parâmetros)
// e do servidor. A chave nunca aparece literal: vem sempre de uma variável de
// ambiente do servidor (WEGEST_API_KEY). Nunca há exemplo de browser.
import type { Operacao } from './spec';

export type Linguagem = 'curl' | 'javascript' | 'php';

export const LINGUAGENS: { id: Linguagem; rotulo: string }[] = [
  { id: 'curl', rotulo: 'cURL' },
  { id: 'javascript', rotulo: 'JavaScript' },
  { id: 'php', rotulo: 'PHP' },
];

/** URL de exemplo: {id} e afins pelo example do parâmetro; query com os exemplos. */
export function urlExemplo(op: Operacao, servidor: string): string {
  let caminho = op.caminho;
  for (const p of op.parametros.filter((x) => x.em === 'path')) {
    caminho = caminho.replace(`{${p.nome}}`, encodeURIComponent(String(p.exemplo)));
  }
  const query = op.parametros
    .filter((p) => p.em === 'query' && p.exemplo !== undefined)
    .map((p) => `${encodeURIComponent(p.nome)}=${encodeURIComponent(String(p.exemplo))}`)
    .join('&');
  const base = `${servidor.replace(/\/$/, '')}${caminho === '/' ? '' : caminho}`;
  return query ? `${base}?${query}` : base;
}

/** Corpo de exemplo numa linha de JSON, ou null quando a operação não leva corpo. */
const corpoJson = (op: Operacao): string | null =>
  op.corpo?.exemplo === undefined ? null : JSON.stringify(op.corpo.exemplo);

/** Entre plicas (shell e PHP): só a plica e, no PHP, a barra precisam de escape. */
const plicasShell = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
const plicasPhp = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

function curl(op: Operacao, url: string): string {
  const linhas = [op.metodo === 'GET' ? `curl "${url}"` : `curl -X ${op.metodo} "${url}"`];
  if (!op.publica) linhas.push('  -H "X-API-Key: $WEGEST_API_KEY"');
  const corpo = corpoJson(op);
  if (corpo) linhas.push('  -H "Content-Type: application/json"', `  -d ${plicasShell(corpo)}`);
  return linhas.join(' \\\n');
}

function javascript(op: Operacao, url: string): string {
  const opcoes: string[] = [];
  const corpo = corpoJson(op);
  if (op.metodo !== 'GET') opcoes.push(`  method: '${op.metodo}',`);
  if (!op.publica && corpo) {
    opcoes.push(
      `  headers: { 'X-API-Key': process.env.WEGEST_API_KEY, 'Content-Type': 'application/json' },`
    );
  } else if (!op.publica) {
    opcoes.push(`  headers: { 'X-API-Key': process.env.WEGEST_API_KEY },`);
  }
  if (corpo) opcoes.push(`  body: JSON.stringify(${corpo}),`);
  const chamada = opcoes.length
    ? `await fetch('${url}', {\n${opcoes.join('\n')}\n})`
    : `await fetch('${url}')`;
  return [
    '// Node.js (servidor): a chave nunca vai para o browser.',
    `const resposta = ${chamada};`,
    'const dados = await resposta.json();',
  ].join('\n');
}

function php(op: Operacao, url: string): string {
  const opcoes = ['    CURLOPT_RETURNTRANSFER => true,'];
  if (op.metodo !== 'GET') opcoes.push(`    CURLOPT_CUSTOMREQUEST => '${op.metodo}',`);
  const corpo = corpoJson(op);
  if (!op.publica) {
    const json = corpo ? ", 'Content-Type: application/json'" : '';
    opcoes.push(`    CURLOPT_HTTPHEADER => ['X-API-Key: ' . getenv('WEGEST_API_KEY')${json}],`);
  }
  if (corpo) opcoes.push(`    CURLOPT_POSTFIELDS => ${plicasPhp(corpo)},`);
  return [
    '<?php',
    `$ch = curl_init('${url}');`,
    'curl_setopt_array($ch, [',
    ...opcoes,
    ']);',
    '$dados = json_decode(curl_exec($ch), true);',
    'curl_close($ch);',
  ].join('\n');
}

const GERADORES: Record<Linguagem, (op: Operacao, url: string) => string> = {
  curl,
  javascript,
  php,
};

export function exemploDePedido(op: Operacao, linguagem: Linguagem, servidor: string): string {
  return GERADORES[linguagem](op, urlExemplo(op, servidor));
}
