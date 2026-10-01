import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HandCoins, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { format, startOfWeek, endOfWeek, subWeeks, addWeeks, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SectionCard } from '@/components/ui/section-card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import {
  useDividasMotorista,
  useUltimaSemanaComLiquido,
  useDividasAnterioresPorCobrar,
  useMarcarDividaPaga,
  useMarcarDividaNaoPaga,
  type Divida,
  type EstadoDivida,
} from '@/hooks/useDividasMotorista';
import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';

const ESTADO_LABEL: Record<EstadoDivida, string> = {
  por_cobrar: 'Por cobrar',
  paga: 'Paga',
};

const ESTADO_CLASS: Record<EstadoDivida, string> = {
  por_cobrar: 'bg-red-500/10 text-red-600 border-red-200',
  paga: 'bg-green-500/10 text-green-600 border-green-200',
};

export function DividasTab() {
  const navigate = useNavigate();
  const [pesquisa, setPesquisa] = useState('');
  // "Todas" por omissão de propósito: marcar uma dívida como paga move-a de
  // lista, e com o filtro em "Por cobrar" a linha sumia à frente de quem
  // acabara de clicar — parecia apagada.
  const [estado, setEstado] = useState<'por_cobrar' | 'paga' | 'todas'>('todas');
  // Mesmo recurso que já gere a sidebar/rota/RLS desta funcionalidade
  // (financeiro_recibos) — antes gate admin-only, agora alinhado.
  const { hasAccessToResource } = usePermissions();
  const canEdit = hasAccessToResource(RECURSOS.FINANCEIRO_RECIBOS);

  // A semana em curso quase nunca tem líquido gravado (só existe depois de
  // alguém carregar a semana em Contas), por isso abre-se na última que tem —
  // caso contrário a lista aparecia vazia e parecia não haver dívidas.
  const { data: ultimaSemana } = useUltimaSemanaComLiquido();
  const [semanaEscolhida, setSemanaEscolhida] = useState<Date | null>(null);
  const semanaBase = semanaEscolhida ?? (ultimaSemana ? parseISO(ultimaSemana.inicio) : null);
  const semanaInicio = semanaBase ? startOfWeek(semanaBase, { weekStartsOn: 1 }) : null;
  const semanaFim = semanaBase ? endOfWeek(semanaBase, { weekStartsOn: 1 }) : null;

  const {
    data: dividas,
    isLoading,
    isError,
  } = useDividasMotorista({
    pesquisa: pesquisa || undefined,
    estado,
    semanaInicio: semanaInicio ? format(semanaInicio, 'yyyy-MM-dd') : undefined,
    semanaFim: semanaFim ? format(semanaFim, 'yyyy-MM-dd') : undefined,
  });
  // O que ficou para trás. Cada semana é a sua conta, por isso uma dívida
  // antiga sai de vista assim que se avança — e ninguém volta atrás semana a
  // semana a ver o que ficou pendurado.
  const { data: anteriores } = useDividasAnterioresPorCobrar(
    semanaInicio ? format(semanaInicio, 'yyyy-MM-dd') : undefined
  );

  const { mutate: marcarPaga, isPending: aPagar } = useMarcarDividaPaga();
  const { mutate: marcarNaoPaga, isPending: aReabrir } = useMarcarDividaNaoPaga();
  const ocupado = aPagar || aReabrir;

  const totalPorCobrar = (dividas ?? [])
    .filter((d) => d.estado === 'por_cobrar')
    .reduce((soma, d) => soma + d.valor_total, 0);

  // Marcar paga muda o estado de todos os movimentos por liquidar do
  // motorista de uma vez — um clique enganado já liquidou 55 movimentos de
  // uma pessoa. Pede confirmação; reabrir não pede, porque devolve tudo.
  const [aConfirmar, setAConfirmar] = useState<Divida | null>(null);

  const alternarEstado = (d: Divida) => {
    if (d.estado === 'por_cobrar') setAConfirmar(d);
    else marcarNaoPaga(d.id);
  };

  const irSemanaAnterior = () => setSemanaEscolhida(subWeeks(semanaBase ?? new Date(), 1));
  const irSemanaSeguinte = () => setSemanaEscolhida(addWeeks(semanaBase ?? new Date(), 1));

  return (
    <div className="space-y-4">
      {/* Só aparece quando há mesmo algo por cobrar atrás. Um aviso que está
          sempre no ecrã deixa de se ler ao fim de dois dias. */}
      {anteriores && anteriores.motoristas > 0 && (
        <div
          data-testid="dividas-aviso-anteriores"
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-amber-200 bg-amber-500/10 px-4 py-3 dark:border-amber-900/60"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
          <p className="text-sm text-amber-900 dark:text-amber-200">
            <span className="font-semibold">
              {anteriores.motoristas} {anteriores.motoristas === 1 ? 'motorista' : 'motoristas'}
            </span>{' '}
            por cobrar de {anteriores.semanas}{' '}
            {anteriores.semanas === 1 ? 'semana anterior' : 'semanas anteriores'} —{' '}
            <span className="font-semibold">{formatCurrency(anteriores.total)}</span>
          </p>
          {anteriores.maisAntiga && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => setSemanaEscolhida(parseISO(anteriores.maisAntiga!.inicio))}
            >
              Ir à mais antiga (
              {format(parseISO(anteriores.maisAntiga.inicio), "d 'de' MMM", { locale: pt })})
            </Button>
          )}
        </div>
      )}

      {/* Navegação de semanas, igual à da lista de Contas — todas as colunas
          deste ecrã são da semana escolhida, os valores não acumulam de uma
          para a outra. */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={irSemanaAnterior}
          aria-label="Semana anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-[220px] rounded-md border border-border bg-card px-4 py-2 text-center text-sm font-medium">
          {semanaInicio && semanaFim
            ? `${format(semanaInicio, "d 'de' MMM", { locale: pt })} – ${format(semanaFim, "d 'de' MMM yyyy", { locale: pt })}`
            : 'A carregar…'}
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={irSemanaSeguinte}
          aria-label="Semana seguinte"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        {ultimaSemana && (
          <Button variant="ghost" size="sm" onClick={() => setSemanaEscolhida(null)}>
            Última semana
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">Total por cobrar nesta semana</p>
        <p
          data-testid="dividas-total-por-cobrar"
          className={cn(
            'text-2xl font-bold',
            totalPorCobrar > 0 ? 'text-red-600' : 'text-green-600'
          )}
        >
          {formatCurrency(totalPorCobrar)}
        </p>
      </div>

      <SectionCard
        icon={<HandCoins className="h-4 w-4" />}
        title="Dívidas"
        action={
          <div className="flex gap-2">
            <Input
              placeholder="Pesquisar motorista..."
              value={pesquisa}
              onChange={(e) => setPesquisa(e.target.value)}
              className="h-8 w-48"
            />
            <Select
              value={estado}
              onValueChange={(v) => setEstado(v as 'por_cobrar' | 'paga' | 'todas')}
            >
              <SelectTrigger className="h-8 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="por_cobrar">Por cobrar</SelectItem>
                <SelectItem value="paga">Paga</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar...</p>
        ) : isError ? (
          <p className="text-sm text-destructive">Não foi possível carregar as dívidas.</p>
        ) : !dividas || dividas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma dívida encontrada.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Motorista</TableHead>
                <TableHead>Período</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead>Estado</TableHead>
                {canEdit && <TableHead>Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {dividas.map((d) => (
                <TableRow key={`${d.estado}-${d.id}`}>
                  {/* O nome leva ao Financeiro do motorista, não à ficha: de
                      uma dívida o passo seguinte é sempre ver a conta corrente
                      dele. `listaUrl` leva a semana escolhida, para o voltar
                      atrás devolver a esta semana e não à última. */}
                  <TableCell>
                    <button
                      type="button"
                      className="text-left font-medium text-primary hover:underline"
                      onClick={() =>
                        navigate(`/motoristas/${d.motorista_id}?tab=financeiro`, {
                          state: {
                            listaUrl: `${window.location.pathname}${window.location.search}`,
                          },
                        })
                      }
                    >
                      {d.motorista_nome}
                    </button>
                  </TableCell>
                  <TableCell>
                    {formatDate(d.periodo_inicio)} – {formatDate(d.periodo_fim)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right font-bold',
                      d.valor_periodo < 0 ? 'text-red-600' : 'text-muted-foreground'
                    )}
                  >
                    {formatCurrency(d.valor_periodo)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={ESTADO_CLASS[d.estado]}>
                      {ESTADO_LABEL[d.estado]}
                    </Badge>
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      {/* Um só botão, que alterna. Marcar paga liquida os
                          movimentos do motorista; marcar não paga devolve a
                          pendente exactamente os que aquela dívida levou. */}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={ocupado}
                        onClick={() => alternarEstado(d)}
                      >
                        {d.estado === 'por_cobrar' ? 'Marcar paga' : 'Marcar não paga'}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <AlertDialog open={!!aConfirmar} onOpenChange={(v) => !v && setAConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar a dívida como paga?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os movimentos por liquidar de <strong>{aConfirmar?.motorista_nome}</strong>{' '}
              passam a pago no perfil financeiro dele, e o saldo vai a zero — são{' '}
              <strong>{formatCurrency(aConfirmar?.valor_total ?? 0)}</strong>. A linha fica aqui,
              como paga, e podes desfazer a qualquer momento em "Marcar não paga".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                // O período vai sempre: sem ele a RPC liquidaria todos os
                // movimentos pendentes do motorista, incluindo os de semanas
                // que nem estão à vista neste ecrã.
                if (aConfirmar)
                  marcarPaga({
                    motoristaId: aConfirmar.motorista_id,
                    periodoInicio: aConfirmar.periodo_inicio,
                    periodoFim: aConfirmar.periodo_fim,
                  });
                setAConfirmar(null);
              }}
            >
              Marcar paga
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
