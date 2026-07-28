import { useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGoBack } from '@/hooks/useGoBack';
import { AcordoDetalhePanel } from '@/components/faturacao/acordo/AcordoDetalhePanel';

export default function AcordoDetalhe() {
  const { id } = useParams<{ id: string }>();
  // Fallback: página de Faturação (Administrativo) — é de lá que este acordo é
  // normalmente aberto (botão "Parcelar"/lista de cobranças), mesmo padrão de
  // useGoBack já usado nas outras páginas de detalhe (ex.: ViaturaDetalhe).
  const goBack = useGoBack('/administrativo/faturacao');

  if (!id) {
    return <div className="p-6 text-sm text-destructive">Acordo não especificado.</div>;
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-4">
        <Button variant="ghost" size="icon" onClick={goBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">Plano de pagamentos</h1>
      </div>
      <AcordoDetalhePanel acordoId={id} />
    </div>
  );
}
