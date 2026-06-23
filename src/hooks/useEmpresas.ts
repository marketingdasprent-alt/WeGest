import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getEmpresasList, type EmpresaConfig } from '@/config/empresas';

// Map DB row → EmpresaConfig shape
function rowToConfig(d: Record<string, any>): EmpresaConfig {
  return {
    id: d.id,
    orgId: d.org_id ?? null,
    nome: d.nome,
    nomeCompleto: d.nome_completo,
    nif: d.nif ?? '',
    sede: d.sede ?? '',
    licencaTVDE: d.licenca_tvde ?? '',
    licencaValidade: d.licenca_validade ?? '',
    representante: d.representante ?? '',
    cargoRepresentante: d.cargo_representante ?? '',
    papelTimbrado: d.papel_timbrado ?? '',
  };
}

export function useEmpresas() {
  const [empresas, setEmpresas] = useState<EmpresaConfig[]>(getEmpresasList());
  const [loading, setLoading] = useState(true);

  const fetch = async () => {
    const { data, error } = await supabase
      .from('empresas')
      .select('*')
      .eq('ativo', true)
      .order('nome');

    if (!error && data && data.length > 0) {
      setEmpresas(data.map(rowToConfig));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetch();
  }, []);

  const getById = (id: string) => empresas.find((e) => e.id === id);

  return { empresas, loading, getById, reload: fetch };
}
