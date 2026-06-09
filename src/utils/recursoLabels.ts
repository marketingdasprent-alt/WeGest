export const getRecursoLabel = (nome: string): string => {
  const labels: Record<string, string> = {
    // Renting
    renting_clientes: 'Gestão de clientes de renting',
    renting_contratos: 'Gestão de contratos de renting',
    renting_reservas: 'Gestão de reservas de renting',
    renting_movimentacoes: 'Entradas, saídas e trocas de viatura',

    // CRM
    crm_ver: 'Ver leads e pipeline',
    crm_exportar: 'Exportar dados de leads',
    crm_campanhas: 'Gerir campanhas e tags',
    motoristas_crm: 'Gestão completa do CRM',

    // Tickets
    tickets_ver: 'Ver tickets',
    tickets_criar: 'Criar novos tickets',
    tickets_gerir: 'Gerir todos os tickets',

    // Motoristas
    motoristas_ver: 'Ver lista de motoristas',
    motoristas_criar: 'Criar novos motoristas',
    motoristas_editar: 'Editar dados de motoristas',
    motoristas_eliminar: 'Eliminar motoristas',
    motoristas_candidaturas: 'Gerir candidaturas',
    motoristas_gestao: 'Gestão completa de motoristas',
    motoristas_contactos: 'Gestão de contactos',

    // Viaturas
    viaturas_ver: 'Ver lista de viaturas',
    viaturas_criar: 'Criar novas viaturas',
    viaturas_editar: 'Editar dados de viaturas',
    viaturas_eliminar: 'Eliminar viaturas',

    // Contratos
    contratos_ver: 'Ver contratos',
    contratos_criar: 'Criar novos contratos',
    contratos_reimprimir: 'Reimprimir contratos',
    motoristas_contratos: 'Gestão completa de contratos',
    motoristas_editar_data_contrato: 'Editar data do 1.º contrato',

    // Administrativo
    financeiro_recibos: 'Gestão de recibos verdes',
    recibos_verdes_adicionar: 'Adicionar recibos verdes manualmente',
    administrativo_resumos: 'Ver resumos e contas dos motoristas',
    administrativo_importar: 'Importar dados das plataformas',
    administrativo_plataformas: 'Ver dados das plataformas',
    administrativo_cartoes: 'Gerir cartões de frota e OBE',

    // Assistência
    assistencia_ver: 'Ver tickets de assistência',
    assistencia_criar: 'Criar tickets de assistência',
    assistencia_categorias: 'Gerir categorias de assistência',
    assistencia_tickets: 'Gestão completa de tickets',

    // Calendário
    calendario_ver: 'Ver eventos do calendário',
    calendario_ver_gestores: 'Ver gestores nos relatórios de eventos',
    calendario_criar: 'Criar novos eventos',
    calendario_editar: 'Editar eventos existentes',
    calendario_editar_todos: 'Editar eventos de todos os gestores',
    calendario_eliminar: 'Eliminar eventos',

    // Administração
    admin_utilizadores: 'Gerir utilizadores',
    admin_grupos: 'Gerir grupos e permissões',
    admin_documentos: 'Gerir templates de documentos',
    admin_formularios: 'Gerir formulários',
    admin_integracoes: 'Gerir integrações',
    admin_configuracoes: 'Configurações do sistema',
  };
  return labels[nome] || nome;
};
