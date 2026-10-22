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
 * para string (inputs controlados). O estado vai tal como está na BD: só é
 * gravado quando o utilizador o muda (ver montarPayloadViatura).
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
    status: viatura.status || 'disponivel',
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
    proxima_manutencao_data: viatura.proxima_manutencao_data || '',
    proxima_manutencao_km:
      viatura.proxima_manutencao_km != null ? String(viatura.proxima_manutencao_km) : '',
  };
}

export interface MontarPayloadViaturaOpcoes {
  isNew: boolean;
  /** Estado guardado na BD (viatura existente). */
  statusAtual?: string | null;
  /** O utilizador mexeu no Select do estado (dirtyFields.status). */
  statusAlterado: boolean;
  /** Nomes resolvidos dos catálogos, com o texto legado como fallback. */
  marcaNome: string;
  modeloNome: string;
  combustivelNome: string;
}

/**
 * Payload da ficha de Dados. `status` só vai quando o utilizador o escolheu:
 * em_uso/reservada/manutencao são das triggers da BD e gravar o valor que o
 * formulário carregou reescrevia um estado já desactualizado (e pisava inativo).
 */
export function montarPayloadViatura(
  data: ViaturaFormData,
  opcoes: MontarPayloadViaturaOpcoes
): Partial<Viatura> {
  const { isNew, statusAtual, statusAlterado, marcaNome, modeloNome, combustivelNome } = opcoes;
  const status = data.status || 'disponivel';
  const levaStatus = isNew || (statusAlterado && status !== statusAtual);

  return {
    matricula: data.matricula.toUpperCase(),
    marca: marcaNome,
    modelo: modeloNome,
    marca_id: data.marca_id || null,
    modelo_id: data.modelo_id || null,
    combustivel_id: data.combustivel_id || null,
    ano: data.ano ? parseInt(data.ano) : null,
    cor: data.cor || null,
    categoria: data.categoria || null,
    combustivel: combustivelNome || null,
    ...(levaStatus ? { status } : {}),
    km_atual: data.km_atual ? parseInt(data.km_atual) : 0,
    numero_motor: data.numero_motor || null,
    numero_chassis: data.numero_chassis || null,
    data_matricula: data.data_matricula || null,
    observacoes: data.observacoes || null,
    grupo_id: data.grupo_id || null,
    is_slot: data.is_slot,
    habilitada_tvde: data.habilitada_tvde,
    estacao_id: data.estacao_id || null,
    extintor_numero: data.extintor_numero || null,
    extintor_validade: data.extintor_validade || null,
    tipo_id: data.tipo_id || null,
    proxima_manutencao_data: data.proxima_manutencao_data || null,
    proxima_manutencao_km: data.proxima_manutencao_km ? parseInt(data.proxima_manutencao_km) : null,
  };
}
