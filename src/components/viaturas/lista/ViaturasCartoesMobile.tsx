import { AcoesLinha } from '@/components/ui/acoes-linha';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { getStatusBadgeClass, getStatusLabel } from '@/lib/viaturas';
import { ComQuemCelula, CombustivelCelula, DocumentosCelula } from './ViaturaCelulas';
import type { ListaViaturasProps, ViaturaLinha } from './tipos';

/** A lista da Frota no telemóvel: um cartão por viatura, com quem a tem à vista. */
export function ViaturasCartoesMobile<V extends ViaturaLinha>({
  viaturas,
  estadoDe,
  situacoes,
  acoesDe,
  onAbrir,
}: ListaViaturasProps<V>) {
  return (
    <div className="space-y-3">
      {viaturas.map((viatura) => {
        const estado = estadoDe(viatura);
        return (
          <Card
            key={viatura.id}
            className="cursor-pointer border-border/50"
            onClick={() => onAbrir(viatura)}
          >
            <CardContent className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-lg font-bold">{viatura.matricula}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {viatura.marca} {viatura.modelo} {viatura.ano && `(${viatura.ano})`}
                  </p>
                </div>
                <Badge variant="outline" className={getStatusBadgeClass(estado)}>
                  {getStatusLabel(estado)}
                </Badge>
              </div>
              <div className="text-sm">
                <ComQuemCelula situacao={situacoes?.get(viatura.id)} estado={estado} />
              </div>
              <div className="flex items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-4 text-muted-foreground">
                  <span>{viatura.km_atual?.toLocaleString('pt-PT') || '0'} km</span>
                  <CombustivelCelula valor={viatura.combustivel} />
                </div>
                <AcoesLinha pararPropagacao acoes={acoesDe(viatura)} />
              </div>
              <div className="text-xs">
                <DocumentosCelula viatura={viatura} />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
