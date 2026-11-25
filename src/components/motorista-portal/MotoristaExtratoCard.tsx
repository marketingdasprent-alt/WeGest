import { useState } from 'react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, FileText, TrendingUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { AcertoSemanalDetalhado } from '@/hooks/useAcertoSemanal';
import { despesasDoResumo } from '@/lib/resumoSemanalDetalhe';
import { percentagem } from '@/components/administrativo/motorista-resumo/retencaoIrs';
import { ResumoSemanaDialog } from './ResumoSemanaDialog';

function eur(v: number): string {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);
}

interface Props {
  /** A semana gravada pela lista de Contas/Resumo; null = ainda não enviada. */
  acerto: AcertoSemanalDetalhado | null | undefined;
  isLoading: boolean;
  error: unknown;
  inicio: Date;
  fim: Date;
  /** 1 = a semana passada, 2 = a anterior, e por aí adiante. */
  semanasAtras: number;
  /** Desligado na primeira semana com contas: antes dela não há nada para mostrar. */
  podeAnterior?: boolean;
  /** Desligado na semana passada: a semana em curso ainda não está fechada. */
  podeSeguinte?: boolean;
  onAnterior: () => void;
  onSeguinte: () => void;
}

/**
 * A semana no painel do motorista. Mostra o resumo gravado pelo escritório na
 * lista de Contas/Resumo, sem contas próprias: os valores são os mesmos do
 * documento que o escritório vê e envia.
 */
export function MotoristaExtratoCard({
  acerto,
  isLoading,
  error,
  inicio,
  fim,
  semanasAtras,
  podeAnterior = true,
  podeSeguinte = false,
  onAnterior,
  onSeguinte,
}: Props) {
  const [resumoAberto, setResumoAberto] = useState<string | null>(null);
  const periodo = `${format(inicio, "d 'de' MMM", { locale: pt })} a ${format(fim, "d 'de' MMM", { locale: pt })}`;
  const titulo = semanasAtras <= 1 ? 'Semana passada' : 'Semana de';

  // O cabeçalho é o mesmo em todos os estados: as setas têm de funcionar mesmo
  // quando a semana escolhida falha ou está vazia.
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
            disabled={!podeAnterior}
            aria-label="Semana anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onSeguinte}
            disabled={!podeSeguinte}
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

  // Um erro nunca se disfarça de zeros.
  if (error || acerto === undefined) {
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

  if (acerto === null) {
    return (
      <Card>
        {cabecalho}
        <CardContent>
          <p role="status" className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            As contas desta semana estão a ser preparadas. Assim que o escritório as enviar,
            aparecem aqui.
          </p>
        </CardContent>
      </Card>
    );
  }

  const d = acerto.detalhe;
  const liquido = d ? d.liquido : acerto.liquido;
  const despesas = d ? despesasDoResumo(d) : [];

  return (
    <Card>
      {cabecalho}

      <CardContent className="space-y-4">
        {d ? (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Total receitas</span>
              <span className="text-lg font-semibold">{eur(d.totalReceitas)}</span>
            </div>

            {despesas.length > 0 && (
              <div className="space-y-1 border-t border-border pt-3">
                {despesas.map((linha) => (
                  <div key={linha.rotulo} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{linha.rotulo}</span>
                    <span className="text-destructive">−{eur(linha.valor)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-border pt-1 text-sm font-medium">
                  <span>Total despesas</span>
                  <span className="text-destructive">−{eur(d.totalDespesas)}</span>
                </div>
              </div>
            )}

            {/* Com Retenção o líquido inclui IVA e IRS: as mesmas linhas do documento. */}
            {d.retencao && (
              <div className="space-y-1 border-t border-border pt-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total líquido</span>
                  <span>{eur(d.retencao.totalLiquido)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    IVA ({percentagem(d.retencao.taxaIva)})
                  </span>
                  <span>{eur(d.retencao.iva)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total documento</span>
                  <span>{eur(d.retencao.totalDocumento)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    IRS retido ({percentagem(d.retencao.taxaIrs)})
                  </span>
                  <span className="text-destructive">−{eur(d.retencao.irs)}</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            O detalhe desta semana não está disponível. O valor abaixo é o que conta para o
            pagamento.
          </p>
        )}

        <div className="flex items-baseline justify-between border-t border-border pt-3">
          <span className="text-sm font-medium">
            {liquido < 0 ? 'Em dívida' : 'Líquido a receber'}
          </span>
          <span
            className={`text-2xl font-bold ${liquido < 0 ? 'text-destructive' : 'text-emerald-600'}`}
          >
            {eur(Math.abs(liquido))}
          </span>
        </div>

        {d?.viagens !== undefined && (
          <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 text-center">
            <div>
              <p className="text-lg font-semibold">{d.viagens}</p>
              <p className="text-xs text-muted-foreground">Viagens</p>
            </div>
            <div>
              <p className="text-lg font-semibold">{eur(d.totalReceitas / 7)}</p>
              <p className="text-xs text-muted-foreground">Média por dia (7 dias)</p>
            </div>
          </div>
        )}

        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => setResumoAberto(acerto.id)}
        >
          <FileText className="h-4 w-4" />
          Ver resumo completo
        </Button>
      </CardContent>

      <ResumoSemanaDialog acertoId={resumoAberto} onClose={() => setResumoAberto(null)} />
    </Card>
  );
}
