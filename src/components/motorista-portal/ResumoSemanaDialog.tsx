import { useRef, type ReactNode } from 'react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Calculator, TrendingDown, TrendingUp } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAcertoSemanal } from '@/hooks/useAcertoSemanal';
import { percentagem } from '@/components/administrativo/motorista-resumo/retencaoIrs';

interface ResumoSemanaDialogProps {
  /** Id da linha em motorista_liquido_semanal; null fecha o diálogo. */
  acertoId: string | null;
  onClose: () => void;
}

const eur = (v: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);

const dia = (iso: string, fmt: string) => format(new Date(`${iso}T00:00:00`), fmt, { locale: pt });

function Linha({
  rotulo,
  valor,
  forte,
  className,
}: {
  rotulo: string;
  valor: string;
  forte?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 text-sm', forte && 'font-bold')}>
      <span className="min-w-0">{rotulo}</span>
      <span className={cn('shrink-0 tabular-nums', className)}>{valor}</span>
    </div>
  );
}

function Bloco({
  titulo,
  icone,
  cor,
  children,
}: {
  titulo: string;
  icone: ReactNode;
  cor: 'verde' | 'vermelho' | 'azul';
  children: ReactNode;
}) {
  const estilos = {
    verde: 'border-emerald-200 dark:border-emerald-900 [&>div:first-child]:bg-emerald-600',
    vermelho: 'border-red-200 dark:border-red-900 [&>div:first-child]:bg-red-500',
    azul: 'border-blue-200 dark:border-blue-900 [&>div:first-child]:bg-blue-600',
  }[cor];
  return (
    <section className={cn('overflow-hidden rounded-lg border', estilos)}>
      <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase text-white">
        {icone}
        {titulo}
      </div>
      <div className="space-y-2 p-3">{children}</div>
    </section>
  );
}

/**
 * O resumo da semana, como o escritório o vê: Receitas, Despesas e Líquido.
 * Lê a fotografia gravada ao fechar a semana, por isso os números são os que
 * contam para o pagamento.
 */
export function ResumoSemanaDialog({ acertoId, onClose }: ResumoSemanaDialogProps) {
  // Ao fechar, `acertoId` passa a null antes de o diálogo acabar de desaparecer:
  // guarda o último para o conteúdo não mudar durante a animação.
  const ultimoId = useRef(acertoId);
  if (acertoId) ultimoId.current = acertoId;
  const { data: acerto, isLoading, error } = useAcertoSemanal(acertoId ?? ultimoId.current);
  const d = acerto?.detalhe ?? null;

  const periodo = acerto
    ? `${dia(acerto.semanaInicio, 'd MMM')} a ${dia(acerto.semanaFim, 'd MMM yyyy')}`
    : isLoading
      ? 'A carregar…'
      : 'Semana fechada';

  return (
    <Dialog open={!!acertoId} onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg gap-3 overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="pr-6 text-left">
          <DialogTitle>Resumo da semana</DialogTitle>
          <DialogDescription>{periodo}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">
            Não foi possível carregar o resumo. Tente daqui a pouco.
          </p>
        ) : !acerto ? (
          <p className="text-sm text-muted-foreground">
            Este resumo já não está disponível. Fale com o escritório se precisar dele.
          </p>
        ) : !d ? (
          <div className="space-y-2">
            <Linha
              rotulo="Valor líquido a receber"
              valor={eur(acerto.liquido)}
              forte
              className={acerto.liquido < 0 ? 'text-destructive' : 'text-emerald-600'}
            />
            <p className="text-sm text-muted-foreground">
              O detalhe desta semana (receitas e despesas) ainda não está disponível. O valor acima
              é o que conta para o pagamento. Fale com o escritório se precisar do resumo completo.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center text-white">
              <div className="rounded-lg bg-emerald-600 p-2.5">
                <p className="text-[10px] font-medium uppercase opacity-85">Receitas</p>
                <p className="mt-1 text-sm font-bold tabular-nums sm:text-base">
                  {eur(d.totalReceitas)}
                </p>
              </div>
              <div className="rounded-lg bg-red-500 p-2.5">
                <p className="text-[10px] font-medium uppercase opacity-85">Despesas</p>
                <p className="mt-1 text-sm font-bold tabular-nums sm:text-base">
                  {eur(d.totalDespesas)}
                </p>
              </div>
              <div
                className={cn('rounded-lg p-2.5', d.liquido >= 0 ? 'bg-blue-600' : 'bg-orange-500')}
              >
                <p className="text-[10px] font-medium uppercase opacity-85">Líquido</p>
                <p className="mt-1 text-sm font-bold tabular-nums sm:text-base">{eur(d.liquido)}</p>
              </div>
            </div>

            <Bloco
              titulo="Receitas"
              cor="verde"
              icone={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
            >
              <Linha rotulo="Bolt" valor={eur(d.receitas.bolt)} className="text-emerald-700" />
              <Linha rotulo="Uber" valor={eur(d.receitas.uber)} className="text-emerald-700" />
              <Linha
                rotulo="Outras receitas"
                valor={eur(d.receitas.outras)}
                className="text-emerald-700"
              />
              <hr className="border-emerald-200 dark:border-emerald-900" />
              <Linha
                rotulo="Total receitas"
                valor={eur(d.totalReceitas)}
                forte
                className="text-emerald-700"
              />
            </Bloco>

            <Bloco
              titulo="Despesas"
              cor="vermelho"
              icone={<TrendingDown className="h-4 w-4" aria-hidden="true" />}
            >
              <Linha rotulo="Aluguer" valor={eur(d.despesas.aluguer)} className="text-red-700" />
              <Linha
                rotulo="Combustível"
                valor={eur(d.despesas.combustivel)}
                className="text-red-700"
              />
              <Linha
                rotulo="Portagens"
                valor={eur(d.despesas.portagens)}
                className="text-red-700"
              />
              <Linha
                rotulo="Outros custos"
                valor={eur(d.despesas.outros_custos)}
                className="text-red-700"
              />
              <Linha rotulo="Slot" valor={eur(d.despesas.slot)} className="text-red-700" />
              <Linha rotulo="Caução" valor={eur(d.despesas.caucao)} className="text-red-700" />
              <Linha rotulo="Seguros" valor={eur(d.despesas.seguros)} className="text-red-700" />
              <Linha
                rotulo="Reparações"
                valor={eur(d.despesas.reparacoes)}
                className="text-red-700"
              />
              <hr className="border-red-200 dark:border-red-900" />
              <Linha
                rotulo="Total despesas"
                valor={eur(d.totalDespesas)}
                forte
                className="text-red-700"
              />
            </Bloco>

            <Bloco
              titulo="Resumo final"
              cor="azul"
              icone={<Calculator className="h-4 w-4" aria-hidden="true" />}
            >
              {d.retencao && (
                <>
                  <Linha rotulo="Total líquido" valor={eur(d.retencao.totalLiquido)} />
                  <Linha
                    rotulo={`IVA (${percentagem(d.retencao.taxaIva)})`}
                    valor={eur(d.retencao.iva)}
                  />
                  <Linha rotulo="Total documento" valor={eur(d.retencao.totalDocumento)} />
                  <Linha
                    rotulo={`IRS retido (${percentagem(d.retencao.taxaIrs)})`}
                    valor={`-${eur(d.retencao.irs)}`}
                    className="text-red-700"
                  />
                  <hr className="border-blue-200 dark:border-blue-900" />
                </>
              )}
              <div className="-mx-3 -mb-3 flex items-baseline justify-between gap-3 bg-blue-600 px-3 py-3 text-white">
                <span className="text-xs font-bold uppercase">Valor líquido a receber</span>
                <span className="text-lg font-bold tabular-nums">{eur(d.liquido)}</span>
              </div>
            </Bloco>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
