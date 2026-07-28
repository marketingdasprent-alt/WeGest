import { useParams } from 'react-router-dom';
import { AcordoDetalhePanel } from '@/components/faturacao/acordo/AcordoDetalhePanel';

export default function AcordoDetalhe() {
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return <div className="p-6 text-sm text-destructive">Acordo não especificado.</div>;
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-lg font-semibold mb-4">Plano de pagamentos</h1>
      <AcordoDetalhePanel acordoId={id} />
    </div>
  );
}
