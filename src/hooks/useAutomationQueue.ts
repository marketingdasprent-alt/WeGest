// Barril de re-exportação — mantém `@/hooks/useAutomationQueue` como o
// import path público estável, enquanto a implementação vive dividida
// por domínio em `./automacao/*` (ficheiro único ultrapassava o limite
// de linhas do ESLint e misturava 3 preocupações distintas: fila/ops,
// estatísticas do dashboard, e configuração de regras).
export * from './automacao/useAutomationQueueOps';
export * from './automacao/useAutomacaoStats';
export * from './automacao/useAutomationRulesConfig';
