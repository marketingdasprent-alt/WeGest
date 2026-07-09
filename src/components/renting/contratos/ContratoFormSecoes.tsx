import type React from 'react';
import { useMemo, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Gauge, Coins, CircleDollarSign } from 'lucide-react';

import type { ClienteComDocumentos } from '@/types/cliente';
import type { Motorista } from '@/types/motorista';
import type { Estacao } from '@/hooks/useEstacoes';
import type { ViaturaBasic } from '@/hooks/useViaturas';
import type { RentingGrupoMin } from '@/hooks/useRentingGruposTarifas';
import {
  useRentingTarifasMin,
  useRentingTarifaPrecosModelo,
} from '@/hooks/useRentingGruposTarifas';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { SectionGeral } from './SectionGeral';
import { SectionRegime } from './SectionRegime';
import { SectionViatura } from './SectionViatura';
import { SectionTitle } from './SectionTitle';

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
          (isTvde ? p.preco_semana != null : p.preco_dia != null)
      )
    );
  }, [tarifas, isTvde, modeloIdSel, precosModelo]);

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

      {/* Seleção de Tarifa — o regime filtra primeiro (TVDE / Rent-a-Car) e só
          aparecem as tarifas cujo preço cobre o modelo da viatura escolhida.
          O preço vem por modelo da própria tarifa. */}
      <div className="space-y-4">
        <SectionTitle>Tarifa</SectionTitle>
        <FormField
          control={form.control}
          name="tarifa_id"
          render={({ field }) => (
            <FormItem className="max-w-xs">
              <FormLabel>{isTvde ? 'Tarifa TVDE' : 'Tarifa Rent-a-Car'}</FormLabel>
              {tarifasDoRegime.length === 0 ? (
                <div className="text-sm text-muted-foreground p-2 border rounded">
                  {modeloIdSel
                    ? 'Nenhuma tarifa cobre o modelo desta viatura. Define o preço do modelo na tarifa em Renting → Tarifas.'
                    : isTvde
                      ? 'Nenhuma tarifa TVDE. Cria uma em Renting → Tarifas.'
                      : 'Nenhuma tarifa Rent-a-Car. Cria uma em Renting → Tarifas.'}
                </div>
              ) : (
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
                    {tarifasDoRegime.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <SectionGeral
        form={form}
        tarifaReadOnly
        tarifaAction={
          contratoId ? (
            <BotaoPedirAlteracao
              contratoId={contratoId}
              tipo="tarifa"
              label="Pedir alteração de tarifa"
              icon={CircleDollarSign}
              onClick={() => setDialogAberto('tarifa')}
            />
          ) : null
        }
      />
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
