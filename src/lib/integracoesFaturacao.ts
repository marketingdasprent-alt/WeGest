// Conflito ao ativar uma integração de faturação: só outra do MESMO fornecedor na mesma
// empresa (índice uq_faturacao_ativa_por_emissor_fornecedor). KeyInvoice e Primavera coexistem.
import { configDaLinha } from '../../supabase/functions/_shared/faturacao/integracao';

interface LinhaIntegracaoUi {
  id: string;
  plataforma: string;
  ativo: boolean;
  emissor_id: string | null;
  config: unknown;
}

export function outraAtivaDoMesmoFornecedor(
  integracoes: LinhaIntegracaoUi[],
  alvo: { id?: string | null; emissor_id?: string | null; provider: string }
): boolean {
  return integracoes.some(
    (i) =>
      i.plataforma === 'faturacao' &&
      i.ativo &&
      i.id !== alvo.id &&
      !!i.emissor_id &&
      i.emissor_id === alvo.emissor_id &&
      configDaLinha({
        id: i.id,
        client_secret: null,
        config: (i.config ?? null) as Record<string, unknown> | null,
      }).provider === alvo.provider.toLowerCase()
  );
}

// Espelha o índice (lower(coalesce(config->>'provider','keyinvoice'))): sem provider é keyinvoice.
export function filtroMesmoFornecedor(
  provider: string
): { tipo: 'or'; expressao: string } | { tipo: 'ilike'; valor: string } {
  const p = provider.toLowerCase();
  if (p === 'keyinvoice') {
    return {
      tipo: 'or',
      expressao: 'config->>provider.is.null,config->>provider.ilike.keyinvoice',
    };
  }
  return { tipo: 'ilike', valor: p };
}
