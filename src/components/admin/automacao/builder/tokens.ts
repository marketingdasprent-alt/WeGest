/**
 * Tokens `{{campo}}` no corpo das mensagens.
 *
 * A substituição espelha o `renderTemplate` das edge functions:
 *   /\{\{\s*(\w+)\s*\}\}/g  →  valor ?? ''
 * `\w+` NÃO apanha pontos, por isso `{{motorista.nome}}` nunca é substituído
 * no servidor. Se a pré-visualização o substituísse, mostrava um email que
 * nunca vai existir — daí este ficheiro repetir a regra em vez de a melhorar.
 */

const PADRAO = /\{\{\s*(\w+)\s*\}\}/g;

export function substituirTokens(texto: string, vars: Record<string, unknown>): string {
  return texto.replace(PADRAO, (_todo, campo: string) => {
    const valor = vars[campo];
    return valor === undefined || valor === null ? '' : String(valor);
  });
}

export function extrairTokens(texto: string): string[] {
  const encontrados = [...texto.matchAll(PADRAO)].map((m) => m[1]);
  return [...new Set(encontrados)];
}

export interface ParDoPayload {
  campo: string;
  valor: string;
  /** Só os campos de primeiro nível servem como token. */
  inserivel: boolean;
}

export function paresDoPayload(payload: unknown): ParDoPayload[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];

  return Object.entries(payload as Record<string, unknown>)
    .map(([campo, valor]) => {
      const aninhado = valor !== null && typeof valor === 'object';
      return {
        campo,
        valor: valor === null ? '—' : aninhado ? JSON.stringify(valor) : String(valor),
        // Aninhado aparece — ajuda a perceber o payload — mas não se arrasta
        // para o texto: daria um token que o servidor nunca substitui.
        inserivel: !aninhado,
      };
    })
    .sort((a, b) => a.campo.localeCompare(b.campo));
}

export interface SugestoesDeToken {
  activo: boolean;
  termo: string;
  sugestoes: string[];
}

/** O `{{` aberto mais próximo à esquerda do cursor, se ainda não fechou. */
function tokenEmCurso(texto: string, cursor: number): { inicio: number; termo: string } | null {
  const antes = texto.slice(0, cursor);
  const abriu = antes.lastIndexOf('{{');
  if (abriu === -1) return null;
  const desdeAbertura = antes.slice(abriu + 2);
  if (desdeAbertura.includes('}')) return null;
  return { inicio: abriu, termo: desdeAbertura.trim() };
}

export function sugestoesDeToken(
  texto: string,
  cursor: number,
  campos: string[]
): SugestoesDeToken {
  const emCurso = tokenEmCurso(texto, cursor);
  if (!emCurso) return { activo: false, termo: '', sugestoes: [] };

  const termo = emCurso.termo.toLowerCase();
  return {
    activo: true,
    termo: emCurso.termo,
    sugestoes: campos.filter((c) => c.toLowerCase().includes(termo)),
  };
}

export function inserirToken(
  texto: string,
  cursor: number,
  campo: string
): { texto: string; cursor: number } {
  const emCurso = tokenEmCurso(texto, cursor);
  // Com token começado, substitui o que já lá está em vez de duplicar as
  // chavetas.
  const inicio = emCurso ? emCurso.inicio : cursor;
  const novo = `{{${campo}}}`;

  return {
    texto: texto.slice(0, inicio) + novo + texto.slice(cursor),
    cursor: inicio + novo.length,
  };
}

export interface TokensUsados {
  /** Campos que o texto invoca, pela ordem em que aparecem. */
  usados: string[];
  /** Dos usados, os que não existem no último disparo — provável engano. */
  desconhecidos: string[];
}

/**
 * Que campos é que esta mensagem usa, e quais deles são suspeitos.
 *
 * Sem catálogo de campos (ao contrário dos templates de documentos), a única
 * referência é o payload do último disparo. Quando ele não existe — a regra
 * nunca correu — nada é acusado: marcar tudo a vermelho por falta de amostra
 * era um alarme falso garantido, e é o estado normal de uma automação nova.
 */
export function tokensUsados(texto: string, payload: Record<string, unknown> | null): TokensUsados {
  const usados = extrairTokens(texto);
  if (!payload) return { usados, desconhecidos: [] };

  // `in` e não o valor: um campo com valor vazio existe à mesma.
  const conhecidos = new Set(Object.keys(payload));
  return { usados, desconhecidos: usados.filter((t) => !conhecidos.has(t)) };
}
