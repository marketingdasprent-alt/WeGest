import { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { toggleSort, type SortDirection } from '@/components/ui/sortable-table-head';
import { FinanceiroSection } from '@/components/ui/financeiro-section';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Motorista } from '@/pages/Motoristas';
import { useCanEditFinanceiro } from '@/hooks/useCanEditFinanceiro';
import {
  NovoMovimentoFinanceiroOverlay,
  isMovimentoDaFaturacao,
  type MovimentoFinanceiro,
  type RecorrenciaFinanceira,
} from './NovoMovimentoFinanceiroOverlay';
import { RecorrenciasAtivasList } from './RecorrenciasAtivasList';
import { MovimentosHistoricoTable } from './MovimentosHistoricoTable';
import { calcularResumoMovimentos } from './resumoMovimentos';
import { legendaSaldoMotorista } from '@/lib/saldoMotorista';
import { cn } from '@/lib/utils';

interface MotoristaTabFinanceiroProps {
  motorista: Motorista;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export function MotoristaFinanceiroContent({ motoristaId }: { motoristaId: string }) {
  const [movimentos, setMovimentos] = useState<MovimentoFinanceiro[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoMovimentoOpen, setNovoMovimentoOpen] = useState(false);
  const [reparacaoParaAcordo, setReparacaoParaAcordo] = useState<MovimentoFinanceiro | null>(null);
  const [movimentoParaEditar, setMovimentoParaEditar] = useState<MovimentoFinanceiro | null>(null);
  const [faturaUrlAcordo, setFaturaUrlAcordo] = useState<string | null>(null);
  // mapa: movimento.id → URL da fatura do ticket associado
  const [movimentoFaturaMap, setMovimentoFaturaMap] = useState<Map<string, string>>(new Map());
  const [recorrencias, setRecorrencias] = useState<RecorrenciaFinanceira[]>([]);
  const [saldoPendente, setSaldoPendente] = useState<number | null>(null);
  const { canEdit } = useCanEditFinanceiro();
  const [sortField, setSortField] = useState<string>('data_movimento');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);

  useEffect(() => {
    loadMovimentos();
    loadRecorrencias();
    loadSaldo();
  }, [motoristaId]);

  // RPC única, reutilizada em toda a app (portal do motorista, resumo
  // semanal, Contas/Resumo) — nunca recalculado à mão a partir de
  // `movimentos` (esses vêm sem filtro de status, o saldo só conta pendentes).
  const loadSaldo = async () => {
    try {
      const { data, error } = await supabase.rpc('motorista_saldo_pendente', {
        p_motorista_id: motoristaId,
      });
      if (error) throw error;
      setSaldoPendente(Number(data) || 0);
    } catch (error) {
      console.error('Erro ao carregar saldo pendente:', error);
    }
  };

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

  const calcularResumo = () => calcularResumoMovimentos(movimentos);

  const resumo = calcularResumo();
  const legendaSaldo = legendaSaldoMotorista(saldoPendente ?? 0);

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
  // Guarda em profundidade: a tabela já não mostra estes botões para
  // movimentos geridos pela faturação, mas estes handlers são props e podem
  // vir a ser ligados noutro sítio — liquidar aqui punha o saldo do motorista
  // a divergir da fatura em silêncio.
  const bloqueadoPelaFaturacao = (id: string) => {
    const mov = movimentos.find((m) => m.id === id);
    return !!mov && isMovimentoDaFaturacao(mov);
  };

  const handleMarcarPago = async (id: string) => {
    if (!canEdit || bloqueadoPelaFaturacao(id)) return;
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
      loadSaldo();
    } catch (error) {
      setMovimentos(anterior);
      toast.error('Erro ao atualizar movimento');
    }
  };

  const handleCancelar = async (id: string) => {
    if (!canEdit || bloqueadoPelaFaturacao(id)) return;
    const anterior = movimentos;
    setMovimentos((prev) => prev.map((m) => (m.id === id ? { ...m, status: 'cancelado' } : m)));
    try {
      const { error } = await supabase
        .from('motorista_financeiro')
        .update({ status: 'cancelado' })
        .eq('id', id);
      if (error) throw error;
      toast.success('Movimento cancelado!');
      loadSaldo();
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
            loadSaldo();
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card
            className={cn(
              'overflow-hidden border-t-4',
              legendaSaldo.tone === 'negativo'
                ? 'border-t-red-500'
                : legendaSaldo.tone === 'positivo'
                  ? 'border-t-green-500'
                  : 'border-t-muted-foreground/30'
            )}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Saldo Pendente</p>
                  <p
                    className={cn(
                      'text-2xl font-bold',
                      legendaSaldo.tone === 'negativo'
                        ? 'text-red-600'
                        : legendaSaldo.tone === 'positivo'
                          ? 'text-green-600'
                          : 'text-foreground'
                    )}
                  >
                    {saldoPendente === null ? '—' : formatCurrency(saldoPendente)}
                  </p>
                  {saldoPendente !== null && (
                    <p className="text-xs text-muted-foreground mt-0.5">{legendaSaldo.texto}</p>
                  )}
                </div>
                <div
                  className={cn(
                    'p-2 rounded-lg',
                    legendaSaldo.tone === 'negativo'
                      ? 'bg-red-500/10'
                      : legendaSaldo.tone === 'positivo'
                        ? 'bg-green-500/10'
                        : 'bg-muted'
                  )}
                >
                  <Wallet
                    className={cn(
                      'h-6 w-6',
                      legendaSaldo.tone === 'negativo'
                        ? 'text-red-500'
                        : legendaSaldo.tone === 'positivo'
                          ? 'text-green-500'
                          : 'text-muted-foreground'
                    )}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="overflow-hidden border-t-4 border-t-green-500">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Créditos por Liquidar</p>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(resumo.creditos)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {resumo.creditos === 0 ? 'Nada a devolver' : 'Ainda por devolver'}
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
                  <p className="text-sm text-muted-foreground">Débitos por Cobrar</p>
                  <p className="text-2xl font-bold text-red-600">
                    {formatCurrency(resumo.debitos)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {resumo.debitos === 0 ? 'Nada em aberto' : 'Ainda por cobrar'}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-red-500/10">
                  <TrendingDown className="h-6 w-6 text-red-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

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

        {/*
          Acumulado histórico. Vive aqui, colado à lista que o explica, e não
          nos cartões do topo: um total de tudo o que já foi debitado não é
          dívida, e a vermelho num cartão ao lado do saldo lia-se como tal.
          Cancelados ficam de fora dos dois.
        */}
        {movimentos.length > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 px-1 text-xs text-muted-foreground">
            <span>
              Acumulado histórico (inclui já liquidados) — creditado:{' '}
              <span className="font-medium text-foreground">
                {formatCurrency(resumo.acumuladoCreditos)}
              </span>
              , debitado:{' '}
              <span className="font-medium text-foreground">
                {formatCurrency(resumo.acumuladoDebitos)}
              </span>
            </span>
          </div>
        )}
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
