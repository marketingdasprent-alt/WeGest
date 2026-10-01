import type { TipoDeCampo } from '@/hooks/automacao/useAutomationCatalogo';

/**
 * Ponte entre a caixa de texto e o JSON gravado: o avaliador de condições
 * compara por tipo, sem coerção, e `"500"` nunca casava com `500`.
 * Corrige-se aqui, não no avaliador, para não reabrir as ambiguidades que a Fase 4 fechou.
 */

/**
 * Texto do formulário → valor JSON do tipo declarado.
 *
 * Devolve `null` quando o texto não representa um valor válido daquele tipo.
 * Quem chama decide o que fazer com isso — normalmente, não deixar gravar.
 */
export function paraValorJson(texto: string, tipo: TipoDeCampo): string | number | boolean | null {
  if (tipo === 'number') {
    const limpo = texto.trim();
    if (limpo === '') return null;
    // `Number('')` é 0 e `Number(' ')` também: sem o guarda acima, um campo
    // vazio gravava zero e a condição passava a comparar com um número que o
    // utilizador nunca escreveu.
    const n = Number(limpo);
    return Number.isFinite(n) ? n : null;
  }

  if (tipo === 'boolean') {
    if (texto === 'true') return true;
    if (texto === 'false') return false;
    return null;
  }

  return texto;
}

/** Valor JSON gravado → texto para o formulário. */
export function paraTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'boolean') return valor ? 'true' : 'false';
  return String(valor);
}

/**
 * O tipo declarado para um campo, ou `string` se o catálogo não o conhecer.
 *
 * O fallback é `string` porque é o que o motor faz com um valor de texto: uma
 * comparação de strings. Assumir `number` para um campo desconhecido produziria
 * uma condição que nunca casa.
 */
export function tipoDoCampo(
  campos: Array<{ id: string; tipo: TipoDeCampo }>,
  campoId: string | undefined
): TipoDeCampo {
  if (!campoId) return 'string';
  return campos.find((c) => c.id === campoId)?.tipo ?? 'string';
}
