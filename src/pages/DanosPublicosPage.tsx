import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, TriangleAlert, Car } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';

interface DanoPublico {
  id: string;
  localizacao: string | null;
  descricao: string | null;
  estado: string | null;
  data_registo: string | null;
  data_ocorrencia: string | null;
  valor: number | null;
}
interface DanosPublicosResponse {
  matricula: string;
  danos: DanoPublico[];
  fotos: string[];
}

const LOCALIZACAO_LABEL: Record<string, string> = {
  frente: 'Frente',
  traseira: 'Traseira',
  lateral_esq: 'Lateral Esquerda',
  lateral_dir: 'Lateral Direita',
  teto: 'Teto',
  interior: 'Interior',
  motor: 'Motor',
  outro: 'Outro',
};
const ESTADO_LABEL: Record<string, string> = {
  existente: 'Existente',
  em_reparacao: 'Em reparação',
  reparado: 'Reparado',
  irreparavel: 'Irreparável',
  pendente: 'Pendente',
};

const fmtData = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('T')[0].split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
};

/** Galeria pública de danos de uma viatura, aberta via QR da folha de danos.
 *  Sem login — o acesso é validado pelo token na edge function. */
const DanosPublicosPage = () => {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ['danos-publicos', token],
    enabled: !!token,
    retry: false,
    queryFn: async (): Promise<DanosPublicosResponse> => {
      const { data, error } = await supabase.functions.invoke('danos-publicos', {
        body: { token },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as DanosPublicosResponse;
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto mt-12 max-w-md p-6">
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="space-y-3 p-6 text-center">
            <TriangleAlert className="mx-auto h-10 w-10 text-destructive" />
            <h2 className="text-lg font-semibold">Link inválido ou expirado</h2>
            <p className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : 'Não foi possível carregar as fotos.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-4 flex items-center gap-2">
        <Car className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">
          Danos da viatura {data.matricula && <span className="font-mono">{data.matricula}</span>}
        </h1>
      </div>

      {data.fotos.length > 0 ? (
        <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {data.fotos.map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
              <img
                src={url}
                alt={`Dano ${i + 1}`}
                className="h-32 w-full rounded border object-cover"
              />
            </a>
          ))}
        </div>
      ) : (
        <p className="mb-6 text-sm text-muted-foreground">Sem fotos de danos registadas.</p>
      )}

      {data.danos.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="p-2 font-medium">Localização</th>
                  <th className="p-2 font-medium">Descrição</th>
                  <th className="p-2 font-medium">Estado</th>
                  <th className="p-2 font-medium">Data</th>
                  <th className="p-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {data.danos.map((d) => (
                  <tr key={d.id} className="border-b last:border-0">
                    <td className="p-2">
                      {LOCALIZACAO_LABEL[d.localizacao ?? ''] ?? d.localizacao ?? '—'}
                    </td>
                    <td className="p-2">{d.descricao ?? '—'}</td>
                    <td className="p-2">{ESTADO_LABEL[d.estado ?? ''] ?? d.estado ?? '—'}</td>
                    <td className="p-2">{fmtData(d.data_ocorrencia ?? d.data_registo)}</td>
                    <td className="p-2 text-right">
                      {d.valor != null ? `${Number(d.valor).toFixed(2)} €` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DanosPublicosPage;
