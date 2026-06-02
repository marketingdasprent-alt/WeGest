export const RECURSOS = {
  // CRM
  CRM_VER: 'crm_ver',
  CRM_EXPORTAR: 'crm_exportar',
  CRM_CAMPANHAS: 'crm_campanhas',

  // Tickets
  TICKETS_VER: 'tickets_ver',
  TICKETS_CRIAR: 'tickets_criar',
  TICKETS_GERIR: 'tickets_gerir',

  // Motoristas
  MOTORISTAS_VER: 'motoristas_ver',
  MOTORISTAS_CRIAR: 'motoristas_criar',
  MOTORISTAS_EDITAR: 'motoristas_editar',
  MOTORISTAS_ELIMINAR: 'motoristas_eliminar',
  MOTORISTAS_CANDIDATURAS: 'motoristas_candidaturas',
  MOTORISTAS_GESTAO: 'motoristas_gestao', // Legacy - gestão completa
  MOTORISTAS_CONTACTOS: 'motoristas_contactos',
  MOTORISTAS_CRM: 'motoristas_crm',
  MOTORISTAS_CONTRATOS: 'motoristas_contratos',
  MOTORISTAS_EDITAR_DATA_CONTRATO: 'motoristas_editar_data_contrato',
  MOTORISTA_PAINEL: 'motorista_painel', // Painel exclusivo do motorista

  // Viaturas
  VIATURAS_VER: 'viaturas_ver',
  VIATURAS_CRIAR: 'viaturas_criar',
  VIATURAS_EDITAR: 'viaturas_editar',
  VIATURAS_ELIMINAR: 'viaturas_eliminar',
  VIATURAS_FINANCEIRO: 'viaturas_financeiro',
  VIATURAS_MARCAS_MODELOS: 'viaturas_marcas_modelos',
  // Contratos
  CONTRATOS_VER: 'contratos_ver',
  CONTRATOS_CRIAR: 'contratos_criar',
  CONTRATOS_REIMPRIMIR: 'contratos_reimprimir',

  // Assistência
  ASSISTENCIA_VER: 'assistencia_ver',
  ASSISTENCIA_CRIAR: 'assistencia_criar',
  ASSISTENCIA_CATEGORIAS: 'assistencia_categorias',
  ASSISTENCIA_TICKETS: 'assistencia_tickets', // Legacy - gestão completa

  // Administração
  ADMIN_UTILIZADORES: 'admin_utilizadores',
  ADMIN_GRUPOS: 'admin_grupos',
  ADMIN_DOCUMENTOS: 'admin_documentos',
  ADMIN_FORMULARIOS: 'admin_formularios',
  ADMIN_INTEGRACOES: 'admin_integracoes',
  ADMIN_CONFIGURACOES: 'admin_configuracoes',

  // Financeiro
  FINANCEIRO_RECIBOS: 'financeiro_recibos',
  RECIBOS_VERDES_ADICIONAR: 'recibos_verdes_adicionar',

  // Marketing
  MARKETING_VER: 'marketing_ver',

  // Calendário
  CALENDARIO_VER: 'calendario_ver',
  CALENDARIO_CRIAR: 'calendario_criar',
  CALENDARIO_EDITAR: 'calendario_editar',
  CALENDARIO_EDITAR_TODOS: 'calendario_editar_todos',
  CALENDARIO_ELIMINAR: 'calendario_eliminar',
  CALENDARIO_RECOLHAS: 'calendario_recolhas',
  CALENDARIO_VER_GESTORES: 'calendario_ver_gestores',

  // Renting
  RENTING_RESERVAS: 'renting_reservas',
  RENTING_CONTRATOS: 'renting_contratos',
  RENTING_MOVIMENTACOES: 'renting_movimentacoes',
  RENTING_CLIENTES: 'renting_clientes',
} as const;

export type RecursoKey = (typeof RECURSOS)[keyof typeof RECURSOS];
