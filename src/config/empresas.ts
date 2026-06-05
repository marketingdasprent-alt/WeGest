export interface EmpresaConfig {
  id: string;
  /** Org dona desta empresa — usado para escolher o template correcto em ambientes multi-tenant. */
  orgId?: string | null;
  nome: string;
  nomeCompleto: string;
  nif: string;
  sede: string;
  licencaTVDE: string;
  licencaValidade: string;
  representante: string;
  cargoRepresentante: string;
  papelTimbrado: string;
}

export const EMPRESAS: Record<string, EmpresaConfig> = {
  decada_ousada: {
    id: 'decada_ousada',
    nome: 'WeGest',
    nomeCompleto: 'WeGest, Lda.',
    nif: '515127850',
    sede: 'Rua do Mourato Nº 70 A correio 70, 9600-224 Ribeira Grande',
    licencaTVDE: '(informação a confirmar)',
    licencaValidade: '(informação a confirmar)',
    representante: 'Beatriz Veloso',
    cargoRepresentante: 'gerente com poderes para o ato',
    papelTimbrado: '/images/papel-timbrado-rota-liquida.png',
  },
  distancia_arrojada: {
    id: 'distancia_arrojada',
    nome: 'Distância Arrojada',
    nomeCompleto: 'Distância Arrojada, Unipessoal, Lda.',
    nif: '516600800',
    sede: 'Largo Ribeiro do Amaral, Nº3, Edifício Interbeiras, 3400-070 Oliveira do Hospital',
    licencaTVDE: '87314/2021',
    licencaValidade: '26/12/2028',
    representante: 'Beatriz Veloso',
    cargoRepresentante: 'gerente com poderes para o ato',
    papelTimbrado: '/images/papel-timbrado-distancia-arrojada.png',
  },
};

export const getEmpresaById = (id: string): EmpresaConfig | undefined => {
  return EMPRESAS[id];
};

export const getEmpresasList = (): EmpresaConfig[] => {
  return Object.values(EMPRESAS);
};

/** Rodapé "Nome · NIF · Sede" usado nos PDFs gerados (sem papel timbrado). */
export const empresaFooterText = (e: EmpresaConfig): string =>
  [e.nomeCompleto, e.nif ? `NIF ${e.nif}` : null, e.sede].filter(Boolean).join('   ·   ');

/** Dados da empresa no formato esperado por `documentData.empresaData`
 *  (placeholders {{empresa_*}}). */
export const empresaDocData = (e: EmpresaConfig) => ({
  nomeCompleto: e.nomeCompleto,
  nif: e.nif,
  sede: e.sede,
  licencaTVDE: e.licencaTVDE,
  licencaValidade: e.licencaValidade,
  representante: e.representante,
  cargoRepresentante: e.cargoRepresentante,
});
