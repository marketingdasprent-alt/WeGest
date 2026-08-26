import { useNavigate } from 'react-router-dom';
import { Wrench, Clock } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useViaturasNaOficina } from '@/hooks/useViaturasNaOficina';

function diasDesde(data: string): number {
  const d = new Date(data);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
}

function fmt(data: string): string {
  const d = new Date(data);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-PT');
}

/**
 * "Na oficina" — viaturas com entrada registada e sem saída.
 *
 * As reparações viviam só dentro da ficha de cada viatura, o que obrigava a
 * abrir carro a carro para saber quem estava parado. Fica no topo da página
 * de Assistência para a pergunta "que viaturas estão fora de serviço?" ter
 * resposta num sítio.
 *
 * Secção própria e não misturada na lista de tickets: uma reparação tem
 * oficina, entrada, saída e custo, e um ticket tem número, categoria,
 * prioridade e responsável. Metê-las na mesma lista obrigava a inventar
 * campos vazios de um lado e do outro.
 */
export function NaOficinaSection() {
  const navigate = useNavigate();
  const { data: naOficina = [], isLoading } = useViaturasNaOficina();

  // Nada na oficina é o caso normal — não se ocupa o topo da página com um
  // cartão vazio.
  if (isLoading || naOficina.length === 0) return null;

  return (
    <Card className="mb-4 border-amber-500/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wrench className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          Na oficina
          <Badge variant="outline" className="ml-1">
            {naOficina.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {naOficina.map((r) => {
            const dias = diasDesde(r.data_entrada);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => navigate(`/viaturas/${r.viatura_id}`)}
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-md border p-3 text-left transition-colors hover:bg-accent/50"
              >
                <span className="font-mono font-semibold">{r.matricula ?? '—'}</span>
                {(r.marca || r.modelo) && (
                  <span className="text-sm text-muted-foreground">
                    {[r.marca, r.modelo].filter(Boolean).join(' ')}
                  </span>
                )}
                {r.oficina && <Badge variant="secondary">{r.oficina}</Badge>}
                {r.descricao && (
                  <span className="min-w-0 flex-1 truncate text-sm">{r.descricao}</span>
                )}
                <span className="ml-auto flex items-center gap-1 whitespace-nowrap text-sm text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {fmt(r.data_entrada)}
                  {/* Os dias parados são a leitura que interessa — uma data
                      sozinha obriga a fazer a conta de cabeça. */}
                  <span
                    className={dias >= 7 ? 'font-medium text-amber-700 dark:text-amber-300' : ''}
                  >
                    ({dias} {dias === 1 ? 'dia' : 'dias'})
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
