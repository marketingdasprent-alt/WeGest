import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { DanoFotosGallery } from '@/components/viaturas/DanoFotosGallery';

interface ContratoTabDanosProps {
  /** Contrato de renting cujos danos (entrega/recolha) se mostram. */
  contratoId: string | null;
}

interface DanoFoto {
  id: string;
  ficheiro_url: string;
  nome_ficheiro: string | null;
  descricao: string | null;
}

interface DanoContrato {
  id: string;
  descricao: string;
  localizacao: string | null;
  created_at: string;
  data_ocorrencia: string | null;
  valor: number | null;
  observacoes: string | null;
  fotos: DanoFoto[];
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

const fmtEur = (v: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);

export const ContratoTabDanos: React.FC<ContratoTabDanosProps> = ({ contratoId }) => {
  const [danos, setDanos] = useState<DanoContrato[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!contratoId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('viatura_danos')
        .select('id, descricao, localizacao, created_at, data_ocorrencia, valor, observacoes')
        .eq('contrato_renting_id', contratoId)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const comFotos: DanoContrato[] = [];
      for (const d of data || []) {
        const { data: fotos } = await supabase
          .from('viatura_dano_fotos')
          .select('id, ficheiro_url, nome_ficheiro, descricao')
          .eq('dano_id', d.id);
        comFotos.push({ ...(d as DanoContrato), fotos: fotos || [] });
      }
      setDanos(comFotos);
    } catch (err) {
      console.error('Erro ao carregar danos do contrato:', err);
    } finally {
      setLoading(false);
    }
  }, [contratoId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!contratoId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Guarde o contrato primeiro para ver os danos da entrega/recolha.
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (danos.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <CheckCircle2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p className="text-sm">Ainda não há danos registados neste contrato.</p>
        <p className="text-xs mt-1">
          Aparecem aqui os danos e fotos registados na entrega/recolha por token.
        </p>
      </div>
    );
  }

  const totalValor = danos.reduce((s, d) => s + (d.valor || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          {danos.length} {danos.length === 1 ? 'dano registado' : 'danos registados'}
        </div>
        {totalValor > 0 && (
          <span className="text-sm font-semibold text-destructive">{fmtEur(totalValor)}</span>
        )}
      </div>

      {danos.map((dano) => {
        const locLabel = dano.localizacao
          ? (LOCALIZACAO_LABEL[dano.localizacao] ?? dano.localizacao)
          : null;
        const dataDisplay = dano.data_ocorrencia || dano.created_at;
        return (
          <div key={dano.id} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-medium">{dano.descricao}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-muted-foreground">
                  {locLabel && <span>{locLabel}</span>}
                  {locLabel && <span>•</span>}
                  <span>
                    {dataDisplay
                      ? format(new Date(dataDisplay), "d 'de' MMMM 'de' yyyy 'às' HH:mm", {
                          locale: pt,
                        })
                      : 'Data N/D'}
                  </span>
                </div>
              </div>
              {dano.valor ? (
                <Badge
                  variant="outline"
                  className="shrink-0 text-destructive border-destructive/30"
                >
                  {fmtEur(dano.valor)}
                </Badge>
              ) : null}
            </div>

            {dano.observacoes && (
              <p className="text-sm text-muted-foreground bg-muted/50 rounded p-2">
                {dano.observacoes}
              </p>
            )}

            <DanoFotosGallery danoId={dano.id} fotos={dano.fotos} onFotosChange={load} />
          </div>
        );
      })}
    </div>
  );
};
