import { normalizarNome, type CartaoViaturas } from '@/utils/ambitoViaturas';

interface ViaturaParaCartao {
  tipo_id?: string | null;
  is_slot?: boolean | null;
  is_vendida?: boolean | null;
}

export interface CartaoTipoViatura {
  /** 'all', o id do tipo, ou 'slot'. */
  id: string;
  nome: string;
  /** Número em destaque: disponíveis — no SLOT, os que têm motorista. */
  destaque: number;
  total: number;
  legenda?: string;
}

/**
 * Cartões por tipo da página Viaturas. Tudo pelo estado derivado, para o
 * "Todos os Tipos" bater certo com a soma dos tipos. Os carros slot contam
 * só no cartão SLOT — nunca estão disponíveis (são do próprio motorista).
 */
export function cartoesTiposViatura<V extends ViaturaParaCartao>(
  viaturas: readonly V[],
  tipos: readonly { id: string; nome: string }[],
  estadoDe: (v: V) => string,
  entraNaContagem: (v: V) => boolean,
  /** Cartões escondidos pelo âmbito do cargo; o SLOT fica sempre. */
  ocultos: readonly CartaoViaturas[] = []
): CartaoTipoViatura[] {
  const frota = viaturas.filter((v) => !v.is_slot && entraNaContagem(v));
  const disponiveis = (lista: readonly V[]) =>
    lista.filter((v) => estadoDe(v) === 'disponivel').length;
  const slot = viaturas.filter((v) => v.is_slot && !v.is_vendida);

  const porTipo = tipos
    .map((t) => {
      const doTipo = frota.filter((v) => v.tipo_id === t.id);
      return { id: t.id, nome: t.nome, total: doTipo.length, destaque: disponiveis(doTipo) };
    })
    // O tipo "SLOT" fica vazio (os carros slot contam no cartão SLOT) — não se repete.
    .filter((c) => !(normalizarNome(c.nome) === 'slot' && c.total === 0));

  return [
    ...(ocultos.includes('todos_os_tipos')
      ? []
      : [{ id: 'all', nome: 'Todos os Tipos', total: frota.length, destaque: disponiveis(frota) }]),
    ...(ocultos.includes('tipos') ? [] : porTipo),
    {
      id: 'slot',
      nome: 'SLOT',
      legenda: 'com motorista',
      total: slot.length,
      destaque: slot.filter((v) => estadoDe(v) === 'em_slot').length,
    },
  ];
}

/** Colunas das grelhas de cartões da página Viaturas (desktop). */
export const COLUNAS_CARTOES = 6;

/** Os cartões por tipo cabem na linha dos estados? Então não abrem uma linha só para eles. */
export function cabemNaLinhaDosEstados(nEstados: number, nTipos: number): boolean {
  return nTipos > 0 && nEstados + nTipos <= COLUNAS_CARTOES;
}
