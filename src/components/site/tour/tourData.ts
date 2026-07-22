// Barrel: mantém todos os imports existentes (`from '../tourData'` /
// `from './tourData'`) a funcionar sem mudanças — os dados em si vivem
// divididos por módulo em ./data (ficheiro único passou dos 500 linhas
// do lint max-lines).
export * from './data/modules';
export * from './data/dashboard';
export * from './data/renting';
export * from './data/frota';
export * from './data/motoristas';
export * from './data/assistencia';
export * from './data/movimentacoes';
export * from './data/crm';
export * from './data/marketing';
export * from './data/maisModulos';
