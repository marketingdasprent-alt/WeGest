import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type TipoDeCampo = 'string' | 'number' | 'boolean';

export interface CampoDoEvento {
  id: string;
  label: string;
  tipo: TipoDeCampo;
}

export interface EventoCatalogo {
  label: string;
  modulo: string;
  entidade: string;
  campos: CampoDoEvento[];
}

export interface AccaoCatalogo {
  label: string;
  modulo: string;
  entidade: string;
  recurso: string;
  campos_permitidos?: string[];
  valores?: string[];
}

export interface AutomationCatalogo {
  eventos: Record<string, EventoCatalogo>;
  accoes: Record<string, AccaoCatalogo>;
}

export function useAutomationCatalogo() {
  return useQuery({
    queryKey: ['automation-catalogo'],
    queryFn: async (): Promise<AutomationCatalogo> => {
      const { data, error } = await supabase.rpc('automation_catalogo');
      if (error) throw error;
      if (!data) throw new Error('O catálogo de automação veio vazio.');
      return data as unknown as AutomationCatalogo;
    },
    staleTime: Infinity,
  });
}

export function camposDoEvento(
  catalogo: AutomationCatalogo | undefined,
  eventType: string | undefined
): CampoDoEvento[] {
  if (!catalogo || !eventType) return [];
  return catalogo.eventos[eventType]?.campos ?? [];
}

export function accoesParaEvento(
  catalogo: AutomationCatalogo | undefined,
  eventType: string | undefined
): Array<[string, AccaoCatalogo]> {
  if (!catalogo) return [];
  const todas = Object.entries(catalogo.accoes);
  const entidade = eventType ? catalogo.eventos[eventType]?.entidade : undefined;
  if (!entidade) return todas;
  return todas.filter(([, a]) => a.entidade === entidade);
}
