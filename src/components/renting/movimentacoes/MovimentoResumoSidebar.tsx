import { useMemo } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { ArrowRight, Car, Fuel, Gauge, MapPin, User } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import type { MovimentoFormValues } from './movimentoForm.schema';
import { MovimentoEstadoBadge, MovimentoTipoBadge } from './MovimentoBadges';
import { formatCombustivel, formatDateTime, formatKm } from './movimentosUtils';
import type { Estacao } from '@/hooks/useEstacoes';
import type { ViaturaBasic } from '@/hooks/useViaturas';

interface MovimentoResumoSidebarProps {
  form: UseFormReturn<MovimentoFormValues>;
  estacoes: Estacao[];
  viaturas: ViaturaBasic[];
}

const Linha: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-2 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium text-right">{children}</span>
  </div>
);

export const MovimentoResumoSidebar: React.FC<MovimentoResumoSidebarProps> = ({
  form,
  estacoes,
  viaturas,
}) => {
  const tipo = form.watch('tipo');
  const estado = form.watch('estado');
  const viaturaId = form.watch('viatura_id');
  const origemId = form.watch('estacao_origem_id');
  const destinoId = form.watch('estacao_destino_id');
  const kmInicial = form.watch('km_inicial');
  const kmFinal = form.watch('km_final');
  const combustivelInicial = form.watch('combustivel_inicial');
  const combustivelFinal = form.watch('combustivel_final');
  const dataPartida = form.watch('data_partida');
  const dataChegada = form.watch('data_chegada');
  const colaboradorNome = form.watch('colaborador_nome');

  const viatura = useMemo(() => viaturas.find((v) => v.id === viaturaId), [viaturas, viaturaId]);
  const origem = useMemo(() => estacoes.find((e) => e.id === origemId), [estacoes, origemId]);
  const destino = useMemo(() => estacoes.find((e) => e.id === destinoId), [estacoes, destinoId]);

  const kmPercorridos =
    kmInicial != null && kmFinal != null && kmFinal >= kmInicial ? kmFinal - kmInicial : null;

  return (
    <aside className="space-y-3">
      <Card className="overflow-hidden">
        <div className="px-4 py-3 bg-muted/40 border-b flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Resumo do Movimento
          </p>
          <MovimentoEstadoBadge estado={estado} />
        </div>

        <div className="px-4 py-3 border-b flex items-center justify-between gap-2">
          <MovimentoTipoBadge tipo={tipo} />
          <span
            className={cn(
              'flex items-center gap-1.5 text-sm font-mono',
              !viatura && 'text-muted-foreground italic'
            )}
          >
            <Car className="h-3.5 w-3.5" />
            {viatura?.matricula ?? 'Viatura?'}
          </span>
        </div>

        {/* Trajeto da transferência */}
        <div className="px-4 py-3 border-b">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            Trajeto
          </p>
          <div className="flex items-center gap-2 text-sm">
            <span className={cn('flex-1', !origem && 'text-muted-foreground italic')}>
              {origem?.nome ?? 'Origem?'}
            </span>
            <ArrowRight className="h-4 w-4 text-primary shrink-0" />
            <span className={cn('flex-1 text-right', !destino && 'text-muted-foreground italic')}>
              {destino?.nome ?? 'Destino?'}
            </span>
          </div>
        </div>

        {/* Quilometragem / combustível */}
        <div className="px-4 py-3 space-y-2 border-b">
          <Linha label="KM Inicial">
            <span className="flex items-center gap-1 justify-end">
              <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
              {formatKm(kmInicial)}
            </span>
          </Linha>
          <Linha label="KM Final">{formatKm(kmFinal)}</Linha>
          {kmPercorridos != null && (
            <Linha label="Percorridos">
              <span className="text-primary">{formatKm(kmPercorridos)}</span>
            </Linha>
          )}
          <Linha label="Combustível">
            <span className="flex items-center gap-1 justify-end">
              <Fuel className="h-3.5 w-3.5 text-muted-foreground" />
              {formatCombustivel(combustivelInicial)} → {formatCombustivel(combustivelFinal)}
            </span>
          </Linha>
        </div>

        {/* Datas + responsável */}
        <div className="px-4 py-3 space-y-2">
          <Linha label="Partida">
            <span className="text-xs">{formatDateTime(dataPartida || null)}</span>
          </Linha>
          <Linha label="Chegada">
            <span className="text-xs">{formatDateTime(dataChegada || null)}</span>
          </Linha>
          <Linha label="Responsável">
            <span
              className={cn(
                'flex items-center gap-1 justify-end',
                !colaboradorNome && 'text-muted-foreground italic'
              )}
            >
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              {colaboradorNome || 'Sem responsável'}
            </span>
          </Linha>
        </div>
      </Card>
    </aside>
  );
};
