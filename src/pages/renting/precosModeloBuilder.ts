export interface PrecoModeloFormValues {
  preco_semana: string;
  km_mensal: string;
  km_adicional_valor: string;
  franquia_valor: string;
  caucao_valor: string;
  preco_dia: string;
  preco_mes: string;
  km_mensal_iva: string;
  km_adicional_valor_iva: string;
  franquia_valor_iva: string;
  caucao_valor_iva: string;
}

export interface PrecoModeloRow {
  org_id: string;
  tarifa_id: string;
  modelo_id: string;
  preco_semana: number | null;
  km_mensal: number | null;
  km_adicional_valor: number | null;
  franquia_valor: number | null;
  caucao_valor: number | null;
  preco_dia: number | null;
  preco_mes: number | null;
  km_mensal_iva: number | null;
  km_adicional_valor_iva: number | null;
  franquia_valor_iva: number | null;
  caucao_valor_iva: number | null;
}

const num = (v: string): number | null => (v.trim() ? parseFloat(v) : null);
const int = (v: string): number | null => (v.trim() ? parseInt(v, 10) : null);
const valido = (v: string): boolean => v.trim() !== '' && !Number.isNaN(parseFloat(v));

/**
 * Constrói as linhas a persistir em `renting_tarifa_precos_modelo`, preservando
 * SEMPRE as colunas dos dois regimes (TVDE e Rent-a-Car), independentemente de
 * qual está seleccionado no formulário no momento de gravar. Antes desta função,
 * `savePrecosModelo` filtrava e mapeava só as colunas do regime actual — trocar
 * `tipo` e gravar apagava silenciosamente os preços do outro regime (incidente
 * de 2026-07-14: 34 linhas TVDE substituídas por 1 linha lixo ao mudar uma
 * tarifa de `tvde` para `renting`).
 */
export function buildPrecosModeloLinhas(
  precosModelo: Record<string, PrecoModeloFormValues>,
  orgId: string,
  tarifaId: string
): PrecoModeloRow[] {
  return Object.entries(precosModelo)
    .filter(
      ([, v]) =>
        valido(v.preco_semana) ||
        valido(v.km_mensal) ||
        valido(v.km_adicional_valor) ||
        valido(v.franquia_valor) ||
        valido(v.caucao_valor) ||
        valido(v.preco_dia) ||
        valido(v.preco_mes) ||
        valido(v.km_mensal_iva) ||
        valido(v.km_adicional_valor_iva) ||
        valido(v.franquia_valor_iva) ||
        valido(v.caucao_valor_iva)
    )
    .map(([modelo_id, v]) => ({
      org_id: orgId,
      tarifa_id: tarifaId,
      modelo_id,
      preco_semana: num(v.preco_semana),
      km_mensal: int(v.km_mensal),
      km_adicional_valor: num(v.km_adicional_valor),
      franquia_valor: num(v.franquia_valor),
      caucao_valor: num(v.caucao_valor),
      preco_dia: num(v.preco_dia),
      preco_mes: num(v.preco_mes),
      km_mensal_iva: int(v.km_mensal_iva),
      km_adicional_valor_iva: num(v.km_adicional_valor_iva),
      franquia_valor_iva: num(v.franquia_valor_iva),
      caucao_valor_iva: num(v.caucao_valor_iva),
    }));
}
