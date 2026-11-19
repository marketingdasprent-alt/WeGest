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

/** Onde o serviço do Primavera emite: teste não tem valor fiscal, produção tem. */
export type AmbienteServico = 'teste' | 'producao';
export const AMBIENTES_SERVICO: readonly { valor: AmbienteServico; label: string }[] = [
  { valor: 'teste', label: 'Teste' },
  { valor: 'producao', label: 'Produção' },
];

/** Método dos recibos e das faturas-recibo emitidos pelo serviço do Primavera. */
export type MetodoPagamentoServico = 'numerario' | 'multibanco' | 'transferencia' | 'mbway';
export const METODO_PAGAMENTO_SERVICO_OMISSAO: MetodoPagamentoServico = 'transferencia';
export const METODOS_PAGAMENTO_SERVICO: readonly {
  valor: MetodoPagamentoServico;
  label: string;
}[] = [
  { valor: 'numerario', label: 'Numerário' },
  { valor: 'multibanco', label: 'Multibanco' },
  { valor: 'transferencia', label: 'Transferência bancária' },
  { valor: 'mbway', label: 'MB WAY' },
];

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
  /** A conta lê o preço das linhas como IVA incluído (Dasp Rent Sul): o adapter
   *  manda-o já com IVA. Só se grava quando ligado. */
  precos_com_iva?: boolean;
  /** Primavera: endereço https do serviço. Sem ele o servidor recusa emitir (as
   *  integrações do agente antigo da AS Connect não têm este campo). */
  servico_url?: string;
  /** Primavera: obrigatório. Nunca se preenche por omissão — sem
   *  ele o servidor recusa tudo. */
  ambiente?: AmbienteServico;
  /** Primavera: código curto da empresa no serviço, em minúsculas (ex.: dasprent).
   *  É o CAMINHO do serviço: o servidor chama https://<endereço>/<empresa>/faturas. */
  empresa?: string;
  /** Primavera: método dos recibos e das faturas-recibo. */
  metodo_pagamento?: MetodoPagamentoServico;
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
  precosComIva?: boolean;
  /** Primavera pelo serviço. Só se gravam com `servicoUrl` preenchido. */
  servicoUrl?: string;
  /** '' = ainda por escolher (nunca há valor por omissão). */
  ambiente?: AmbienteServico | '';
  empresa?: string;
  metodoPagamento?: MetodoPagamentoServico;
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
  if (f.precosComIva) s.precos_com_iva = true;

  // Primavera pelo serviço. Sem endereço nada disto se grava.
  const servicoUrl = f.servicoUrl?.trim();
  if (servicoUrl) {
    s.servico_url = servicoUrl;
    if (f.ambiente) s.ambiente = f.ambiente;
    const empresa = normalizarEmpresaServico(f.empresa ?? '');
    if (empresa) s.empresa = empresa;
    if (f.metodoPagamento) s.metodo_pagamento = f.metodoPagamento;
  }
  return s;
}

/** Integração Primavera já gravada sem `servico_url`: era do agente antigo da AS
 *  Connect, que já não existe. Abre no formulário do serviço, vazio, com aviso. */
export function integracaoPrimaveraAntiga(row: { config: FaturacaoConfig | null } | null): boolean {
  return !!row && !row.config?.servico_url?.trim();
}

/** Empresas do serviço hoje (dica no ecrã; o servidor aceita qualquer código válido). */
export const EMPRESAS_SERVICO_DICA =
  'Hoje: dasprent (Dasprent Rent a Car), decada (Década Ousada), distancia (Distância Arrojada). Dasprent Sul (dasprentsul) e Urbango (urbango) virão depois.';

/** Código da empresa como o servidor o lê: sem espaços nas pontas e em minúsculas. */
export function normalizarEmpresaServico(empresa: string): string {
  return empresa.trim().toLowerCase();
}

/** Mesma regra do servidor: letras minúsculas, números e hífen, até 40. */
export function empresaServicoValida(empresa: string): boolean {
  return /^[a-z0-9-]{1,40}$/.test(normalizarEmpresaServico(empresa));
}

/** `https://…`, ou `http://localhost` / `127.0.0.1` para desenvolvimento. */
export function enderecoServicoValido(url: string): boolean {
  const u = url.trim();
  return /^https:\/\/[^\s/]+/.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(u);
}

export interface ErrosServicoPrimavera {
  servicoUrl?: string;
  ambiente?: string;
  empresa?: string;
  chave?: string;
}

/** Valida o que o modo serviço exige antes de testar e de guardar. Vazio = válido. */
export function validarServicoPrimavera(f: {
  servicoUrl: string;
  ambiente: AmbienteServico | '';
  empresa: string;
  apiKey: string;
}): ErrosServicoPrimavera {
  const erros: ErrosServicoPrimavera = {};
  if (!f.servicoUrl.trim()) {
    erros.servicoUrl = 'Indique o endereço do serviço do Primavera.';
  } else if (!enderecoServicoValido(f.servicoUrl)) {
    erros.servicoUrl = 'O endereço do serviço tem de começar por https://.';
  }
  if (!f.ambiente) {
    erros.ambiente = 'Escolha o ambiente: Teste ou Produção.';
  }
  if (!normalizarEmpresaServico(f.empresa)) {
    erros.empresa = 'Indique a empresa no serviço (ex.: dasprent).';
  } else if (!empresaServicoValida(f.empresa)) {
    erros.empresa = 'Use só letras minúsculas, números e hífen (ex.: dasprent).';
  }
  if (!f.apiKey.trim()) {
    erros.chave = 'Introduza a chave do serviço.';
  }
  return erros;
}

/** Primeira mensagem de erro, pela ordem em que os campos aparecem no ecrã. */
export function primeiroErroServico(erros: ErrosServicoPrimavera): string | null {
  return erros.servicoUrl ?? erros.ambiente ?? erros.empresa ?? erros.chave ?? null;
}
