import type { ViaturaBasic } from '@/hooks/useViaturas';
import type { RentingGrupoMin } from '@/hooks/useRentingGruposTarifas';

/** Grupos que têm pelo menos 1 viatura no conjunto dado — evita oferecer um
 *  checkbox de filtro por um grupo sem nenhuma viatura disponível. */
export function gruposComViatura(
  viaturas: Pick<ViaturaBasic, 'grupo_id'>[],
  grupos: RentingGrupoMin[]
): RentingGrupoMin[] {
  const idsComViatura = new Set(viaturas.map((v) => v.grupo_id).filter((id): id is string => !!id));
  return grupos.filter((g) => idsComViatura.has(g.id));
}

/** Aplica o filtro de grupos seleccionados (checkboxes) às viaturas.
 *  Set vazio = sem filtro (mostra tudo). Viatura sem grupo_id nunca passa
 *  quando há filtro activo — não há grupo a que possa corresponder. */
export function filtrarViaturasPorGrupo<T extends { grupo_id: string | null }>(
  viaturas: T[],
  gruposFiltro: Set<string>
): T[] {
  if (gruposFiltro.size === 0) return viaturas;
  return viaturas.filter((v) => !!v.grupo_id && gruposFiltro.has(v.grupo_id));
}
