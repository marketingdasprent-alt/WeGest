import { useState } from 'react';
import { subWeeks, subMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { Wallet, FileText, CalendarClock } from 'lucide-react';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { Button } from '@/components/ui/button';
import { useResumoPlataformas } from '@/hooks/useResumoPlataformas';
import { useFaturacaoResumoPeriodo } from '@/hooks/useFaturacaoResumoPeriodo';
import { useContratosARenovar } from '@/hooks/useContratosARenovar';
import { useContasAReceber } from '@/hooks/useContasAReceber';

const fmtEur = (v: number) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);

type Granularidade = 'semana' | 'mes';

function periodoAtual(granularidade: Granularidade, hoje = new Date()) {
  return granularidade === 'semana'
    ? { inicio: startOfWeek(hoje, { weekStartsOn: 1 }), fim: endOfWeek(hoje, { weekStartsOn: 1 }) }
    : { inicio: startOfMonth(hoje), fim: endOfMonth(hoje) };
}

export function DashboardFinanceiro() {
  const [granularidade, setGranularidade] = useState<Granularidade>('semana');
  const [referencia, setReferencia] = useState(new Date());
  const { inicio, fim } = periodoAtual(granularidade, referencia);

  const { dados: plataformas, loading: loadingPlataformas } = useResumoPlataformas(inicio, fim);
  const { resumo: faturacao, loading: loadingFaturacao } = useFaturacaoResumoPeriodo(inicio, fim);
  const { contratos: contratosARenovar } = useContratosARenovar();
  const { data: contasAReceber } = useContasAReceber();

  return (
    <div className="p-4 md:p-6 space-y-4">
      <StickyPageHeader title="Financeiro" />

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Resumos por Plataforma</h3>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={granularidade === 'semana' ? 'default' : 'outline'}
              onClick={() => {
                setGranularidade('semana');
                setReferencia(new Date());
              }}
            >
              Semana
            </Button>
            <Button
              size="sm"
              variant={granularidade === 'mes' ? 'default' : 'outline'}
              onClick={() => {
                setGranularidade('mes');
                setReferencia(new Date());
              }}
            >
              Mês
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setReferencia(granularidade === 'semana' ? subWeeks(referencia, 1) : subMonths(referencia, 1))}
            >
              ◀
            </Button>
          </div>
        </div>

        {loadingPlataformas ? (
          <p className="text-sm text-muted-foreground">A carregar…</p>
        ) : (
          <div className="divide-y">
            {plataformas.map((p) => (
              <div key={p.plataforma} className="flex justify-between items-center py-2 text-sm">
                <span>{p.plataforma}</span>
                <div className="text-right">
                  <div className={p.tipo_valor === 'receita' ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}>
                    {fmtEur(p.valor)}
                  </div>
                  {p.valor_bruto !== null && p.comissao !== null && (
                    <div className="text-xs text-muted-foreground">
                      {fmtEur(p.valor_bruto)} brutos - {fmtEur(p.comissao)} comissão
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          label="Recibos pendentes"
          value={loadingFaturacao ? '—' : fmtEur(faturacao.pendentes.valor)}
          icon={FileText}
          color="amber"
          footer={loadingFaturacao ? undefined : `${faturacao.pendentes.count} por emitir`}
        />
        <KpiCard
          label="Emitidas no período"
          value={loadingFaturacao ? '—' : fmtEur(faturacao.emitidas.valor)}
          icon={Wallet}
          color="green"
          footer={loadingFaturacao ? undefined : `${faturacao.emitidas.count} facturas`}
        />
        <KpiCard
          label="Em atraso"
          value={loadingFaturacao ? '—' : fmtEur(faturacao.emAtraso.valor)}
          icon={CalendarClock}
          color="violet"
          footer={loadingFaturacao ? undefined : `${faturacao.emAtraso.count} facturas`}
        />
      </div>

      <div className="rounded-lg border p-4 space-y-2">
        <h3 className="font-semibold text-sm">Cobranças e contratos a renovar</h3>
        {(contasAReceber?.emAberto ?? []).slice(0, 5).map((c) => (
          <div key={c.id} className="flex justify-between text-sm">
            <span>{c.destinatarioNome}</span>
            <span className="text-muted-foreground">{fmtEur(c.saldo)}</span>
          </div>
        ))}
        {contratosARenovar.slice(0, 5).map((c) => (
          <div key={c.id} className="flex justify-between text-sm">
            <span>
              Contrato #{c.numero_contrato} — {c.matricula ?? '—'}
            </span>
            <span className="text-muted-foreground">em {c.diasParaRenovar} dias</span>
          </div>
        ))}
        {(contasAReceber?.emAberto ?? []).length === 0 && contratosARenovar.length === 0 && (
          <p className="text-sm text-muted-foreground">Nada a destacar.</p>
        )}
      </div>
    </div>
  );
}
