import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, TrendingUp, TrendingDown, HandCoins } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toggleSort, type SortDirection } from '@/components/ui/sortable-table-head';
import { FinanceiroSection } from '@/components/ui/financeiro-section';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Motorista } from '@/pages/Motoristas';
import { useCanEditFinanceiro } from '@/hooks/useCanEditFinanceiro';
import { useAcordoAtivoResumoPorEntidade } from '@/hooks/useAcordosPagamento';
import { formatDate } from '@/utils/formatters';
import {
  NovoMovimentoFinanceiroOverlay,
  type MovimentoFinanceiro,
  type RecorrenciaFinanceira,
} from './NovoMovimentoFinanceiroOverlay';
import { RecorrenciasAtivasList } from './RecorrenciasAtivasList';
import { MovimentosHistoricoTable } from './MovimentosHistoricoTable';

interface MotoristaTabFinanceiroProps {
  motorista: Motorista;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
}

/**
 * Cartão de acordo de pagamento ativo deste motorista (§7.5 da spec: valor por
 * pagar, próxima data, progresso N/M). Mesmo padrão visual (border-t-4) do
 * resumo Créditos/Débitos já existente neste ficheiro, em vez de copiar o
 * `border-l-4` de `ClienteContaCorrenteTab.tsx` — este ecrã já tem o seu
 * próprio estilo de cartão de resumo, não se está a introduzir um novo.
 *
 * NOTA: hoje um motorista nunca pode ser titular nem responsável de um acordo
 * (ver comentário de `useAcordoAtivoResumoPorEntidade` em
 * `useAcordosPagamento.ts` — `acordo_criar` recusa sempre responsável
 * motorista, TVDE fatura-se fora do WeGest). Este cartão está correctamente
 * ligado ao schema mas, com as regras de negócio actuais, nunca é renderizado
 * — mantido por coerência com o pedido da tarefa e por defensividade caso
 * essa regra alguma vez mude.
 */
function AcordoResumoCard({
  acordo,
  onVerAcordo,
}: {
  acordo: NonNullable<ReturnType<typeof useAcordoAtivoResumoPorEntidade>['data']>;
  onVerAcordo: () => void;
}) {
  const emIncumprimento = acordo.estado === 'incumprimento';
  return (
    <Card
      className={`overflow-hidden border-t-4 ${emIncumprimento ? 'border-t-red-500' : 'border-t-amber-500'}`}
    >
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`p-2 rounded-lg shrink-0 ${emIncumprimento ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-600'}`}
            >
              <HandCoins className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">
                Acordo de pagamento{emIncumprimento ? ' — em incumprimento' : ''}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                Acordo #{acordo.codigo} · {acordo.parcelasPagas}/{acordo.parcelasTotal} parcelas
                {acordo.proximaData ? ` · próxima em ${formatDate(acordo.proximaData)}` : ''}
                {acordo.outrosAtivos > 0 ? ` · +${acordo.outrosAtivos} outro(s) acordo(s)` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Por pagar</p>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(acordo.faltaPagar)}</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={onVerAcordo}>
              Ver acordo
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export function MotoristaFinanceiroContent({ motoristaId }: { motoristaId: string }) {
  const navigate = useNavigate();
  const { data: acordoAtivo } = useAcordoAtivoResumoPorEntidade('motorista', motoristaId);
  const [movimentos, setMovimentos] = useState<MovimentoFinanceiro[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoMovimentoOpen, setNovoMovimentoOpen] = useState(false);
  const [reparacaoParaAcordo, setReparacaoParaAcordo] = useState<MovimentoFinanceiro | null>(null);
  const [movimentoParaEditar, setMovimentoParaEditar] = useState<MovimentoFinanceiro | null>(null);
  const [faturaUrlAcordo, setFaturaUrlAcordo] = useState<string | null>(null);
  // mapa: movimento.id → URL da fatura do ticket associado
  const [movimentoFaturaMap, setMovimentoFaturaMap] = useState<Map<string, string>>(new Map());
  const [recorrencias, setRecorrencias] = useState<RecorrenciaFinanceira[]>([]);
  const { canEdit } = useCanEditFinanceiro();
  const [sortField, setSortField] = useState<string>('data_movimento');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);

  useEffect(() => {
    loadMovimentos();
    loadRecorrencias();
  }, [motoristaId]);

  const loadRecorrencias = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('motorista_financeiro_recorrencias')
        .select('*')
        .eq('motorista_id', motoristaId)
        .neq('status', 'cancelada')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRecorrencias((data as RecorrenciaFinanceira[]) || []);
    } catch (error) {
      console.error('Erro ao carregar recorrências:', error);
    }
  };

  const loadMovimentos = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('motorista_financeiro')
        .select('*')
        .eq('motorista_id', motoristaId)
        .order('data_movimento', { ascending: false });

      if (error) throw error;
      const movs = (data as MovimentoFinanceiro[]) || [];
      setMovimentos(movs);

      // Para movimentos de reparação, tentar obter o fatura_url do ticket associado
      const reparacaoMovs = movs.filter((m) => m.categoria === 'reparacao');
      if (reparacaoMovs.length > 0) {
        const ticketNums = reparacaoMovs
          .map((m) => {
            const match = (m.referencia ?? '').match(/Ticket #(\d+)/);
            return match ? parseInt(match[1]) : null;
          })
          .filter((n): n is number => n !== null);

        if (ticketNums.length > 0) {
          const { data: tickets } = await supabase
            .from('assistencia_tickets')
            .select('numero, fatura_url')
            .in('numero', ticketNums);

          const ticketFaturaMap = new Map(
            (tickets || [])
              .filter((t) => t.fatura_url)
              .map((t) => [t.numero as number, t.fatura_url as string])
          );

          const newMap = new Map<string, string>();
          for (const mov of reparacaoMovs) {
            // Primeiro tentar URL já embebida no referencia
            const refRaw = mov.referencia ?? '';
            const embeddedUrl = refRaw.includes(' | http')
              ? refRaw.split(' | ').find((p) => p.startsWith('http'))
              : null;
            if (embeddedUrl) {
              newMap.set(mov.id, embeddedUrl);
              continue;
            }
            // Fallback: buscar do ticket
            const match = refRaw.match(/Ticket #(\d+)/);
            if (match) {
              const url = ticketFaturaMap.get(parseInt(match[1]));
              if (url) newMap.set(mov.id, url);
            }
          }
          setMovimentoFaturaMap(newMap);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar movimentos:', error);
      toast.error('Erro ao carregar movimentos financeiros');
    } finally {
      setLoading(false);
    }
  };

  const calcularResumo = () => {
    let totalCreditos = 0;
    let totalDebitos = 0;

    movimentos.forEach((m) => {
      if (m.status !== 'cancelado') {
        if (m.tipo === 'credito') totalCreditos += Number(m.valor);
        else totalDebitos += Number(m.valor);
      }
    });

    return { totalCreditos, totalDebitos };
  };

  const resumo = calcularResumo();

  const pendingRepairs = movimentos.filter(
    (m) =>
      m.categoria === 'reparacao' &&
      m.status === 'pendente' &&
      !m.descricao.startsWith('Acordo de pagamento')
  );

  // Optimistic: aplica o novo estado localmente já, antes da rede responder —
  // reverte para o snapshot anterior se o update falhar. Sem isto o clique
  // fica "parado" até o round-trip terminar, o que se sente lento numa acção
  // tão frequente quanto marcar/cancelar um movimento.
  const handleMarcarPago = async (id: string) => {
    if (!canEdit) return;
    const anterior = movimentos;
    const dataPagamento = new Date().toISOString();
    setMovimentos((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status: 'pago', data_pagamento: dataPagamento } : m))
    );
    try {
      const { error } = await supabase
        .from('motorista_financeiro')
        .update({ status: 'pago', data_pagamento: dataPagamento })
        .eq('id', id);
      if (error) throw error;
      toast.success('Movimento marcado como pago!');
    } catch (error) {
      setMovimentos(anterior);
      toast.error('Erro ao atualizar movimento');
    }
  };

  const handleCancelar = async (id: string) => {
    if (!canEdit) return;
    const anterior = movimentos;
    setMovimentos((prev) => prev.map((m) => (m.id === id ? { ...m, status: 'cancelado' } : m)));
    try {
      const { error } = await supabase
        .from('motorista_financeiro')
        .update({ status: 'cancelado' })
        .eq('id', id);
      if (error) throw error;
      toast.success('Movimento cancelado!');
    } catch (error) {
      setMovimentos(anterior);
      toast.error('Erro ao cancelar movimento');
    }
  };

  const handleAlterarRecorrencia = async (
    id: string,
    status: 'ativa' | 'pausada' | 'cancelada'
  ) => {
    const anterior = recorrencias;
    setRecorrencias((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    try {
      const { error } = await (supabase as any)
        .from('motorista_financeiro_recorrencias')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      toast.success(
        status === 'pausada'
          ? 'Recorrência pausada'
          : status === 'ativa'
            ? 'Recorrência retomada'
            : 'Recorrência cancelada'
      );
    } catch (error) {
      setRecorrencias(anterior);
      toast.error('Erro ao atualizar recorrência');
    }
  };

  const movimentosOrdenados = useMemo(() => {
    const list = [...movimentos];
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortField === 'data_movimento') {
        va = a.data_movimento;
        vb = b.data_movimento;
      } else if (sortField === 'descricao') {
        va = a.descricao;
        vb = b.descricao;
      } else if (sortField === 'categoria') {
        va = a.categoria || '';
        vb = b.categoria || '';
      } else if (sortField === 'tipo') {
        va = a.tipo;
        vb = b.tipo;
      } else if (sortField === 'valor') {
        va = Number(a.valor);
        vb = Number(b.valor);
      } else if (sortField === 'status') {
        va = a.status;
        vb = b.status;
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [movimentos, sortField, sortDir]);

  const handleOpenAcordo = (mov: MovimentoFinanceiro) => {
    setReparacaoParaAcordo(mov);
    setFaturaUrlAcordo(movimentoFaturaMap.get(mov.id) ?? null);
    setNovoMovimentoOpen(true);
  };

  const handleOpenEditar = (mov: MovimentoFinanceiro) => {
    setMovimentoParaEditar(mov);
    setFaturaUrlAcordo(movimentoFaturaMap.get(mov.id) ?? null);
    setNovoMovimentoOpen(true);
  };

  const handleCloseOverlay = () => {
    setNovoMovimentoOpen(false);
    setReparacaoParaAcordo(null);
    setMovimentoParaEditar(null);
    setFaturaUrlAcordo(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">A carregar dados financeiros...</div>
      </div>
    );
  }

  return (
    <>
      {novoMovimentoOpen && (
        <NovoMovimentoFinanceiroOverlay
          motoristaId={motoristaId}
          reparacaoPendente={reparacaoParaAcordo ?? undefined}
          movimentoParaEditar={movimentoParaEditar ?? undefined}
          faturaUrlExterna={faturaUrlAcordo}
          onClose={handleCloseOverlay}
          onSuccess={() => {
            handleCloseOverlay();
            loadMovimentos();
            loadRecorrencias();
          }}
        />
      )}

      <div className="space-y-6">
        {/* Alerta de reparações a aguardar acordo */}
        {pendingRepairs.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-warning">
                {pendingRepairs.length} reparação(ões) a aguardar acordo de pagamento
              </p>
              <p className="text-xs text-warning/90 mt-0.5">
                Combine o plano de parcelamento com o motorista e clique em "Definir Acordo" na
                linha correspondente.
              </p>
            </div>
          </div>
        )}

        {/* Resumo */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="overflow-hidden border-t-4 border-t-green-500">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Créditos</p>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(resumo.totalCreditos)}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-green-500/10">
                  <TrendingUp className="h-6 w-6 text-green-500" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="overflow-hidden border-t-4 border-t-red-500">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Débitos</p>
                  <p className="text-2xl font-bold text-red-600">
                    {formatCurrency(resumo.totalDebitos)}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-red-500/10">
                  <TrendingDown className="h-6 w-6 text-red-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Cartão de acordo — só quando há um acordo ativo/em incumprimento deste motorista */}
        {acordoAtivo && (
          <AcordoResumoCard
            acordo={acordoAtivo}
            onVerAcordo={() => navigate(`/acordos/${acordoAtivo.id}`)}
          />
        )}

        <RecorrenciasAtivasList
          recorrencias={recorrencias}
          onAlterarStatus={handleAlterarRecorrencia}
        />

        <MovimentosHistoricoTable
          movimentos={movimentosOrdenados}
          movimentoFaturaMap={movimentoFaturaMap}
          canEdit={canEdit}
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
          onRefresh={loadMovimentos}
          onNovoMovimento={() => {
            setReparacaoParaAcordo(null);
            setNovoMovimentoOpen(true);
          }}
          onAbrirAcordo={handleOpenAcordo}
          onAbrirEditar={handleOpenEditar}
          onMarcarPago={handleMarcarPago}
          onCancelar={handleCancelar}
        />
      </div>
    </>
  );
}

/**
 * Wrapper público — mantém a API original (<MotoristaTabFinanceiro motorista={m} />)
 * para páginas que já a importam. Delega para o componente partilhado FinanceiroSection.
 */
export function MotoristaTabFinanceiro({ motorista }: MotoristaTabFinanceiroProps) {
  return <FinanceiroSection entidade="motorista" id={motorista.id} />;
}
