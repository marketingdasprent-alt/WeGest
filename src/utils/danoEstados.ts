// Estados de um dano, pela ordem do processo de sinistro. A coluna viatura_danos.estado é texto
// livre (sem CHECK), por isso esta lista é a única definição — não a repetir noutros ficheiros.
export interface DanoEstado {
  value: string;
  label: string;
  color: string;
}

export const DANO_ESTADOS: readonly DanoEstado[] = [
  {
    value: 'existente',
    label: 'Existente',
    color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  },
  {
    value: 'aguarda_peritagem',
    label: 'Aguarda Peritagem',
    color: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  },
  {
    value: 'condicional',
    label: 'Condicional',
    color: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  },
  {
    value: 'definitivo',
    label: 'Definitivo',
    color: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
  },
  {
    value: 'ordem_reparacao',
    label: 'Ordem de Reparação',
    color: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
  },
  {
    value: 'em_reparacao',
    label: 'Em Reparação',
    color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  },
  {
    value: 'reparado',
    label: 'Reparado',
    color: 'bg-green-500/10 text-green-500 border-green-500/20',
  },
  {
    value: 'perda_total',
    label: 'Perda Total',
    color: 'bg-destructive/10 text-destructive border-destructive/20',
  },
  {
    value: 'irreparavel',
    label: 'Irreparável',
    color: 'bg-destructive/10 text-destructive border-destructive/20',
  },
  {
    value: 'seguradora_declinou',
    label: 'Seguradora Declinou',
    color: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',
  },
];

// 'pendente' é o default da coluna e ainda vem de alguns sítios (ex.: check-in da Assistência);
// não se oferece na lista, mas tem de se mostrar com o próprio nome.
const PENDENTE: DanoEstado = {
  value: 'pendente',
  label: 'Pendente',
  color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
};

export function getDanoEstado(value: string | null | undefined): DanoEstado {
  if (value === PENDENTE.value) return PENDENTE;
  const conhecido = DANO_ESTADOS.find((e) => e.value === value);
  if (conhecido) return conhecido;
  // Valor desconhecido mostra-se tal como está, em vez de se fingir "Existente".
  return { value: value ?? '', label: value || '—', color: PENDENTE.color };
}

export function getDanoEstadoLabel(value: string | null | undefined): string {
  return getDanoEstado(value).label;
}
