import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * O catálogo de automação, lido do servidor.
 *
 * A fonte de verdade é `public.automation_catalogo()`, uma função SQL. Este
 * módulo NÃO tem uma cópia da lista de eventos nem de acções — só os tipos que
 * descrevem o que ela devolve. Duplicá-la aqui era garantir que um dia divergem
 * e a UI passa a oferecer uma acção que o motor recusa.
 *
 * Os dois eixos são separados de propósito, e isso vem do motor: as CONDIÇÕES
 * avaliam o payload do EVENTO, as ACÇÕES operam sobre uma ENTIDADE. Não são a
 * mesma lista vista de ângulos diferentes.
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
   * Tabela sobre que a acção opera. O motor recusa se não bater com a do run.
   * Só acções internas vivem aqui — a acção de email não opera sobre uma
   * entidade do domínio (dirige-se a pessoas, não a registos) e por isso tem
   * a sua própria chave no catálogo, `notificacao_email`, fora de `accoes`.
   */
  entidade: string;
  /**
   * Recurso do RBAC associado à acção. Só é EXIGIDO pelo validador do
   * servidor nas automações internas (`can_edit(user, recurso)`); para
   * notificação e email é apenas descritivo — quem escreve qualquer
   * `automation_rules` já passa pela RLS de `can_edit(user, 'automacoes')`,
   * independentemente do tipo de acção.
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
 * As acções que fazem sentido para aquele evento.
 *
 * O motor já recusa uma acção cuja entidade não bata com a do run — em runtime
 * e, quando conhece o evento, também na escrita. Isto é só para o utilizador
 * não escolher uma combinação que vai ser rejeitada: a autoridade continua a
 * ser o servidor.
 *
 * Quando o catálogo não conhece o evento, devolve tudo em vez de nada: filtrar
 * por informação que não existe esconderia acções válidas.
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
