import { useNavigate } from 'react-router-dom';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { pt } from 'date-fns/locale';
import { CircleDollarSign, Wallet, FileText, Banknote, CalendarClock, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { DashboardInicioHeader } from '@/components/dashboard/DashboardInicioHeader';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { KpiItem } from '@/components/dashboard/KpiItem';
import { AlertaCategoriaRow, type CategoriaAlerta } from '@/components/dashboard/AlertaCategoriaRow';
import { useResumoPlataformas, type ResumoPlataforma } from '@/hooks/useResumoPlataformas';
import { useFaturacaoResumoPeriodo } from '@/hooks/useFaturacaoResumoPeriodo';
import { useContasAReceber } from '@/hooks/useContasAReceber';
import { useContratosARenovar } from '@/hooks/useContratosARenovar';
import { useTopMotoristasSemana } from '@/hooks/useTopMotoristasSemana';

const fmtEur = (v: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);

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
  const navigate = useNavigate();
  const hoje = new Date();
  const semana = {
    inicio: startOfWeek(hoje, { weekStartsOn: 1 }),
    fim: endOfWeek(hoje, { weekStartsOn: 1 }),
  };
  const mes = { inicio: startOfMonth(hoje), fim: endOfMonth(hoje) };

  const { dados: dadosHoje, loading: loadingHoje } = useResumoPlataformas(hoje, hoje);
  const { dados: dadosSemana, loading: loadingSemana } = useResumoPlataformas(semana.inicio, semana.fim);
  const { dados: dadosMes, loading: loadingMes } = useResumoPlataformas(mes.inicio, mes.fim);
  const { resumo: faturacao, loading: loadingFaturacao } = useFaturacaoResumoPeriodo(mes.inicio, mes.fim);
  const { data: contasAReceber } = useContasAReceber();
  const { contratos: contratosARenovar } = useContratosARenovar();
  const { motoristas: topMotoristas, periodo: periodoMotoristas } = useTopMotoristasSemana();

  const loading = loadingHoje || loadingSemana || loadingMes || loadingFaturacao;
  const semanaLabel = `${format(semana.inicio, 'd MMM', { locale: pt })} – ${format(semana.fim, 'd MMM', { locale: pt })}`;

  const cobrancas = contasAReceber?.emAberto ?? [];
  const totalEmAberto = cobrancas.reduce((s, c) => s + c.saldo, 0);

  // Mesma leitura da dashboard de frota: cada categoria mostra o caso mais
  // grave, e a segunda linha diz quantos mais existem.
  const categoriasAlerta: CategoriaAlerta[] = [];
  if (cobrancas.length > 0) {
    const pior = cobrancas[0];
    categoriasAlerta.push({
      id: 'cobrancas',
      icon: Wallet,
      cor: 'destructive',
      titulo: 'Cobranças',
      descricao: `${pior.destinatarioNome} · ${fmtEur(pior.saldo)} há ${pior.diasEmAberto} dias`,
      detalhe:
        cobrancas.length > 1
          ? `+${cobrancas.length - 1} outras · ${fmtEur(totalEmAberto)} em aberto`
          : null,
      contagem: cobrancas.length,
      href: '/administrativo/faturacao',
    });
  }
  if (faturacao.pendentes.count > 0) {
    categoriasAlerta.push({
      id: 'recibos',
      icon: FileText,
      cor: 'warning',
      titulo: 'Recibos',
      descricao: `${faturacao.pendentes.count} por emitir · ${fmtEur(faturacao.pendentes.valor)}`,
      detalhe: null,
      contagem: faturacao.pendentes.count,
      href: '/administrativo/faturacao',
    });
  }
  if (contratosARenovar.length > 0) {
    const proximo = contratosARenovar[0];
    categoriasAlerta.push({
      id: 'contratos',
      icon: CalendarClock,
      cor: 'warning',
      titulo: 'Contratos',
      descricao: `Contrato #${proximo.numero_contrato}${proximo.matricula ? ` — ${proximo.matricula}` : ''} renova em ${proximo.diasParaRenovar} dias`,
      detalhe: contratosARenovar.length > 1 ? `+${contratosARenovar.length - 1} outros contratos` : null,
      contagem: contratosARenovar.length,
      href: '/renting/contratos',
    });
  }

  return (
    <div className="p-4 md:p-6">
      <DashboardInicioHeader perfil="Financeiro" className="lg:pb-4 lg:mb-4" />

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-4">
          {/* ── Coluna esquerda: faixa de KPIs + plataformas + motoristas ── */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 border-b border-border">
              <KpiItem
                icon={CircleDollarSign}
                cor="success"
                label="Faturado hoje"
                valor={fmtEur(somaReceita(dadosHoje))}
                onClick={() => navigate('/administrativo')}
                index={0}
              >
                <span className="text-[11px] text-muted-foreground">Bolt + Uber</span>
              </KpiItem>
              <KpiItem
                icon={Wallet}
                cor="navy"
                label="Esta semana"
                valor={fmtEur(somaReceita(dadosSemana))}
                onClick={() => navigate('/administrativo')}
                index={1}
              >
                <span className="text-[11px] text-muted-foreground">{semanaLabel}</span>
              </KpiItem>
              <KpiItem
                icon={FileText}
                cor="warning"
                label="Por emitir"
                valor={fmtEur(faturacao.pendentes.valor)}
                onClick={() => navigate('/administrativo/faturacao')}
                index={2}
              >
                <span className="text-[11px] text-muted-foreground">
                  <b className="font-semibold text-foreground tabular-nums">
                    {faturacao.pendentes.count}
                  </b>{' '}
                  recibos
                </span>
              </KpiItem>
              <KpiItem
                icon={CalendarClock}
                cor="destructive"
                label="Em atraso"
                valor={fmtEur(faturacao.emAtraso.valor)}
                onClick={() => navigate('/administrativo/faturacao')}
                index={3}
              >
                <span className="text-[11px] text-muted-foreground">
                  <b className="font-semibold text-foreground tabular-nums">
                    {faturacao.emAtraso.count}
                  </b>{' '}
                  facturas
                </span>
              </KpiItem>
              <KpiItem
                icon={Banknote}
                cor="violet"
                label="Líquido este mês"
                valor={fmtEur(somaReceita(dadosMes))}
                onClick={() => navigate('/administrativo')}
                index={4}
              >
                <span className="text-[11px] text-muted-foreground">
                  {format(mes.inicio, 'MMMM', { locale: pt })}
                </span>
              </KpiItem>
            </div>

            <Card className="p-4">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold">Plataformas e fornecedores</h2>
                <span className="text-[11px] text-muted-foreground">importações de {semanaLabel}</span>
              </div>
              <div className="divide-y divide-border/60">
                {dadosSemana.map((p) => (
                  <div key={p.plataforma} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/60 p-1">
                        <img
                          src={PLATAFORMA_LOGO[p.plataforma]}
                          alt={p.plataforma}
                          className="h-full w-full object-contain"
                        />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium">{p.plataforma}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {PLATAFORMA_SUB[p.plataforma] ?? '—'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={
                          p.tipo_valor === 'receita'
                            ? 'text-[15px] font-semibold tabular-nums text-success'
                            : 'text-[15px] font-semibold tabular-nums text-destructive'
                        }
                      >
                        {fmtEur(p.valor)}
                      </div>
                      {p.valor_bruto !== null && p.comissao !== null && (
                        <div className="text-[11px] text-muted-foreground tabular-nums">
                          {fmtEur(p.valor_bruto)} brutos · {fmtEur(p.comissao)} comissão
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Users className="h-4 w-4 text-primary" />
                  Motoristas da semana
                </h2>
                <span className="text-[11px] text-muted-foreground">
                  {format(periodoMotoristas.inicio, 'd MMM', { locale: pt })} –{' '}
                  {format(periodoMotoristas.fim, 'd MMM', { locale: pt })}
                </span>
              </div>
              {topMotoristas.length === 0 ? (
                <p className="py-2 text-[13px] text-muted-foreground">
                  Sem dados de Bolt/Uber importados para esta semana.
                </p>
              ) : (
                <div className="divide-y divide-border/60">
                  <div className="grid grid-cols-[1fr_auto_auto] gap-4 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <span>Motorista</span>
                    <span className="text-right">Faturado</span>
                    <span className="text-right">Líquido</span>
                  </div>
                  {topMotoristas.map((m) => (
                    <div
                      key={m.motoristaId}
                      className="grid grid-cols-[1fr_auto_auto] items-center gap-4 py-2 text-[13px]"
                    >
                      <span className="truncate font-medium">{m.nome}</span>
                      <span className="text-right tabular-nums text-muted-foreground">
                        {fmtEur(m.faturado)}
                      </span>
                      <span className="text-right font-semibold tabular-nums text-success">
                        {fmtEur(m.liquido)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* ── Coluna direita: "Precisa de atenção" ───────────────────────── */}
          <Card className="flex flex-col p-4">
            <h2 className="text-sm font-semibold">Precisa de atenção</h2>
            {categoriasAlerta.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted-foreground">Nada a destacar por agora.</p>
            ) : (
              <div className="mt-1 flex flex-1 flex-col">
                {categoriasAlerta.map((categoria, i) => (
                  <AlertaCategoriaRow
                    key={categoria.id}
                    categoria={categoria}
                    index={i}
                    onClick={() => navigate(categoria.href)}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
