import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { History, Car, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

interface ViaturaMin {
  matricula: string;
  marca: string | null;
  modelo: string | null;
}

interface HistoricoLinha {
  id: string;
  data_inicio: string;
  data_fim: string | null;
  viatura: ViaturaMin | null;
}

interface Props {
  motoristaId: string;
}

const fmt = (iso: string | null) =>
  iso ? format(new Date(iso), 'dd MMM yyyy', { locale: pt }) : '—';

/**
 * Histórico de viaturas do motorista — todos os períodos JÁ ENCERRADOS
 * (data_fim preenchida) da tabela motorista_viaturas, que os triggers
 * contrato_renting_liga_motorista_{open,close} vão fechando a cada troca.
 * A viatura em curso é mostrada no cartão "Viatura Atual"; aqui fica só o
 * rasto do que passou.
 */
export function MotoristaHistoricoViaturasCard({ motoristaId }: Props) {
  const [linhas, setLinhas] = useState<HistoricoLinha[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('motorista_viaturas')
          .select(
            `id, data_inicio, data_fim,
             viatura:viaturas ( matricula, marca, modelo )`
          )
          .eq('motorista_id', motoristaId)
          .not('data_fim', 'is', null)
          .order('data_inicio', { ascending: false });
        if (error) throw error;
        if (vivo) setLinhas((data ?? []) as unknown as HistoricoLinha[]);
      } catch (e) {
        console.error('Erro ao carregar histórico de viaturas:', e);
      } finally {
        if (vivo) setLoading(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [motoristaId]);

  if (loading) {
    return (
      <Card className="bg-card border-border shadow-sm rounded-[1.5rem] md:rounded-[2rem] overflow-hidden">
        <CardHeader className="p-5 md:p-8 pb-3 md:pb-4">
          <CardTitle className="text-base md:text-lg font-black text-foreground flex items-center gap-2 md:gap-3">
            <div className="p-2 bg-muted rounded-xl">
              <History className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
            </div>
            Histórico de Viaturas
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 md:p-8 pt-0">
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Sem histórico ainda — não polui o painel com um cartão vazio.
  if (linhas.length === 0) return null;

  return (
    <Card className="bg-card border-border shadow-sm rounded-[1.5rem] md:rounded-[2rem] overflow-hidden leading-relaxed">
      <CardHeader className="p-5 md:p-8 pb-3 md:pb-4 border-b border-border/50">
        <CardTitle className="text-base md:text-lg font-black text-foreground flex items-center gap-2 md:gap-3">
          <div className="p-2 bg-muted rounded-xl">
            <History className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
          </div>
          Histórico de Viaturas
          <span className="ml-auto text-[10px] md:text-xs font-bold text-muted-foreground">
            {linhas.length} {linhas.length === 1 ? 'período' : 'períodos'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border/50">
          {linhas.map((l) => (
            <div
              key={l.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 md:gap-4 p-5 md:p-6"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 bg-muted rounded-xl shrink-0">
                  <Car className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm md:text-base text-foreground truncate">
                    {l.viatura ? `${l.viatura.marca ?? ''} ${l.viatura.modelo ?? ''}`.trim() : '—'}
                  </p>
                  {l.viatura?.matricula && (
                    <span className="font-mono text-[10px] md:text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                      {l.viatura.matricula}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 text-[10px] md:text-xs font-bold text-muted-foreground tabular-nums shrink-0">
                <span>{fmt(l.data_inicio)}</span>
                <ArrowRight className="w-3 h-3 opacity-60" />
                <span>{fmt(l.data_fim)}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
