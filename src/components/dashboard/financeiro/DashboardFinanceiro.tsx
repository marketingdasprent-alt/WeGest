import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { LayoutDashboard, CircleDollarSign, Wallet, FileText, Banknote } from 'lucide-react';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { useResumoPlataformas, type ResumoPlataforma } from '@/hooks/useResumoPlataformas';
import { useFaturacaoResumoPeriodo } from '@/hooks/useFaturacaoResumoPeriodo';

const fmtEur = (v: number) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);

const PLATAFORMA_LOGO: Record<string, string> = {
  Bolt: '/images/logo-bolt.png',
  Uber: '/images/logo-uber.png',
  BP: '/images/logo-bp.png',
  Repsol: '/images/logo-repsol.png',
  EDP: '/images/logo-edp.png',
  'Via Verde': '/images/logo-via-verde.png',
};

const PLATAFORMA_SUB: Record<string, string> = {
  Bolt: 'Faturado',
  Uber: 'Faturado',
  BP: 'Combustível',
  Repsol: 'Combustível',
  EDP: 'Energia',
  'Via Verde': 'Portagens',
};

function somaReceita(dados: ResumoPlataforma[]): number {
  return dados.filter((p) => p.tipo_valor === 'receita').reduce((s, p) => s + p.valor, 0);
}

export function DashboardFinanceiro() {
  const hoje = new Date();
  const periodoHoje = { inicio: hoje, fim: hoje };
  const periodoSemana = {
    inicio: startOfWeek(hoje, { weekStartsOn: 1 }),
    fim: endOfWeek(hoje, { weekStartsOn: 1 }),
  };
  const periodoMes = { inicio: startOfMonth(hoje), fim: endOfMonth(hoje) };

  const { dados: dadosHoje, loading: loadingHoje } = useResumoPlataformas(periodoHoje.inicio, periodoHoje.fim);
  const { dados: dadosSemana, loading: loadingSemana } = useResumoPlataformas(
    periodoSemana.inicio,
    periodoSemana.fim
  );
  const { dados: dadosMes, loading: loadingMes } = useResumoPlataformas(periodoMes.inicio, periodoMes.fim);
  const { resumo: faturacao, loading: loadingFaturacao } = useFaturacaoResumoPeriodo(
    periodoMes.inicio,
    periodoMes.fim
  );

  const loading = loadingHoje || loadingSemana || loadingMes || loadingFaturacao;
  const semanaLabel = `${format(periodoSemana.inicio, 'd MMM', { locale: pt })} – ${format(periodoSemana.fim, 'd MMM', { locale: pt })}`;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <StickyPageHeader title="Início" />

      <div className="flex items-center gap-2">
        <LayoutDashboard className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">Início</h1>
        <span className="ml-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
          Financeiro
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Faturado hoje"
          value={loading ? '—' : fmtEur(somaReceita(dadosHoje))}
          icon={CircleDollarSign}
          color="green"
        />
        <KpiCard
          label="Esta semana"
          value={loading ? '—' : fmtEur(somaReceita(dadosSemana))}
          icon={Wallet}
          color="blue"
        />
        <KpiCard
          label="Recibos pendentes"
          value={loading ? '—' : fmtEur(faturacao.pendentes.valor)}
          icon={FileText}
          color="amber"
        />
        <KpiCard
          label="Líquido este mês"
          value={loading ? '—' : fmtEur(somaReceita(dadosMes))}
          icon={Banknote}
          color="violet"
        />
      </div>

      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-2">
          Plataformas e fornecedores · importações de {semanaLabel}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {loadingSemana ? (
            <p className="text-sm text-muted-foreground col-span-full">A carregar…</p>
          ) : (
            dadosSemana.map((p) => (
              <div key={p.plataforma} className="rounded-lg border bg-card p-3 shadow-sm space-y-1">
                <div className="h-5 flex items-center">
                  <img
                    src={PLATAFORMA_LOGO[p.plataforma]}
                    alt={p.plataforma}
                    className="h-5 w-auto max-w-[80px] object-contain"
                  />
                </div>
                <div className="text-lg font-bold">{fmtEur(p.valor)}</div>
                <div className="text-xs text-muted-foreground">{PLATAFORMA_SUB[p.plataforma] ?? p.plataforma}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
