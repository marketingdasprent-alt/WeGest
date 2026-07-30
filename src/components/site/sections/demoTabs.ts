import { lazy, type LazyExoticComponent } from 'react';

export interface DemoTab {
  /** Slug estável: entra no URL (`?demo=contratos`), logo não muda sem custo. */
  key: string;
  /**
   * Rótulo por *resultado*, não por objeto. A sidebar da app chama-se "Renting"
   * porque quem já é utilizador sabe o que lá vai fazer; um visitante de
   * primeira vez precisa de "Gerir contratos". IA de app e IA de marketing
   * respondem a perguntas diferentes.
   */
  label: string;
  Panel: LazyExoticComponent<() => JSX.Element>;
}

// Lazy: nove painéis com gráficos e animações não têm de entrar no bundle
// inicial de uma página cuja primeira dobra é tipografia.
export const DEMO_TABS: DemoTab[] = [
  {
    key: 'operacao',
    label: 'Ver a operação',
    Panel: lazy(() =>
      import('../tour/panels/AnimatedDashboard').then((m) => ({ default: m.AnimatedDashboard }))
    ),
  },
  {
    key: 'contratos',
    label: 'Gerir contratos',
    Panel: lazy(() =>
      import('../tour/panels/AnimatedRenting').then((m) => ({ default: m.AnimatedRenting }))
    ),
  },
  {
    key: 'frota',
    label: 'Controlar a frota',
    Panel: lazy(() =>
      import('../tour/panels/AnimatedFrota').then((m) => ({ default: m.AnimatedFrota }))
    ),
  },
  {
    key: 'motoristas',
    label: 'Motoristas em regra',
    Panel: lazy(() =>
      import('../tour/panels/AnimatedMotoristas').then((m) => ({ default: m.AnimatedMotoristas }))
    ),
  },
  {
    key: 'entregas',
    label: 'Entregas e recolhas',
    Panel: lazy(() =>
      import('../tour/panels/AnimatedMovimentacoes').then((m) => ({
        default: m.AnimatedMovimentacoes,
      }))
    ),
  },
  {
    key: 'assistencia',
    label: 'Assistência e danos',
    Panel: lazy(() =>
      import('../tour/panels/AnimatedAssistencia').then((m) => ({ default: m.AnimatedAssistencia }))
    ),
  },
  {
    key: 'comercial',
    label: 'Pipeline comercial',
    Panel: lazy(() =>
      import('../tour/panels/AnimatedCRM').then((m) => ({ default: m.AnimatedCRM }))
    ),
  },
  {
    key: 'marketing',
    label: 'Campanhas',
    Panel: lazy(() =>
      import('../tour/panels/AnimatedMarketing').then((m) => ({ default: m.AnimatedMarketing }))
    ),
  },
];

/** Resolve o slug do URL para um índice válido. */
export const indiceDoSlug = (slug: string | null): number => {
  if (!slug) return 0;
  const index = DEMO_TABS.findIndex((tab) => tab.key === slug);
  return index === -1 ? 0 : index;
};
