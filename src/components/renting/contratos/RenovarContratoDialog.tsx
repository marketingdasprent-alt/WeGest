import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, RefreshCw, AlertTriangle, Gauge } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { formatDate } from '@/utils/formatters';
import { useRenovarContrato } from '@/hooks/useContratosRenting';
import { proximaDataRenovacao } from '@/lib/renovacaoContrato';
import type { ContratoRenting } from '@/types/contratoRenting';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contrato: ContratoRenting;
}

const parseKm = (v: string): number | null => {
  const n = Number(v.replace(',', '.'));
  return v.trim() !== '' && Number.isFinite(n) ? Math.round(n) : null;
};

export function RenovarContratoDialog({ open, onOpenChange, contrato }: Props) {
  const navigate = useNavigate();
  const renovarMut = useRenovarContrato();

  // Odómetro atual da viatura — fallback para o km inicial quando o contrato
  // que fecha ainda não tem km de saída registado (1.ª renovação).
  const { data: viaturaKm } = useQuery({
    queryKey: ['viatura-km-atual', contrato.viatura_id],
    enabled: open && !!contrato.viatura_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('viaturas')
        .select('km_atual')
        .eq('id', contrato.viatura_id)
        .maybeSingle();
      return (data?.km_atual as number | null) ?? null;
    },
  });

  // Km inicial do mês que fecha: o km_saida do contrato (meses encadeados) ou,
  // na 1.ª renovação sem km registado, o odómetro atual da viatura.
  const [kmInicioStr, setKmInicioStr] = useState('');
  const [kmFimStr, setKmFimStr] = useState('');

  useEffect(() => {
    if (!open) return;
    const base = contrato.km_saida ?? viaturaKm ?? null;
    setKmInicioStr(base != null ? String(base) : '');
    setKmFimStr('');
  }, [open, contrato.km_saida, viaturaKm]);

  const kmInicio = parseKm(kmInicioStr);
  const kmFim = parseKm(kmFimStr);

  const novoPeriodo = useMemo(() => {
    if (!contrato.data_fim) return null;
    const inicio = new Date(contrato.data_fim);
    const fim = proximaDataRenovacao(
      contrato.data_fim,
      contrato.renovacao_opcao,
      contrato.renovacao_intervalo_dias
    );
    return { inicio, fim };
  }, [contrato.data_fim, contrato.renovacao_opcao, contrato.renovacao_intervalo_dias]);

  // Cálculo do excesso de km (espelha a RPC; aqui só para pré-visualizar).
  // Só há excesso quando existe um limite mensal DEFINIDO (kms_incluidos != null);
  // sem limite = km ilimitados = sem cobrança.
  const kmCalc = useMemo(() => {
    if (kmInicio == null || kmFim == null) return null;
    const percorridos = kmFim - kmInicio;
    const temLimite = contrato.kms_incluidos != null;
    const limite = contrato.kms_incluidos ?? 0;
    const valorKm = contrato.km_adicional_valor ?? 0;
    const excesso = temLimite ? Math.max(0, percorridos - limite) : 0;
    return { percorridos, temLimite, limite, valorKm, excesso, total: excesso * valorKm };
  }, [kmInicio, kmFim, contrato.kms_incluidos, contrato.km_adicional_valor]);

  const kmFimInvalido = kmFim == null || (kmInicio != null && kmFim < kmInicio);
  const naoFaturado =
    contrato.estado_financeiro !== 'facturado' && contrato.estado_financeiro !== 'pago';
  const codigoLabel = `#${String(contrato.codigo).padStart(4, '0')}`;

  async function handleRenovar() {
    try {
      const novoId = await renovarMut.mutateAsync({
        contratoId: contrato.id,
        kmInicio,
        kmFim,
      });
      toast.success('Contrato renovado — aberto o novo mês por faturar.');
      onOpenChange(false);
      navigate(`/renting/contratos/${novoId}`);
    } catch (e: any) {
      toast.error(`Falha ao renovar: ${e?.message ?? 'tente novamente'}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (renovarMut.isPending ? undefined : onOpenChange(o))}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" /> Renovar contrato {codigoLabel}
          </DialogTitle>
          <DialogDescription>
            Fecha o contrato atual (passa ao histórico) e abre um novo mês, por faturar, com o
            código mais recente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1 text-sm">
          <div className="rounded-md border divide-y">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-muted-foreground text-xs">Período atual</span>
              <span className="tabular-nums">
                {formatDate(contrato.data_inicio)} → {formatDate(contrato.data_fim)}
              </span>
            </div>
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-muted-foreground text-xs">Novo período</span>
              <span className="tabular-nums font-medium">
                {novoPeriodo
                  ? `${formatDate(novoPeriodo.inicio.toISOString())} → ${formatDate(
                      novoPeriodo.fim.toISOString()
                    )}`
                  : '—'}
              </span>
            </div>
          </div>

          {/* ── Quilómetros ── */}
          <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-3 space-y-3">
            <div className="flex items-center gap-2 text-sky-700 dark:text-sky-300">
              <Gauge className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">Quilómetros</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="km-inicio" className="text-xs text-muted-foreground">
                  Km no início do mês
                </Label>
                <Input
                  id="km-inicio"
                  type="number"
                  inputMode="numeric"
                  value={kmInicioStr}
                  onChange={(e) => setKmInicioStr(e.target.value)}
                  placeholder="—"
                  className="bg-background tabular-nums"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="km-fim" className="text-xs text-muted-foreground">
                  Km atual (fim do mês) *
                </Label>
                <Input
                  id="km-fim"
                  type="number"
                  inputMode="numeric"
                  value={kmFimStr}
                  onChange={(e) => setKmFimStr(e.target.value)}
                  placeholder="Ex: 105300"
                  className="bg-background tabular-nums"
                />
              </div>
            </div>

            {kmFim != null && kmInicio != null && kmFim < kmInicio && (
              <p className="text-xs text-destructive">
                O km final não pode ser inferior ao km inicial.
              </p>
            )}

            {kmCalc && !kmFimInvalido && (
              <div className="text-xs text-muted-foreground space-y-0.5">
                <div className="flex justify-between">
                  <span>Percorridos este mês</span>
                  <span className="tabular-nums font-medium text-foreground">
                    {kmCalc.percorridos.toLocaleString('pt-PT')} km
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Limite mensal</span>
                  <span className="tabular-nums">
                    {kmCalc.temLimite
                      ? `${kmCalc.limite.toLocaleString('pt-PT')} km`
                      : '— (sem limite)'}
                  </span>
                </div>
              </div>
            )}

            {kmCalc && kmCalc.excesso > 0 && kmCalc.valorKm > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <p className="text-xs">
                  <strong>{kmCalc.excesso.toLocaleString('pt-PT')} km</strong> acima do limite ×{' '}
                  {kmCalc.valorKm.toFixed(2)} € ={' '}
                  <strong>{kmCalc.total.toFixed(2)} € por faturar</strong>. Fica como linha "Km
                  excedente" no mês que fecha.
                </p>
              </div>
            )}
          </div>

          {naoFaturado && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <p className="text-xs">
                O mês atual ainda <strong>não está faturado</strong> e ficará congelado no histórico
                após renovar. Confirma que faturaste este período (incluindo os km extra) antes de
                continuar.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={renovarMut.isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleRenovar}
            disabled={renovarMut.isPending || !novoPeriodo || kmFimInvalido}
          >
            {renovarMut.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Renovar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
