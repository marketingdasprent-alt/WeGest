import type React from 'react';
import { useMemo, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Gauge, Coins, Euro, CarTaxiFront, AlertTriangle } from 'lucide-react';

import type { ClienteComDocumentos } from '@/types/cliente';
import type { Motorista } from '@/types/motorista';
import type { Estacao } from '@/hooks/useEstacoes';
import type { ViaturaBasic } from '@/hooks/useViaturas';
import type { RentingGrupoMin } from '@/hooks/useRentingGruposTarifas';
import {
  useRentingTarifasMin,
  useRentingTarifaPrecosModelo,
  calcularFaturacaoRenting,
} from '@/hooks/useRentingGruposTarifas';
import { diferencaDias } from '@/utils/reserva-formatters';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SectionHeader } from '@/components/renting/reservas/SectionHeader';
import { ALDFields } from '@/components/renting/shared/ALDFields';
import { CondutoresFields } from '@/components/renting/shared/CondutoresFields';
import { FranquiaKmsFields } from '@/components/renting/shared/FranquiaKmsFields';
import { PedirAlteracaoContratoDialog } from './PedirAlteracaoContratoDialog';
import { usePedidoTrocaKmsPendente, type TipoPedidoAlteracao } from '@/hooks/usePedidosTrocaKms';
import type { ContratoFormValues } from './contratoForm.schema';
import { SectionCliente } from './SectionCliente';
import { SectionEmpresaEmissora } from './SectionEmpresaEmissora';
import { SectionEntregaRecolha } from './SectionEntregaRecolha';
import { SectionInfoAdicional } from './SectionInfoAdicional';
import { SectionRegime } from './SectionRegime';
import { SectionViatura } from './SectionViatura';

/** Link "Pedir alteração de X" sob o campo travado — trava enquanto já há um pedido pendente desse tipo. */
const BotaoPedirAlteracao: React.FC<{
  contratoId: string;
  tipo: TipoPedidoAlteracao;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}> = ({ contratoId, tipo, label, icon: Icon, onClick }) => {
  const { data: pedidoPendente } = usePedidoTrocaKmsPendente(contratoId, tipo);
  return (
    <button
      type="button"
      disabled={!!pedidoPendente}
      onClick={onClick}
      className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed"
    >
      <Icon className="h-3.5 w-3.5" />
      {pedidoPendente ? 'Pedido pendente' : label}
    </button>
  );
};

interface ContratoFormSecoesProps {
  form: UseFormReturn<ContratoFormValues>;
  clientes: ClienteComDocumentos[];
  motoristas: Motorista[];
  viaturas: ViaturaBasic[];
  grupos: RentingGrupoMin[];
  /** Grupo tarifário da viatura actual do contrato (edição) — orienta o agrupamento do selector. */
  grupoIdAtual?: string | null;
  estacoes: Estacao[];
  /** Trava o campo viatura — usado quando o contrato vem de reserva. */
  viaturaLocked?: boolean;
  reservaCodigo?: number | null;
  /** Recalcula grupo/tarifa/preço ao trocar de viatura (edição do contrato). */
  onViaturaChange?: (viaturaId: string) => void;
  onCriarNovoCliente?: () => void;
  onCriarNovoMotorista?: () => void;
  /** Contrato já existente (edição) — activa o botão "Pedir alteração de kms". */
  contratoId?: string | null;
}

/**
 * Orquestrador de seções do formulário de contrato.
 * Compõe sub-componentes de formulário específicas. Ordem-padrão (igual à
 * reserva): Regime → Empresa Emissora → Cliente → Entrega/Recolha → Viatura →
 * Tarifa → Condutor/Motorista → OBS.
 */
export const ContratoFormSecoes: React.FC<ContratoFormSecoesProps> = ({
  form,
  clientes,
  motoristas,
  viaturas,
  grupos,
  grupoIdAtual,
  estacoes,
  viaturaLocked,
  reservaCodigo,
  onViaturaChange,
  onCriarNovoCliente,
  onCriarNovoMotorista,
  contratoId,
}) => {
  const viaturaId = form.watch('viatura_id');
  const { data: tarifas = [] } = useRentingTarifasMin();

  const viaturaSelected = useMemo(
    () => viaturas.find((v) => v.id === viaturaId) ?? null,
    [viaturaId, viaturas]
  );

  const { data: precosModelo = [] } = useRentingTarifaPrecosModelo();

  const regime = form.watch('regime');
  const isTvde = regime === 'tvde';
  const modeloIdSel = viaturaSelected?.modelo_id ?? null;

  // Tarifas do regime cujo preço cobre o modelo da viatura. O regime filtra
  // primeiro (TVDE só tipo='tvde'; Rent-a-Car só as não-TVDE); depois, se já há
  // viatura, mostram-se só as tarifas onde o modelo tem preço definido —
  // permite alternar entre as tarifas aplicáveis à matrícula.
  const tarifasDoRegime = useMemo(() => {
    const doTipo = tarifas.filter((t) => (isTvde ? t.tipo === 'tvde' : t.tipo !== 'tvde'));
    if (!modeloIdSel) return doTipo;
    return doTipo.filter((t) =>
      precosModelo.some(
        (p) =>
          p.tarifa_id === t.id &&
          p.modelo_id === modeloIdSel &&
          // Rent-a-Car: diário OU mensal conta como "tem preço" (viaturas de
          // longa duração, como carrinhas de carga, só têm preco_mes).
          (isTvde ? p.preco_semana != null : p.preco_dia != null || p.preco_mes != null)
      )
    );
  }, [tarifas, isTvde, modeloIdSel, precosModelo]);

  const tarifaIdSel = form.watch('tarifa_id');
  const dataInicio = form.watch('data_inicio');
  const dataFim = form.watch('data_fim');
  const isLongaDuracao = form.watch('is_longa_duracao');
  const dias = useMemo(() => diferencaDias(dataInicio ?? '', dataFim ?? ''), [dataInicio, dataFim]);

  const tarifaAtual = useMemo(
    () => tarifas.find((t) => t.id === tarifaIdSel) ?? null,
    [tarifaIdSel, tarifas]
  );

  const precoModeloSel = useMemo(() => {
    if (!tarifaIdSel || !modeloIdSel) return null;
    return (
      precosModelo.find((p) => p.tarifa_id === tarifaIdSel && p.modelo_id === modeloIdSel) ?? null
    );
  }, [tarifaIdSel, modeloIdSel, precosModelo]);

  const precoModeloSemanaTvde = isTvde ? (precoModeloSel?.preco_semana ?? null) : null;
  const precoModeloDiaRac = !isTvde ? (precoModeloSel?.preco_dia ?? null) : null;
  const precoModeloMesRac = !isTvde ? (precoModeloSel?.preco_mes ?? null) : null;

  // Faturação-preview (igual à da reserva) — meramente informativa: o valor
  // que fica realmente gravado obedece a `valor_total_manual` quando
  // preenchido (ver calcularBaseAluguerRenting no submit).
  const modeloSemPreco =
    regime !== 'slot' &&
    !!tarifaIdSel &&
    !!modeloIdSel &&
    (isTvde
      ? precoModeloSemanaTvde == null
      : isLongaDuracao
        ? precoModeloMesRac == null
        : precoModeloDiaRac == null);

  const faturacao = useMemo(
    () =>
      calcularFaturacaoRenting(
        regime,
        isLongaDuracao,
        dias,
        tarifaAtual,
        precoModeloSemanaTvde,
        precoModeloDiaRac,
        precoModeloMesRac
      ),
    [
      regime,
      isLongaDuracao,
      dias,
      tarifaAtual,
      precoModeloSemanaTvde,
      precoModeloDiaRac,
      precoModeloMesRac,
    ]
  );

  const [dialogAberto, setDialogAberto] = useState<TipoPedidoAlteracao | null>(null);
  const kmsIncluidos = form.watch('kms_incluidos');
  const kmAdicionalValor = form.watch('km_adicional_valor');
  const franquiaValor = form.watch('franquia_valor');
  const tarifaDiaria = form.watch('tarifa_diaria');

  const valorAtualPorTipo: Record<TipoPedidoAlteracao, number> = {
    kms: kmsIncluidos ?? 0,
    franquia: franquiaValor ?? 0,
    tarifa: tarifaDiaria ?? 0,
  };

  return (
    <div className="space-y-6">
      <SectionRegime form={form} />
      <SectionEmpresaEmissora form={form} />
      <SectionCliente form={form} clientes={clientes} />
      <SectionEntregaRecolha form={form} estacoes={estacoes} />
      <ALDFields idPrefix="contrato" />
      <SectionViatura
        form={form}
        viaturas={viaturas}
        grupos={grupos}
        grupoIdAtual={grupoIdAtual ?? null}
        viaturaLocked={viaturaLocked}
        reservaCodigo={reservaCodigo}
        onViaturaChange={onViaturaChange}
      />

      {/* Tarifa & Faturação — mesmo layout da reserva (cartão de preços por
          modelo + caixa "Faturar ao Cliente"), seguido dos campos próprios do
          contrato (estado operacional/financeiro, tarifa diária, voucher...). */}
      <div>
        <SectionHeader icon={Coins} title="Tarifa & Faturação" accent="emerald" />

        <div className="mb-3">
          <FormField
            control={form.control}
            name="tarifa_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{isTvde ? 'Tarifa TVDE' : 'Tarifa Rent-a-Car'}</FormLabel>
                <Select value={field.value ?? ''} onValueChange={(v) => field.onChange(v || null)}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          isTvde ? 'Selecionar tarifa TVDE...' : 'Selecionar tarifa Rent-a-Car...'
                        }
                      />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {tarifasDoRegime.length === 0 && (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        {modeloIdSel
                          ? 'Nenhuma tarifa cobre o modelo desta viatura.'
                          : isTvde
                            ? 'Nenhuma tarifa TVDE. Cria uma em Renting → Tarifas.'
                            : 'Nenhuma tarifa Rent-a-Car. Cria uma em Renting → Tarifas.'}
                      </div>
                    )}
                    {tarifasDoRegime.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {modeloSemPreco && (
            <Alert variant="destructive" className="mt-3">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Modelo sem preço nesta tarifa</AlertTitle>
              <AlertDescription>
                A viatura escolhida ({viaturaSelected?.marca} {viaturaSelected?.modelo}) não tem
                preço definido na tarifa selecionada. Define o preço deste modelo na tarifa ou
                escolhe outra viatura/tarifa.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {tarifaAtual ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(isTvde
              ? [
                  { label: 'Tarifa', value: tarifaAtual.nome },
                  {
                    label: 'Modelo',
                    value: viaturaSelected
                      ? `${viaturaSelected.marca} ${viaturaSelected.modelo}`
                      : '—',
                  },
                  {
                    label: 'Preço / semana',
                    value:
                      precoModeloSemanaTvde != null ? `${precoModeloSemanaTvde} €` : 'Sem preço',
                  },
                  { label: 'Faturação', value: 'Semanal' },
                ]
              : [
                  { label: 'Tarifa', value: tarifaAtual.nome },
                  {
                    label: 'Modelo',
                    value: viaturaSelected
                      ? `${viaturaSelected.marca} ${viaturaSelected.modelo}`
                      : '—',
                  },
                  {
                    label: 'Preço / dia',
                    value: precoModeloDiaRac != null ? `${precoModeloDiaRac} €` : 'Sem preço',
                  },
                  {
                    label: 'Preço / mês',
                    value: precoModeloMesRac != null ? `${precoModeloMesRac} €` : '—',
                  },
                ]
            ).map((cell) => (
              <div key={cell.label} className="rounded-lg border bg-muted/20 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                  {cell.label}
                </p>
                <p className="mt-0.5 font-semibold truncate">{cell.value}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed bg-muted/10 p-4 text-sm text-muted-foreground">
            {isTvde
              ? 'Seleciona a tarifa TVDE e uma viatura para ver o preço semanal do modelo.'
              : 'Seleciona uma viatura e a tarifa Rent-a-Car para ver o preço do modelo.'}
          </div>
        )}

        {faturacao && (
          <div className="mt-3 rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-brand-navy/10 p-4">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  <Euro className="h-3.5 w-3.5" />
                  Faturar ao cliente
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {faturacao.modo} · {faturacao.descricao}
                  {form.watch('valor_total_manual') != null && ' · substituído por valor manual'}
                </p>
              </div>
              <p className="shrink-0 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                {(form.watch('valor_total_manual') ?? faturacao.valor).toFixed(2)} €
              </p>
            </div>
            {isTvde && (
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-emerald-500/20 pt-3">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CarTaxiFront className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Condutor · conta-corrente semanal
                </p>
                <p className="shrink-0 text-sm font-semibold tabular-nums">
                  {faturacao.semanalCondutor != null
                    ? `${faturacao.semanalCondutor.toFixed(2)} €/sem`
                    : '— sem preço/semana'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* O bloco de valor manual / desconto / voucher foi removido do
          formulário: o preço edita-se agora no card "Resumo do contrato". */}
      <FranquiaKmsFields
        franquiaReadOnly
        kmsReadOnly
        franquiaAction={
          contratoId ? (
            <BotaoPedirAlteracao
              contratoId={contratoId}
              tipo="franquia"
              label="Pedir alteração de franquia"
              icon={Coins}
              onClick={() => setDialogAberto('franquia')}
            />
          ) : null
        }
        kmsAction={
          contratoId ? (
            <BotaoPedirAlteracao
              contratoId={contratoId}
              tipo="kms"
              label="Pedir alteração de kms"
              icon={Gauge}
              onClick={() => setDialogAberto('kms')}
            />
          ) : null
        }
      />
      <CondutoresFields
        regime={regime}
        clientes={clientes}
        motoristas={motoristas}
        clientePrincipalLabel="Cliente do contrato também conduz"
        onCriarNovoCliente={onCriarNovoCliente}
        onCriarNovoMotorista={onCriarNovoMotorista}
      />
      <SectionInfoAdicional form={form} />

      {contratoId && dialogAberto && (
        <PedirAlteracaoContratoDialog
          open={!!dialogAberto}
          onOpenChange={(open) => setDialogAberto(open ? dialogAberto : null)}
          contratoId={contratoId}
          tipo={dialogAberto}
          valorAtual={valorAtualPorTipo[dialogAberto]}
          kmAdicionalValorAtual={dialogAberto === 'kms' ? (kmAdicionalValor ?? null) : undefined}
        />
      )}
    </div>
  );
};
