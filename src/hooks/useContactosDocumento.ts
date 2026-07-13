/**
 * Resolve os contactos (nome + email) do CLIENTE do contrato/reserva e do
 * CONDUTOR principal, para pré-preencher o envio de documentos por email.
 * O condutor pode ser um cliente (rent-a-car) ou um motorista (TVDE).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ContactoEntidade {
  tipo: 'cliente' | 'condutor';
  label: string;
  nome: string;
  email: string;
}

export interface CondutorRef {
  cliente_id: string | null;
  motorista_id: string | null;
}

interface Params {
  clienteId: string | null | undefined;
  condutor?: CondutorRef | null;
}

export function useContactosDocumento({ clienteId, condutor }: Params) {
  const condClienteId = condutor?.cliente_id ?? null;
  const condMotoristaId = condutor?.motorista_id ?? null;

  return useQuery({
    queryKey: ['contactos-documento', clienteId ?? null, condClienteId, condMotoristaId],
    enabled: !!clienteId || !!condClienteId || !!condMotoristaId,
    staleTime: 60_000,
    queryFn: async (): Promise<ContactoEntidade[]> => {
      const clienteIds = Array.from(
        new Set([clienteId, condClienteId].filter(Boolean))
      ) as string[];

      const clientesMap = new Map<string, { nome: string; email: string }>();
      if (clienteIds.length) {
        const { data } = await supabase
          .from('clientes')
          .select('id, nome, email')
          .in('id', clienteIds);
        (data ?? []).forEach((c: any) =>
          clientesMap.set(c.id, { nome: c.nome ?? '', email: c.email ?? '' })
        );
      }

      let motorista: { nome: string; email: string } | null = null;
      if (condMotoristaId) {
        const { data } = await supabase
          .from('motoristas_ativos')
          .select('nome, email')
          .eq('id', condMotoristaId)
          .maybeSingle();
        if (data) {
          motorista = { nome: (data as any).nome ?? '', email: (data as any).email ?? '' };
        }
      }

      const entidades: ContactoEntidade[] = [];

      if (clienteId) {
        const c = clientesMap.get(clienteId);
        entidades.push({
          tipo: 'cliente',
          label: 'Cliente',
          nome: c?.nome || 'Cliente',
          email: c?.email ?? '',
        });
      }

      // Condutor — só se for uma entidade distinta do cliente do contrato.
      if (condClienteId && condClienteId !== clienteId) {
        const c = clientesMap.get(condClienteId);
        entidades.push({
          tipo: 'condutor',
          label: 'Condutor',
          nome: c?.nome || 'Condutor',
          email: c?.email ?? '',
        });
      } else if (motorista) {
        entidades.push({
          tipo: 'condutor',
          label: 'Condutor',
          nome: motorista.nome || 'Condutor',
          email: motorista.email,
        });
      }

      return entidades;
    },
  });
}
