import type { TipoDeCampo } from '@/hooks/automacao/useAutomationCatalogo';

/** Preserva o tipo declarado para o avaliador não comparar valores incompatíveis. */

export function paraValorJson(texto: string, tipo: TipoDeCampo): string | number | boolean | null {
  if (tipo === 'number') {
    const limpo = texto.trim();
    if (limpo === '') return null;
    // `Number('')` é zero; um valor vazio não pode tornar-se condição numérica.
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

export function paraTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'boolean') return valor ? 'true' : 'false';
  return String(valor);
}

/** Campos desconhecidos mantêm semântica de comparação textual. */
export function tipoDoCampo(
  campos: Array<{ id: string; tipo: TipoDeCampo }>,
  campoId: string | undefined
): TipoDeCampo {
  if (!campoId) return 'string';
  return campos.find((c) => c.id === campoId)?.tipo ?? 'string';
}
