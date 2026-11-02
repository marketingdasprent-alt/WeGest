import { AlertTriangle } from 'lucide-react';
import { useContratosEmCursoDoMotorista } from '@/hooks/useContratoCondutores';
import { rotuloContrato } from '@/lib/avisosMotoristaInativo';

interface AvisoContratosEmCursoProps {
  motoristaId: string;
}

/** Ao inativar: o motorista ainda é condutor de contratos em curso, que não fecham sozinhos. */
export const AvisoContratosEmCurso: React.FC<AvisoContratosEmCursoProps> = ({ motoristaId }) => {
  const { data: contratos = [] } = useContratosEmCursoDoMotorista(motoristaId);
  if (contratos.length === 0) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <p>
        Continua como condutor em <strong>{contratos.map(rotuloContrato).join(', ')}</strong>.
        Inativar não o retira do contrato: regista a entrega da viatura (ou retira-o do contrato),
        senão o aluguer continua a contar-lhe e o contrato aparece para renovar.
      </p>
    </div>
  );
};
