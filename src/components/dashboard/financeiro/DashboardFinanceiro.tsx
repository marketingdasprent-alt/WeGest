import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { subWeeks, subMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth, format } from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  Wallet,
  FileText,
  CalendarClock,
  Fuel,
  Zap,
  CircleDollarSign,
  CarFront,
  TicketCheck,
  ChevronLeft,
  Clock,
  CheckCircle2,
  XCircle,
  ListChecks,
} from 'lucide-react';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useResumoPlataformas } from '@/hooks/useResumoPlataformas';
import { useFaturacaoResumoPeriodo } from '@/hooks/useFaturacaoResumoPeriodo';
import { useContratosARenovar } from '@/hooks/useContratosARenovar';
import { useContasAReceber } from '@/hooks/useContasAReceber';
import { useAluguerResumoPeriodo } from '@/hooks/useAluguerResumoPeriodo';
import { useTopMotoristasSemana } from '@/hooks/useTopMotoristasSemana';
import { useRecibosVerdesResumo } from '@/hooks/useRecibosVerdesResumo';

const fmtEur = (v: number) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);

type Granularidade = 'semana' | 'mes';

function periodoAtual(granularidade: Granularidade, hoje = new Date()) {
  return granularidade === 'semana'
    ? { inicio: startOfWeek(hoje, { weekStartsOn: 1 }), fim: endOfWeek(hoje, { weekStartsOn: 1 }) }
    : { inicio: startOfMonth(hoje), fim: endOfMonth(hoje) };
}

const CUSTO_COMBUSTIVEL = new Set(['BP', 'Repsol', 'EDP']);

// Mesmos logos e mesmas cores de marca já usadas em Integrações
// (ImportarDadosWizard.tsx, IntegracaoDialog.tsx) — não inventar novas.
const PLATAFORMA_ESTILO: Record<string, { logo: string; fundo: string; fallback: LucideIcon }> = {
  Bolt: { logo: '/images/logo-bolt.png', fundo: 'bg-green-600', fallback: CircleDollarSign },
  Uber: { logo: '/images/logo-uber.png', fundo: 'bg-neutral-800', fallback: CircleDollarSign },
  BP: { logo: '/images/logo-bp.png', fundo: 'bg-orange-500', fallback: Fuel },
  Repsol: { logo: '/images/logo-repsol.png', fundo: 'bg-red-500', fallback: Fuel },
  EDP: { logo: '/images/logo-edp.png', fundo: 'bg-emerald-500', fallback: Zap },
  'Via Verde': { logo: '/images/logo-via-verde.png', fundo: 'bg-green-600', fallback: TicketCheck },
};

/** Logo da plataforma; se a imagem falhar, cai no ícone Lucide — mesmo padrão do ImportarDadosWizard. */
function PlataformaAvatar({ plataforma }: { plataforma: string }) {
  const [erro, setErro] = useState(false);
  const estilo = PLATAFORMA_ESTILO[plataforma];
  const Fallback = estilo?.fallback ?? CircleDollarSign;

  return (
    <span
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white',
        estilo?.fundo ?? 'bg-muted'
      )}
    >
      {estilo && !erro ? (
        <img
          src={estilo.logo}
          alt={plataforma}
          className="h-4 w-4 object-contain"
          onError={() => setErro(true)}
        />
      ) : (
        <Fallback className="h-3.5 w-3.5" />
      )}
    </span>
  );
}

export function DashboardFinanceiro() {
  const [granularidade, setGranularidade] = useState<Granularidade>('semana');
  const [referencia, setReferencia] = useState(new Date());
  const { inicio, fim } = periodoAtual(granularidade, referencia);

  const { dados: plataformas, loading: loadingPlataformas } = useResumoPlataformas(inicio, fim);
  const { resumo: faturacao, loading: loadingFaturacao } = useFaturacaoResumoPeriodo(inicio, fim);
  const { contratos: contratosARenovar } = useContratosARenovar();
  const { data: contasAReceber } = useContasAReceber();
  const { valor: aluguer, loading: loadingAluguer } = useAluguerResumoPeriodo(inicio, fim);
  const { motoristas: topMotoristas, periodo: periodoTopMotoristas, loading: loadingTopMotoristas } =
    useTopMotoristasSemana();
  const { resumo: recibosVerdes, loading: loadingRecibosVerdes } = useRecibosVerdesResumo();

  const faturado = plataformas
    .filter((p) => p.tipo_valor === 'receita')
    .reduce((s, p) => s + p.valor, 0);
  const combustivel = plataformas
    .filter((p) => p.tipo_valor === 'custo' && CUSTO_COMBUSTIVEL.has(p.plataforma))
    .reduce((s, p) => s + p.valor, 0);
  const portagens = plataformas.find((p) => p.plataforma === 'Via Verde')?.valor ?? 0;

  const cobrancasEmAberto = contasAReceber?.emAberto ?? [];
  const totalCobrancasEmAberto = cobrancasEmAberto.reduce((s, c) => s + c.saldo, 0);

  const loadingKpis = loadingPlataformas || loadingFaturacao || loadingAluguer;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <StickyPageHeader title="Financeiro" />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard
          label="Faturado"
          value={loadingKpis ? '—' : fmtEur(faturado)}
          icon={CircleDollarSign}
          color="green"
          footer={<p className="text-xs text-muted-foreground">Bolt + Uber, este período</p>}
        />
        <KpiCard
          label="Aluguer"
          value={loadingKpis ? '—' : fmtEur(aluguer)}
          icon={CarFront}
          color="blue"
        />
        <KpiCard
          label="Combustível"
          value={loadingKpis ? '—' : fmtEur(combustivel)}
          icon={Fuel}
          color="amber"
          footer={<p className="text-xs text-muted-foreground">BP · Repsol · EDP</p>}
        />
        <KpiCard
          label="Portagens"
          value={loadingKpis ? '—' : fmtEur(portagens)}
          icon={TicketCheck}
          color="violet"
          footer={<p className="text-xs text-muted-foreground">Via Verde</p>}
        />
        <KpiCard
          label="Em aberto"
          value={loadingKpis ? '—' : fmtEur(faturacao.emAtraso.valor)}
          icon={CalendarClock}
          color="red"
          footer={
            loadingKpis ? undefined : (
              <p className="text-xs text-muted-foreground">{faturacao.emAtraso.count} facturas</p>
            )
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-semibold">Resumos por Plataforma</CardTitle>
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
                  aria-label="Período anterior"
                  onClick={() =>
                    setReferencia(
                      granularidade === 'semana' ? subWeeks(referencia, 1) : subMonths(referencia, 1)
                    )
                  }
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingPlataformas ? (
                <p className="text-sm text-muted-foreground">A carregar…</p>
              ) : (
                <div className="divide-y">
                  {plataformas.map((p) => (
                    <div key={p.plataforma} className="flex items-center justify-between py-3 text-sm">
                      <div className="flex items-center gap-3">
                        <PlataformaAvatar plataforma={p.plataforma} />
                        <span className="font-medium">{p.plataforma}</span>
                      </div>
                      <div className="text-right">
                        <div className={p.tipo_valor === 'receita' ? 'text-success font-semibold' : 'text-destructive font-semibold'}>
                          {fmtEur(p.valor)}
                        </div>
                        {p.valor_bruto !== null && p.comissao !== null ? (
                          <div className="text-xs text-muted-foreground">
                            {fmtEur(p.valor_bruto)} brutos - {fmtEur(p.comissao)} comissão
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground capitalize">
                            {p.plataforma === 'Via Verde' ? 'portagens' : 'combustível'}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-sm font-semibold">Resumo Semanal — Top Motoristas</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {format(periodoTopMotoristas.inicio, 'd MMM', { locale: pt })} –{' '}
                  {format(periodoTopMotoristas.fim, 'd MMM', { locale: pt })}
                </p>
              </div>
            </CardHeader>
            <CardContent>
              {loadingTopMotoristas ? (
                <p className="text-sm text-muted-foreground">A carregar…</p>
              ) : topMotoristas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados de Bolt/Uber esta semana.</p>
              ) : (
                <div className="space-y-1">
                  <div className="grid grid-cols-[1fr_auto_auto] gap-4 text-xs font-medium text-muted-foreground uppercase tracking-wide pb-1">
                    <span>Motorista</span>
                    <span className="text-right">Faturado</span>
                    <span className="text-right">Líquido</span>
                  </div>
                  {topMotoristas.map((m) => (
                    <div
                      key={m.motoristaId}
                      className="grid grid-cols-[1fr_auto_auto] gap-4 py-1.5 text-sm border-t"
                    >
                      <span className="font-medium truncate">{m.nome}</span>
                      <span className="text-right text-success">{fmtEur(m.faturado)}</span>
                      <span className="text-right text-success font-semibold">{fmtEur(m.liquido)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Recibos Verdes</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingRecibosVerdes ? (
                <p className="text-sm text-muted-foreground">A carregar…</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-500" />
                    <div>
                      <div className="text-xs text-muted-foreground">Pendentes</div>
                      <div className="font-semibold">{recibosVerdes.pendentes}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-blue-500" />
                    <div>
                      <div className="text-xs text-muted-foreground">Totais</div>
                      <div className="font-semibold">{recibosVerdes.totais}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <div>
                      <div className="text-xs text-muted-foreground">Validados</div>
                      <div className="font-semibold">{recibosVerdes.validados}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-destructive" />
                    <div>
                      <div className="text-xs text-muted-foreground">Recusados</div>
                      <div className="font-semibold">{recibosVerdes.recusados}</div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Precisa de Atenção</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!loadingRecibosVerdes && recibosVerdes.pendentes > 0 && (
                <div className="flex items-start gap-2 rounded-md border-l-4 border-l-amber-500 bg-amber-500/5 p-2">
                  <FileText className="mt-0.5 h-4 w-4 text-amber-500" />
                  <div className="text-sm">
                    <div className="text-xs font-semibold uppercase text-amber-600">Recibos</div>
                    {recibosVerdes.pendentes} recibo{recibosVerdes.pendentes !== 1 && 's'} a aguardar
                    validação
                  </div>
                </div>
              )}

              {cobrancasEmAberto.length > 0 && (
                <div className="flex items-start gap-2 rounded-md border-l-4 border-l-destructive bg-destructive/5 p-2">
                  <Wallet className="mt-0.5 h-4 w-4 text-destructive" />
                  <div className="text-sm">
                    <div className="text-xs font-semibold uppercase text-destructive">Cobranças</div>
                    <div className="font-medium">
                      <span>{cobrancasEmAberto[0].destinatarioNome}</span>{' '}
                      · {fmtEur(cobrancasEmAberto[0].saldo)}
                    </div>
                    {cobrancasEmAberto.length > 1 && (
                      <div className="text-xs text-muted-foreground">
                        +{cobrancasEmAberto.length - 1} outras · {fmtEur(totalCobrancasEmAberto)} em aberto
                      </div>
                    )}
                  </div>
                </div>
              )}

              {contratosARenovar.length > 0 && (
                <div className="flex items-start gap-2 rounded-md border-l-4 border-l-blue-500 bg-blue-500/5 p-2">
                  <CalendarClock className="mt-0.5 h-4 w-4 text-blue-500" />
                  <div className="text-sm">
                    <div className="text-xs font-semibold uppercase text-blue-600">Contratos</div>
                    <div className="font-medium">
                      Contrato #{contratosARenovar[0].numero_contrato}
                      {contratosARenovar[0].matricula && ` — ${contratosARenovar[0].matricula}`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      em {contratosARenovar[0].diasParaRenovar} dias
                      {contratosARenovar.length > 1 && ` · +${contratosARenovar.length - 1} outros`}
                    </div>
                  </div>
                </div>
              )}

              {!loadingRecibosVerdes &&
                recibosVerdes.pendentes === 0 &&
                cobrancasEmAberto.length === 0 &&
                contratosARenovar.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nada a destacar.</p>
                )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
