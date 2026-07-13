import type { Viatura, ViaturaFormData } from './viaturaTabDados.types';

/** Campos FK (por-catálogo) do formulário — reaplicados à medida que cada
 *  catálogo (marcas/modelos/combustíveis/grupos/tipos/estações) carrega, porque
 *  o <Select> só mostra o valor quando a respetiva opção está montada. */
export const VIATURA_FK_FIELDS = [
  'marca_id',
  'modelo_id',
  'combustivel_id',
  'grupo_id',
  'tipo_id',
  'estacao_id',
] as const;

/**
 * Mapeia uma viatura (linha da BD) para os valores do formulário de Dados.
 * Preserva TODOS os FKs (marca_id/modelo_id/grupo_id/combustivel_id/tipo_id/
 * estacao_id) — é isto que hidrata os <Select> do perfil. Normaliza numéricos
 * para string (inputs controlados) e o estado 'em_uso' (derivado) para
 * 'disponivel'.
 */
export function viaturaToFormValues(viatura: Viatura): ViaturaFormData {
  return {
    matricula: viatura.matricula || '',
    marca: viatura.marca || '',
    modelo: viatura.modelo || '',
    marca_id: viatura.marca_id || '',
    modelo_id: viatura.modelo_id || '',
    combustivel_id: viatura.combustivel_id || '',
    ano: viatura.ano != null ? String(viatura.ano) : '',
    cor: viatura.cor || '',
    categoria: viatura.categoria || '',
    combustivel: viatura.combustivel || '',
    status: viatura.status === 'em_uso' ? 'disponivel' : viatura.status || 'disponivel',
    km_atual: viatura.km_atual != null ? String(viatura.km_atual) : '',
    numero_motor: viatura.numero_motor || '',
    numero_chassis: viatura.numero_chassis || '',
    data_matricula: viatura.data_matricula || '',
    observacoes: viatura.observacoes || '',
    grupo_id: viatura.grupo_id || '',
    is_slot: viatura.is_slot || false,
    habilitada_tvde: viatura.habilitada_tvde || false,
    estacao_id: viatura.estacao_id || '',
    extintor_numero: viatura.extintor_numero || '',
    extintor_validade: viatura.extintor_validade || '',
    tipo_id: viatura.tipo_id || '',
  };
}
