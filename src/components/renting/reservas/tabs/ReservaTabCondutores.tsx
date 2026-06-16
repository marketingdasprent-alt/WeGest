import type { UseFormReturn } from 'react-hook-form';

import { CondutoresFields } from '@/components/renting/shared/CondutoresFields';

import type { ReservaFormValues } from '../reservaDialog.schema';
import type { ClienteComDocumentos } from '@/types/cliente';
import type { Motorista } from '@/types/motorista';
import type { ReservaRegime } from '@/types/reserva';

interface ReservaTabCondutoresProps {
  // Mantido por compatibilidade com o callsite — o shared usa useFormContext.
  form: UseFormReturn<ReservaFormValues>;
  regime: ReservaRegime;
  clientes: ClienteComDocumentos[];
  motoristas?: Motorista[];
  onCriarNovoCliente?: () => void;
  onCriarNovoMotorista?: () => void;
  onCriarCondutorProvisorio?: () => void;
}

export const ReservaTabCondutores: React.FC<ReservaTabCondutoresProps> = ({
  regime,
  clientes,
  motoristas,
  onCriarNovoCliente,
  onCriarNovoMotorista,
  onCriarCondutorProvisorio,
}) => (
  <CondutoresFields
    regime={regime}
    clientes={clientes}
    motoristas={motoristas}
    clientePrincipalLabel="Cliente da Reserva também conduz"
    onCriarNovoCliente={onCriarNovoCliente}
    onCriarNovoMotorista={onCriarNovoMotorista}
    onCriarCondutorProvisorio={onCriarCondutorProvisorio}
  />
);
