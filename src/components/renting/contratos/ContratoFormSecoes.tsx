import type React from 'react';
import type { UseFormReturn } from 'react-hook-form';

import type { ClienteComDocumentos } from '@/types/cliente';
import type { Motorista } from '@/types/motorista';
import type { Estacao } from '@/hooks/useEstacoes';
import type { ViaturaBasic } from '@/hooks/useViaturas';
import type { RentingGrupoMin } from '@/hooks/useRentingGruposTarifas';
import { ALDFields } from '@/components/renting/shared/ALDFields';
import { CondutoresFields } from '@/components/renting/shared/CondutoresFields';
import { FranquiaKmsFields } from '@/components/renting/shared/FranquiaKmsFields';
import type { ContratoFormValues } from './contratoForm.schema';
import { SectionCliente } from './SectionCliente';
import { SectionEmpresaEmissora } from './SectionEmpresaEmissora';
import { SectionEntregaRecolha } from './SectionEntregaRecolha';
import { SectionInfoAdicional } from './SectionInfoAdicional';
import { SectionGeral } from './SectionGeral';
import { SectionRegime } from './SectionRegime';
import { SectionViatura } from './SectionViatura';

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
}) => {
  const regime = form.watch('regime');
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
      <FranquiaKmsFields />
      <SectionGeral form={form} />
      <CondutoresFields
        regime={regime}
        clientes={clientes}
        motoristas={motoristas}
        clientePrincipalLabel="Cliente do contrato também conduz"
        onCriarNovoCliente={onCriarNovoCliente}
        onCriarNovoMotorista={onCriarNovoMotorista}
      />
      <SectionInfoAdicional form={form} />
    </div>
  );
};
