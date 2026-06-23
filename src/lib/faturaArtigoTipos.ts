// ============================================================
// Tipos de artigo de uma fatura adicional ("Nova Fatura")
// ============================================================
// Lista fixa apresentada no campo "Tipo" do editor de linhas livre.
// Só o tipo é fechado — descrição, valor e unidades são livres.

export const FATURA_ARTIGO_TIPOS = [
  'Cobertura',
  'Combustível',
  'Contrato',
  'Dano',
  'Depósito / Caução',
  'Extra',
  'Pacote Coberturas',
  'Pacote Extras',
  'Pacote Kms',
  'Portagens',
  'Taxa',
] as const;

export type FaturaArtigoTipo = (typeof FATURA_ARTIGO_TIPOS)[number];
