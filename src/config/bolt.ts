// `liquido_a_pagar` é a fonte financeira única: inclui campanhas e reembolsos
// apenas em resumos originados na API. Nunca agregar `bolt_viagens`, que contém
// tentativas de despacho repetidas; o `bolt-sync-semana` produz este resumo.

export const BOLT_GANHOS = {
  tabela: 'bolt_resumos_semanais',
  campo: 'liquido_a_pagar',
} as const;
