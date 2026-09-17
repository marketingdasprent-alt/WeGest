import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Catálogo de automação, lido de `public.automation_catalogo()` (SQL). Este
 * módulo só tem os tipos de retorno, nunca uma cópia da lista — para não
 * divergir e a UI oferecer uma acção que o motor recusa.
 */

/** Os tipos que o catálogo sabe declarar hoje. */
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
  /**
   * Tabela sobre que a acção opera; o motor recusa se não bater com a do run.
   * A acção de email fica fora de `accoes` (chave própria `notificacao_email`)
   * porque não opera sobre uma entidade do domínio.
   */
  entidade: string;
  /**
   * Recurso do RBAC. Só é exigido pelo servidor nas automações internas; para
   * notificação/email é descritivo, já coberto pela RLS de `automation_rules`.
   */
  recurso: string;
  /** Presente nas acções que escrevem num campo. */
  campos_permitidos?: string[];
  /** Presente nas acções cujo valor vem de um conjunto fechado. */
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
    // Metadados estáticos: não variam por organização nem durante a sessão.
    staleTime: Infinity,
  });
}

/** Os campos que aquele evento traz no payload — e mais nenhum. */
export function camposDoEvento(
  catalogo: AutomationCatalogo | undefined,
  eventType: string | undefined
): CampoDoEvento[] {
  if (!catalogo || !eventType) return [];
  return catalogo.eventos[eventType]?.campos ?? [];
}

/**
 * Acções que fazem sentido para aquele evento — só para evitar no UI uma
 * combinação que o motor já recusa no servidor; a autoridade é sempre lá.
 * Evento desconhecido devolve tudo, para não esconder acções válidas.
 */
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
