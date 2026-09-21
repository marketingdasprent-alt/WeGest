/**
 * Forma do `config` jsonb de uma integração de faturação, e como se constrói a
 * partir dos campos do diálogo.
 *
 * Lógica pura, fora do componente, para se poder testar sem montar o diálogo —
 * o mesmo motivo por que `_shared/repsol/campos.ts` saiu de dentro da edge
 * function.
 */

/** Settings específicos do provider (guardados em plataformas_configuracao.config). */
export interface FaturacaoConfig {
  provider?: string;
  endpoint?: string;
  doctypes?: { FT?: string; FR?: string; NC?: string; RC?: string };
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

export interface FaturacaoFormFields {
  provider: string;
  endpoint: string;
  defaultProduct: string;
  defaultIdTax: string;
  doctypes: { FT: string; FR: string; NC: string; RC: string };
}

/**
 * Só entram os campos preenchidos: um `endpoint: ''` gravado apaga a
 * predefinição partilhável que o adapter ia buscar aos secrets do deployment.
 */
export function buildFaturacaoSettings(f: FaturacaoFormFields): FaturacaoConfig {
  const doctypes: FaturacaoConfig['doctypes'] = {};
  (['FT', 'FR', 'NC', 'RC'] as const).forEach((k) => {
    if (f.doctypes[k].trim()) doctypes[k] = f.doctypes[k].trim();
  });
  const s: FaturacaoConfig = { provider: f.provider };
  if (f.endpoint.trim()) s.endpoint = f.endpoint.trim();
  if (Object.keys(doctypes).length) s.doctypes = doctypes;
  if (f.defaultProduct.trim()) s.default_product = f.defaultProduct.trim();
  if (f.defaultIdTax.trim()) s.default_idtax = f.defaultIdTax.trim();
  return s;
}
