import type { UseFormReturn } from 'react-hook-form';
import type { ClienteComDocumentos } from '@/types/cliente';
import type { Motorista } from '@/types/motorista';
import type { Estacao } from '@/hooks/useEstacoes';
import type { ViaturaBasic } from '@/hooks/useViaturas';
import type { RentingGrupoMin } from '@/hooks/useRentingGruposTarifas';
import { ContratoFormSecoes } from '@/components/renting/contratos/ContratoFormSecoes';
import type { ContratoFormValues } from '@/components/renting/contratos/contratoForm.schema';

interface ContratoTabGeralProps {
  form: UseFormReturn<ContratoFormValues>;
  clientes: ClienteComDocumentos[];
  motoristas: Motorista[];
  viaturas: ViaturaBasic[];
  grupos: RentingGrupoMin[];
  grupoIdAtual?: string | null;
  estacoes: Estacao[];
  viaturaLocked?: boolean;
  reservaCodigo?: number | null;
  onViaturaChange?: (viaturaId: string) => void;
  contratoId?: string | null;
  onCriarNovoCliente?: () => void;
  onCriarNovoMotorista?: () => void;
}

/**
 * Separador "Geral" do formulário de contrato renting.
 * Delega no ContratoFormSecoes que compõe todas as secções
 * (regime, cliente, viatura, tarifa, observações, etc.).
 */
export const ContratoTabGeral: React.FC<ContratoTabGeralProps> = ({
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
  contratoId,
  onCriarNovoCliente,
  onCriarNovoMotorista,
}) => {
  return (
    <ContratoFormSecoes
      form={form}
      clientes={clientes}
      motoristas={motoristas}
      viaturas={viaturas}
      grupos={grupos}
      grupoIdAtual={grupoIdAtual}
      estacoes={estacoes}
      viaturaLocked={viaturaLocked}
      reservaCodigo={reservaCodigo}
      onViaturaChange={onViaturaChange}
      contratoId={contratoId}
      onCriarNovoCliente={onCriarNovoCliente}
      onCriarNovoMotorista={onCriarNovoMotorista}
    />
  );
};
