import type { UseFormReturn } from 'react-hook-form';
import { CondutoresFields } from '@/components/renting/shared/CondutoresFields';
import type { ClienteComDocumentos } from '@/types/cliente';
import type { Motorista } from '@/types/motorista';
import type { ContratoFormValues } from '@/components/renting/contratos/contratoForm.schema';
import type { ReservaRegime } from '@/types/reserva';

interface ContratoTabCondutoresProps {
  form: UseFormReturn<ContratoFormValues>;
  clientes: ClienteComDocumentos[];
  motoristas: Motorista[];
  regime: ReservaRegime;
  onCriarNovoCliente?: () => void;
  onCriarNovoMotorista?: () => void;
}

/**
 * Separador "Condutores" do formulário de contrato renting.
 * Renderiza o componente CondutoresFields com suporte
 * tanto para condutores-cliente (rent-a-car) como motoristas (TVDE).
 */
export const ContratoTabCondutores: React.FC<ContratoTabCondutoresProps> = ({
  clientes,
  motoristas,
  regime,
  onCriarNovoCliente,
  onCriarNovoMotorista,
}) => {
  return (
    <CondutoresFields
      regime={regime}
      clientes={clientes}
      motoristas={motoristas}
      onCriarNovoCliente={onCriarNovoCliente}
      onCriarNovoMotorista={onCriarNovoMotorista}
    />
  );
};
