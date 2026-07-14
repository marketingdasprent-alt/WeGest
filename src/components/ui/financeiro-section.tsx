// ============================================================
// FinanceiroSection — componente partilhado que unifica as views
// financeiras (Faturação global + Financeiro do motorista).
//
// Dispatch: entidade='global' → FaturacaoContent (cobranças, facturas, recibos)
//           entidade='motorista' id={x} → MotoristaFinanceiroContent (saldos, custos)
//
// NÃO unifica queries — cada entidade mantém as suas (conta_movimentos vs
// motorista_financeiro). A unificação é apenas ao nível da UI/API.
// ============================================================

import { Banknote, Wallet, AlertCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
// Import circular seguro: FaturacaoContent é function declaration (hoisted em ES modules).
// O binding está disponível durante a fase de instantiation, antes da avaliação.
import { FaturacaoContent } from '@/components/administrativo/FaturacaoTab';
import { MotoristaFinanceiroContent } from '@/components/motoristas/tabs/MotoristaTabFinanceiro';
import type { FinanceiroEntry, ResumoFinanceiro } from '@/types/financeiro';

// Re-export tipos partilhados para conveniência dos consumidores.
export type { FinanceiroEntry, ResumoFinanceiro };

/** Tipo de entidade financeira suportada pelo componente. */
export type FinanceiroEntidade = 'global' | 'motorista';

/** Props do componente partilhado. */
export interface FinanceiroSectionProps {
  /** Qual view financeira renderizar. */
  entidade: FinanceiroEntidade;
  /** ID do motorista — obrigatório quando entidade='motorista'. */
  id?: string;
}

/** Configuração por entidade (título, descrição, ícone). */
export interface FinanceiroEntityConfig {
  title: string;
  description: string;
  icon: LucideIcon;
}

/** Configurações das entidades financeiras — usadas para header, testes, etc. */
export const FINANCEIRO_ENTITY_CONFIGS: Record<FinanceiroEntidade, FinanceiroEntityConfig> = {
  global: {
    title: 'Faturação',
    description: 'Movimentos de conta-corrente e faturação dos contratos',
    icon: Banknote,
  },
  motorista: {
    title: 'Financeiro',
    description: 'Saldos, custos e movimentos do motorista',
    icon: Wallet,
  },
};

/**
 * Componente partilhado que unifica as views financeiras.
 *
 * @example
 * // Faturação global (cobranças, facturas, recibos)
 * <FinanceiroSection entidade="global" />
 *
 * // Financeiro de um motorista (saldos, custos)
 * <FinanceiroSection entidade="motorista" id={motoristaId} />
 */
export function FinanceiroSection({ entidade, id }: FinanceiroSectionProps) {
  // Validação: entidade='motorista' requer id
  if (entidade === 'motorista' && !id) {
    return (
      <div
        className="flex items-center justify-center gap-2 py-12 text-muted-foreground"
        role="alert"
      >
        <AlertCircle className="h-5 w-5" />
        <span>ID do motorista não fornecido.</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {entidade === 'global' && <FaturacaoContent />}
      {entidade === 'motorista' && id && <MotoristaFinanceiroContent motoristaId={id} />}
    </div>
  );
}
