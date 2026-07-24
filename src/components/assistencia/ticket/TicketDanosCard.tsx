import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { useTicketDanos } from '@/hooks/useTicketDanos';
import { DanoCategoriaBadge } from '@/components/viaturas/DanoCategoriaBadge';
import { DanoFotosGallery } from '@/components/viaturas/DanoFotosGallery';

interface TicketDanosCardProps {
  ticketId: string;
}

/** Danos ligados a este ticket (viatura_danos.ticket_id), read-only — hoje
 * só visíveis na aba de Danos da Viatura, sem ligação ao ticket. Não
 * renderiza nada se o ticket não tiver danos ligados. */
export function TicketDanosCard({ ticketId }: TicketDanosCardProps) {
  const { data: danos, isLoading } = useTicketDanos(ticketId);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!danos || danos.length === 0) return null;

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5" /> Danos Ligados
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {danos.map((dano) => (
          <div key={dano.id} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">{dano.descricao}</p>
              <DanoCategoriaBadge categoria={dano.categoria} />
            </div>
            <p className="text-xs text-muted-foreground">
              {format(new Date(dano.data_ocorrencia || dano.created_at), "d 'de' MMMM 'de' yyyy", {
                locale: pt,
              })}
            </p>
            <DanoFotosGallery
              danoId={dano.id}
              fotos={dano.fotos}
              onFotosChange={() => {}}
              readonly
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
