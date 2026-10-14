// Escolha da integração de faturação ao emitir. TS puro, sem APIs de Deno:
// usado pela edge function faturacao-emitir e testado pelo Vitest.

export type TipoDoc = 'FT' | 'FR' | 'NC' | 'RC';
export type ProviderSlug = 'keyinvoice' | 'primavera';

export const PROVIDERS_CONHECIDOS: Array<{ slug: ProviderSlug; label: string }> = [
  { slug: 'keyinvoice', label: 'KeyInvoice' },
  { slug: 'primavera', label: 'Primavera' },
];

// O AS Connect só tem documentado o documento de venda (FT); ver agent/primavera-agent.
export const TIPOS_NAO_SUPORTADOS: Record<ProviderSlug, TipoDoc[]> = {
  keyinvoice: [],
  primavera: ['FR', 'NC', 'RC'],
};

const PLURAL: Record<TipoDoc, string> = {
  FT: 'Faturas',
  FR: 'Faturas-Recibo',
  NC: 'Notas de Crédito',
  RC: 'Recibos',
};

export interface IntegracaoDaEmpresa {
  id: string;
  provider: string;
  ativo: boolean;
}

export interface OpcaoFornecedor {
  integracao_id: string | null;
  provider: ProviderSlug;
  label: string;
  disponivel: boolean;
  motivo?: string;
  ultima_usada: boolean;
}

export function motivoTipoNaoSuportado(provider: string, tipo: TipoDoc): string | null {
  const nao = TIPOS_NAO_SUPORTADOS[provider as ProviderSlug] ?? [];
  if (!nao.includes(tipo)) return null;
  const label = PROVIDERS_CONHECIDOS.find((p) => p.slug === provider)?.label ?? provider;
  return `O ${label} ainda não emite ${PLURAL[tipo]}`;
}

export function montarOpcoes(
  integracoes: IntegracaoDaEmpresa[],
  tipo: TipoDoc,
  ultimaIntegracaoId: string | null
): OpcaoFornecedor[] {
  return PROVIDERS_CONHECIDOS.map(({ slug, label }) => {
    const doFornecedor = integracoes.filter((i) => i.provider === slug);
    const linha = doFornecedor.find((i) => i.ativo) ?? doFornecedor[0];
    if (!linha) {
      return {
        integracao_id: null,
        provider: slug,
        label,
        disponivel: false,
        motivo: 'Não configurado para esta empresa',
        ultima_usada: false,
      };
    }
    const base = {
      integracao_id: linha.id,
      provider: slug,
      label,
      ultima_usada: linha.id === ultimaIntegracaoId,
    };
    if (!linha.ativo) return { ...base, disponivel: false, motivo: 'Integração inativa' };
    const motivo = motivoTipoNaoSuportado(slug, tipo);
    return motivo ? { ...base, disponivel: false, motivo } : { ...base, disponivel: true };
  });
}

type ResultadoEscolha =
  | { ok: true; integracaoId: string }
  | {
      ok: false;
      codigo: 'sem_integracao' | 'escolha_obrigatoria' | 'invalida' | 'nao_suporta';
      erro: string;
    };

export function escolherIntegracao(
  ativas: IntegracaoDaEmpresa[],
  tipo: TipoDoc,
  integracaoId?: string | null
): ResultadoEscolha {
  if (integracaoId) {
    // Só ids da lista da empresa: a lista já vem filtrada por org e empresa no servidor.
    const escolhida = ativas.find((i) => i.id === integracaoId && i.ativo);
    if (!escolhida) {
      return {
        ok: false,
        codigo: 'invalida',
        erro: 'A integração escolhida não está ativa para esta empresa. Volte a abrir o ecrã e escolha de novo.',
      };
    }
    const motivo = motivoTipoNaoSuportado(escolhida.provider, tipo);
    return motivo
      ? { ok: false, codigo: 'nao_suporta', erro: `${motivo}.` }
      : { ok: true, integracaoId: escolhida.id };
  }

  const ativasDeFacto = ativas.filter((i) => i.ativo);
  if (!ativasDeFacto.length) {
    return {
      ok: false,
      codigo: 'sem_integracao',
      erro: 'Esta empresa não tem software de faturação ativo.',
    };
  }
  const suportam = ativasDeFacto.filter((i) => !motivoTipoNaoSuportado(i.provider, tipo));
  if (suportam.length === 1) return { ok: true, integracaoId: suportam[0].id };
  if (!suportam.length) {
    return {
      ok: false,
      codigo: 'nao_suporta',
      erro: `${motivoTipoNaoSuportado(ativasDeFacto[0].provider, tipo)}.`,
    };
  }
  return {
    ok: false,
    codigo: 'escolha_obrigatoria',
    erro: 'Esta empresa tem mais do que um fornecedor de faturação — escolha por qual emitir.',
  };
}

export function preSelecao(opcoes: OpcaoFornecedor[]): string | null {
  const disponiveis = opcoes.filter((o) => o.disponivel && o.integracao_id);
  const ultima = disponiveis.find((o) => o.ultima_usada);
  if (ultima) return ultima.integracao_id;
  return disponiveis.length === 1 ? disponiveis[0].integracao_id : null;
}
