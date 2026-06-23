// ============================================================
// Módulos comerciais — activam funcionalidades por organização
// ============================================================
// Cada organização tem um sub-conjunto destes módulos activos.
// UI/rotas/menus consultam `useModules()` para decidir o que mostrar.
// RBAC continua por cima (módulo activo != utilizador tem permissão).

export const MODULOS = ['aluguer', 'tvde', 'slot', 'assistencia', 'frota'] as const;

export type Modulo = (typeof MODULOS)[number];

export const MODULO_LABELS: Record<Modulo, string> = {
  aluguer: 'Aluguer',
  tvde: 'TVDE',
  slot: 'Slot',
  assistencia: 'Assistência',
  frota: 'Frota',
};

export const MODULO_DESCRICOES: Record<Modulo, string> = {
  aluguer: 'Rent-a-car (curto prazo) + renting (longo prazo)',
  tvde: 'Motoristas TVDE, partilha de receita, turnos',
  slot: 'Motorista usa carro próprio e paga semanalmente pelo slot',
  assistencia: 'Tickets de manutenção e reparações',
  frota: 'Gestão base de viaturas (transversal)',
};

export type OrganizacaoModulo = {
  id: string;
  org_id: string;
  modulo: Modulo;
  ativo: boolean;
  ativado_em: string;
  desativado_em: string | null;
  created_at: string;
  updated_at: string;
};
