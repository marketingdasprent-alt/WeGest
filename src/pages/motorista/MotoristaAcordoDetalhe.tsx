import { useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AcordoDetalhePanel } from '@/components/faturacao/acordo/AcordoDetalhePanel';
import { MotoristaLayout } from '@/components/motorista-portal/MotoristaLayout';

export default function MotoristaAcordoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const displayUserName = user?.user_metadata?.full_name || 'Motorista';
  const displayUserPhoto = user?.user_metadata?.avatar_url;

  if (!id) {
    return (
      <div className="rota-liquida">
        <MotoristaLayout userName={displayUserName} userPhoto={displayUserPhoto}>
          <div className="p-6 text-sm text-destructive">Acordo não especificado.</div>
        </MotoristaLayout>
      </div>
    );
  }

  return (
    <div className="rota-liquida">
      <MotoristaLayout userName={displayUserName} userPhoto={displayUserPhoto}>
        <div className="p-6 max-w-3xl mx-auto">
          <h1 className="text-lg font-semibold mb-4">O meu plano de pagamentos</h1>
          <AcordoDetalhePanel acordoId={id} modo="devedor" />
        </div>
      </MotoristaLayout>
    </div>
  );
}
