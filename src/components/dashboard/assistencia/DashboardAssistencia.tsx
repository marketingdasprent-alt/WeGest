import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LifeBuoy, Wrench, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { useViaturasNaOficina } from '@/hooks/useViaturasNaOficina';

const ESTADOS_TICKET_ABERTO = ['pendente', 'aberto', 'em_andamento', 'aguardando'];

interface TicketResumo {
  id: string;
  numero: number;
  titulo: string;
  status: string;
  created_at: string;
}

interface ExtintorAPrazo {
  id: string;
  matricula: string;
  extintor_validade: string;
}

export function DashboardAssistencia() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<TicketResumo[]>([]);
  const [extintores, setExtintores] = useState<ExtintorAPrazo[]>([]);
  const [loading, setLoading] = useState(true);

  // Reaproveita o hook existente em vez de reescrever a query: a relação
  // viatura_reparacoes → viaturas não está declarada como FK no PostgREST,
  // pelo que um join embebido falharia em silêncio (ver o comentário em
  // useViaturasNaOficina.ts, que já resolve isto com duas consultas).
  const { data: emOficina = [], isLoading: loadingOficina } = useViaturasNaOficina();

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      const limitExtintor = new Date();
      limitExtintor.setDate(limitExtintor.getDate() + 15);
      const limitExtintorStr = limitExtintor.toISOString().split('T')[0];

      const [{ data: ticketsData }, { data: extintoresData }] = await Promise.all([
        supabase
          .from('assistencia_tickets')
          .select('id, numero, titulo, status, created_at')
          .in('status', ESTADOS_TICKET_ABERTO)
          .order('created_at', { ascending: false }),
        supabase
          .from('viaturas')
          .select('id, matricula, extintor_validade')
          .not('extintor_validade', 'is', null)
          .lte('extintor_validade', limitExtintorStr)
          .order('extintor_validade', { ascending: true }),
      ]);

      if (cancelado) return;
      setTickets(ticketsData ?? []);
      setExtintores(extintoresData ?? []);
      setLoading(false);
    }

    carregar();
    return () => {
      cancelado = true;
    };
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <StickyPageHeader title="Assistência" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          label="Tickets abertos"
          value={loading ? '—' : tickets.length}
          icon={LifeBuoy}
          color="blue"
          onClick={() => navigate('/assistencia')}
        />
        <KpiCard
          label="Viaturas em oficina"
          value={loadingOficina ? '—' : emOficina.length}
          icon={Wrench}
          color="amber"
        />
        <KpiCard
          label="Extintores a expirar"
          value={loading ? '—' : extintores.length}
          icon={ShieldAlert}
          color="violet"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border p-4 space-y-2">
          <h3 className="font-semibold text-sm">Tickets mais recentes</h3>
          {tickets.slice(0, 8).map((t) => (
            <div
              key={t.id}
              className="flex justify-between text-sm cursor-pointer hover:underline"
              onClick={() => navigate(`/assistencia/${t.id}`)}
            >
              <span>
                #{t.numero} — {t.titulo}
              </span>
              <span className="text-muted-foreground">{t.status}</span>
            </div>
          ))}
          {!loading && tickets.length === 0 && (
            <p className="text-sm text-muted-foreground">Sem tickets abertos.</p>
          )}
        </div>

        <div className="rounded-lg border p-4 space-y-2">
          <h3 className="font-semibold text-sm">Viaturas em oficina</h3>
          {emOficina.map((v) => (
            <div key={v.id} className="flex justify-between text-sm">
              <span>{v.matricula ?? '—'}</span>
              <span className="text-muted-foreground">
                desde {new Date(v.data_entrada).toLocaleDateString('pt-PT')}
              </span>
            </div>
          ))}
          {!loadingOficina && emOficina.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma viatura em oficina.</p>
          )}
        </div>
      </div>
    </div>
  );
}
