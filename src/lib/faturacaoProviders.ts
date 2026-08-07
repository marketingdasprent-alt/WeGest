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
  /** Rótulo do campo "Chave da API" quando o provider não usa uma chave simples. */
  apiKeyLabel?: string;
  /** Documentos fiscais que este provider ainda NÃO suporta emitir — mostrado
   *  como aviso na UI, para não se tentar um tipo que vai falhar sempre. */
  tiposNaoSuportados?: Array<'FT' | 'FR' | 'NC' | 'RC'>;
  /**
   * A "chave" deste provider não é colada pelo utilizador — é GERADA pelo
   * WeGest (botão) e copiada para outro sítio (um agente local, não este
   * software). Muda a UI: em vez de um campo de texto para colar, mostra um
   * botão "Gerar" e o valor só uma vez, a seguir mascarado. Usado pelo
   * Primavera: o que se gera aqui não é a password do Primavera — é só a
   * chave que autentica o agente local a falar com o WeGest.
   */
  chaveGeradaPeloWeGest?: boolean;
  /** Texto explicativo mostrado por baixo da chave gerada — ex.: para onde
   *  ela vai e porque o WeGest não sabe as credenciais reais do software. */
  chaveGeradaAjuda?: string;
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
  primavera: {
    slug: 'primavera',
    label: 'Primavera (AS Connect)',
    apiKeyLabel: 'Chave do agente',
    chaveGeradaPeloWeGest: true,
    chaveGeradaAjuda:
      'O Primavera fica atrás de uma VPN — o WeGest não consegue ligar-lhe directamente. ' +
      'Um pequeno "agente" corre dentro da vossa rede e faz a ponte; esta chave autentica-o ' +
      'a falar com o WeGest, nunca dá acesso a nada do Primavera por si só. As credenciais ' +
      'reais do AS Connect (username, password, enterprise) ficam só na configuração desse ' +
      'agente — nunca chegam a esta base de dados. Ver agent/primavera-agent/README.md.',
    // Só a emissão de Factura (FT) está confirmada contra a documentação
    // recebida do AS Connect (2026-07-30) — ver providers/primavera.ts na
    // edge function faturacao-emitir. FR/NC/RC e PDF/anulação ficam por
    // confirmar antes de activar.
    tiposNaoSuportados: ['FR', 'NC', 'RC'],
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
