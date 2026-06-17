// ============================================================
// Registo de providers de faturação fiscal
// ============================================================
// Fonte única do "nome do software de faturação" mostrado na app. Trocar de
// software é só mudar a config da org (`org_definicoes.faturacao_provider` =
// slug). Para suportar outro software, acrescenta-se aqui uma entrada e um
// adapter na edge function `faturacao-emitir` (providers/<slug>.ts).

export interface FaturacaoProviderMeta {
  /** Slug interno (igual ao usado na BD e no adapter da edge function). */
  slug: string;
  /** Nome apresentável ao utilizador. */
  label: string;
  /**
   * Como personalizar o aspeto do PDF (logo, cores, layout) — passos no painel
   * do próprio software. O PDF fiscal é desenhado pelo provider, por isso a marca
   * configura-se lá, não no WeGest.
   */
  brandingHelp?: string[];
}

export const FATURACAO_PROVIDERS: Record<string, FaturacaoProviderMeta> = {
  keyinvoice: {
    slug: 'keyinvoice',
    label: 'KeyInvoice',
    brandingHelp: [
      'Logótipo: Configurações → Dados Gerais → "Imagem do Logótipo" (carregar em JPG).',
      'Layout e cores: Tabelas → Documentos → Configurador de impressão — escolher o modelo e os tipos de documento; ativar/ocultar campos (cabeçalho, linha, rodapé) e definir a cor dos títulos.',
      'Multi-empresa: cada loja/empresa pode ter o seu próprio logótipo e dados.',
    ],
  },
  // Exemplos futuros (basta criar o adapter na edge function):
  // moloni: { slug: 'moloni', label: 'Moloni' },
  // invoicexpress: { slug: 'invoicexpress', label: 'InvoiceXpress' },
  // vendus: { slug: 'vendus', label: 'Vendus' },
};

/** Opções para dropdowns (ordem estável). */
export const FATURACAO_PROVIDER_OPTIONS = Object.values(FATURACAO_PROVIDERS);

/** Texto neutro quando não há software de faturação configurado. */
export const FATURACAO_LABEL_FALLBACK = 'software de faturação';

/**
 * Nome apresentável do software de faturação a partir do slug configurado.
 * Cai num texto neutro se o slug for nulo/desconhecido — para o de-brand
 * funcionar mesmo sem nada configurado.
 */
export function faturacaoProviderLabel(slug: string | null | undefined): string {
  if (!slug) return FATURACAO_LABEL_FALLBACK;
  return FATURACAO_PROVIDERS[slug]?.label ?? slug;
}
