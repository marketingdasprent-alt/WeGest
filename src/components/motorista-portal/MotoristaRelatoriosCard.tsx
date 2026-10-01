import { useState } from 'react';
import { Download, Eye, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useMotoristaResumosSemanais } from '@/hooks/useMotoristaResumosSemanais';

interface MotoristaRelatoriosCardProps {
  motoristaId: string;
}

const MOSTRAR = 6;

const eur = (v: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);

const dia = (iso: string, fmt: string) => format(new Date(`${iso}T00:00:00`), fmt, { locale: pt });

/**
 * Os acertos semanais fechados — o número que conta para o pagamento, o mesmo
 * do Relatório de Pagamento e da conta corrente.
 *
 * Era um cartão-contador que abria um diálogo com a lista, e nunca chegou a
 * ser mostrado no painel. Agora é a lista, directa, na secção Contas: as
 * últimas semanas à vista e "Ver todos" para o resto.
 */
export function MotoristaRelatoriosCard({ motoristaId }: MotoristaRelatoriosCardProps) {
  const { data: acertos = [], isLoading, error } = useMotoristaResumosSemanais(motoristaId);
  const [todos, setTodos] = useState(false);
  const visiveis = todos ? acertos : acertos.slice(0, MOSTRAR);

  async function urlAssinada(url: string) {
    const { data, error: erro } = await supabase.storage
      .from('motorista-recibos')
      .createSignedUrl(url, 3600);
    if (erro) throw erro;
    return data.signedUrl;
  }

  async function handleView(url: string) {
    try {
      window.open(await urlAssinada(url), '_blank');
    } catch (e: unknown) {
      console.error('[MotoristaRelatoriosCard] Erro ao abrir folha:', e);
      toast.error('Não foi possível abrir a folha');
    }
  }

  async function handleDownload(url: string, nome: string) {
    try {
      const resposta = await fetch(await urlAssinada(url));
      const blob = await resposta.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = nome;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
      toast.success('Download iniciado');
    } catch (e: unknown) {
      console.error('[MotoristaRelatoriosCard] Erro ao descarregar folha:', e);
      toast.error('Não foi possível descarregar a folha');
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
            Acertos semanais
          </CardTitle>
          {acertos.length > MOSTRAR && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setTodos((t) => !t)}
            >
              {todos ? 'Ver menos' : `Ver todos (${acertos.length})`}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          O valor fechado de cada semana — é este que conta para o pagamento.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="p-4 text-sm text-destructive">
            Não foi possível carregar os acertos. Tente daqui a pouco.
          </p>
        ) : acertos.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Ainda não há semanas fechadas. Assim que o gestor fechar a primeira, aparece aqui.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {visiveis.map((r) => (
              <li key={r.semanaInicio} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {dia(r.semanaInicio, 'd MMM')} a {dia(r.semanaFim, 'd MMM yyyy')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.liquido < 0 ? 'Em dívida' : 'A receber'}
                  </p>
                </div>
                <p
                  className={cn(
                    'shrink-0 text-sm font-semibold tabular-nums',
                    r.liquido < 0 ? 'text-destructive' : 'text-emerald-600'
                  )}
                >
                  {eur(r.liquido)}
                </p>
                {/* Os botões só aparecem quando há mesmo um PDF gerado. */}
                {r.ficheiroUrl && (
                  <div className="flex shrink-0 gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleView(r.ficheiroUrl!)}
                      aria-label="Ver folha"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleDownload(r.ficheiroUrl!, `Resumo_${r.semanaInicio}.pdf`)}
                      aria-label="Descarregar folha"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
