import type React from 'react';
import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Gauge, Coins, CircleDollarSign } from 'lucide-react';

import type { ClienteComDocumentos } from '@/types/cliente';
import type { Motorista } from '@/types/motorista';
import type { Estacao } from '@/hooks/useEstacoes';
import type { ViaturaBasic } from '@/hooks/useViaturas';
import type { RentingGrupoMin } from '@/hooks/useRentingGruposTarifas';
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
  const regime = form.watch('regime');
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
