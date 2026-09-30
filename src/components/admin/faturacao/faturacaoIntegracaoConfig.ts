/**
 * Forma do `config` jsonb de uma integração de faturação, e como se constrói a
 * partir dos campos do diálogo.
 *
 * Lógica pura, fora do componente, para se poder testar sem montar o diálogo —
 * o mesmo motivo por que `_shared/repsol/campos.ts` saiu de dentro da edge
 * function.
 */

export type TipoDocumentoFiscal = 'FT' | 'FR' | 'NC' | 'RC';
export const TIPOS_DOCUMENTO_FISCAL: readonly TipoDocumentoFiscal[] = ['FT', 'FR', 'NC', 'RC'];

type PorTipo = Partial<Record<TipoDocumentoFiscal, string>>;

/** Settings específicos do provider (guardados em plataformas_configuracao.config). */
export interface FaturacaoConfig {
  provider?: string;
  endpoint?: string;
  doctypes?: PorTipo;
  /** Série (código interno do provider) por tipo. Sem ela o KeyInvoice escolhe a
   *  série "por omissão" da conta; numa conta sem esse padrão recusa a emissão
   *  com "Série de documento inválida" (Dasp Rent Sul, 29-09-2026). */
  docseries?: PorTipo;
  default_product?: string;
  default_idtax?: string;
}

/** Linha de config de faturação (plataforma='faturacao'). */
export interface FaturacaoConfigRow {
  id: string;
  nome: string | null;
  client_secret: string | null;
  config: FaturacaoConfig | null;
  ativo: boolean | null;
  /** Empresa emissora em nome da qual esta integração emite. */
  emissor_id: string | null;
}

export type CamposPorTipo = Record<TipoDocumentoFiscal, string>;

export interface FaturacaoFormFields {
  provider: string;
  endpoint: string;
  defaultProduct: string;
  defaultIdTax: string;
  doctypes: CamposPorTipo;
  docseries: CamposPorTipo;
}

export const CAMPOS_POR_TIPO_VAZIOS: CamposPorTipo = { FT: '', FR: '', NC: '', RC: '' };

/** Campos do formulário a partir do que está gravado (ausente → vazio). */
export function camposPorTipo(valores: PorTipo | undefined): CamposPorTipo {
  return {
    FT: valores?.FT || '',
    FR: valores?.FR || '',
    NC: valores?.NC || '',
    RC: valores?.RC || '',
  };
}

function soPreenchidos(campos: CamposPorTipo): PorTipo | undefined {
  const out: PorTipo = {};
  TIPOS_DOCUMENTO_FISCAL.forEach((k) => {
    if (campos[k].trim()) out[k] = campos[k].trim();
  });
  return Object.keys(out).length ? out : undefined;
}

/**
 * Só entram os campos preenchidos: um `endpoint: ''` gravado apaga a
 * predefinição partilhável que o adapter ia buscar aos secrets do deployment.
 */
export function buildFaturacaoSettings(f: FaturacaoFormFields): FaturacaoConfig {
  const s: FaturacaoConfig = { provider: f.provider };
  if (f.endpoint.trim()) s.endpoint = f.endpoint.trim();
  const doctypes = soPreenchidos(f.doctypes);
  if (doctypes) s.doctypes = doctypes;
  const docseries = soPreenchidos(f.docseries);
  if (docseries) s.docseries = docseries;
  if (f.defaultProduct.trim()) s.default_product = f.defaultProduct.trim();
  if (f.defaultIdTax.trim()) s.default_idtax = f.defaultIdTax.trim();
  return s;
}
