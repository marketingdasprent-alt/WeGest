import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import type { ExtratoMotorista } from '@/hooks/useMotoristaExtratoPeriodo';

function eur(v: number): string {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);
}

interface Props {
  extrato: ExtratoMotorista | null | undefined;
  isLoading: boolean;
  error: unknown;
  inicio: Date;
  fim: Date;
  /** 0 = semana actual, 1 = a anterior, e por aí adiante. */
  semanasAtras: number;
  onAnterior: () => void;
  onSeguinte: () => void;
}

/**
 * Extrato da semana no painel do motorista. Apresentação pura — recebe números
 * já calculados no servidor e não faz contas próprias, para não existir uma
 * segunda versão da mesma regra.
 */
export function MotoristaExtratoCard({
  extrato,
  isLoading,
  error,
  inicio,
  fim,
  semanasAtras,
  onAnterior,
  onSeguinte,
}: Props) {
  const periodo = `${format(inicio, "d 'de' MMM", { locale: pt })} a ${format(fim, "d 'de' MMM", { locale: pt })}`;
  const titulo =
    semanasAtras === 0 ? 'A minha semana' : semanasAtras === 1 ? 'Semana passada' : 'Semana de';

  // O cabecalho e o mesmo nos tres estados (a carregar, erro, com dados): as
  // setas tem de funcionar mesmo quando a semana escolhida falha ou esta
  // vazia, senao o motorista fica preso nela sem forma de voltar atras.
  const cabecalho = (
    <CardHeader className="pb-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm">
            <TrendingUp className="h-4 w-4 text-primary" />
            {titulo}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{periodo}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onAnterior}
            aria-label="Semana anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {/* Desligado na semana actual: nao ha ganhos do futuro para mostrar. */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onSeguinte}
            disabled={semanasAtras === 0}
            aria-label="Semana seguinte"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </CardHeader>
  );

  if (isLoading) {
    return (
      <Card>
        {cabecalho}
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Um erro nunca se disfarça de zeros: o motorista tem de saber que o problema
  // é nosso, e não pensar que não ganhou nada.
  if (error || !extrato) {
    return (
      <Card>
        {cabecalho}
        <CardContent>
          <p className="text-sm text-destructive">
            Não foi possível carregar os seus valores. Tente daqui a pouco.
          </p>
        </CardContent>
      </Card>
    );
  }

  const descontos = [
    { rotulo: 'Aluguer da viatura', valor: extrato.aluguer },
    { rotulo: 'Combustível', valor: extrato.combustivel },
    { rotulo: 'Portagens', valor: extrato.portagens },
    { rotulo: 'Reparações', valor: extrato.reparacoes },
    { rotulo: 'Outros', valor: extrato.outros },
  ].filter((d) => d.valor > 0);

  const diferencaAcerto =
    extrato.temAcerto && extrato.acertoLiquido !== null
      ? Math.abs(extrato.acertoLiquido - extrato.liquido)
      : 0;

  return (
    <Card>
      {cabecalho}

      <CardContent className="space-y-4">
        {/* Zero viagens não é "ganhaste zero", é "ainda não chegou". Mostrar 0 €
            aqui seria dizer ao motorista uma coisa que não sabemos. */}
        {!extrato.temDadosReceita ? (
          <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            Os ganhos deste período ainda não foram importados. Assim que entrarem, aparecem aqui.
          </p>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Bruto</span>
              <span className="text-lg font-semibold">{eur(extrato.receita)}</span>
            </div>

            {descontos.length > 0 ? (
              <div className="space-y-1 border-t border-border pt-3">
                {descontos.map((d) => (
                  <div key={d.rotulo} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{d.rotulo}</span>
                    <span className="text-destructive">−{eur(d.valor)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-border pt-1 text-sm font-medium">
                  <span>Total de custos</span>
                  <span className="text-destructive">−{eur(extrato.totalCustos)}</span>
                </div>
              </div>
            ) : (
              <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                Não há custos registados nesta semana. Se tem aluguer ou combustível por lançar,
                fale com o seu gestor — o valor abaixo ainda não os desconta.
              </p>
            )}

            <div className="flex items-baseline justify-between border-t border-border pt-3">
              <span className="text-sm font-medium">
                {extrato.liquido < 0 ? 'Em dívida' : 'Líquido a receber'}
              </span>
              <span
                className={`text-2xl font-bold ${extrato.liquido < 0 ? 'text-destructive' : 'text-emerald-600'}`}
              >
                {eur(Math.abs(extrato.liquido))}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 text-center">
              <div>
                <p className="text-lg font-semibold">{extrato.viagensBolt}</p>
                <p className="text-xs text-muted-foreground">Viagens</p>
              </div>
              <div>
                <p className="text-lg font-semibold">{eur(extrato.mediaPorDia)}</p>
                <p className="text-xs text-muted-foreground">
                  Média por dia ({extrato.diasDecorridos}
                  {extrato.diasDecorridos === 1 ? ' dia' : ' dias'})
                </p>
              </div>
            </div>

            {/* Há duas contas no sistema: esta, ao vivo, e a do fecho de semana
                que alimenta o acerto. Enquanto divergirem, o motorista vê as
                duas — descobrir a diferença sozinho no acerto seria pior. */}
            {diferencaAcerto > 0.01 && (
              <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  O acerto desta semana foi fechado em{' '}
                  <strong>{eur(extrato.acertoLiquido ?? 0)}</strong>. É esse o valor que conta para
                  pagamento; o acima reflecte os dados mais recentes.
                </span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
