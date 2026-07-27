import { Card, CardContent } from '@/components/ui/card';
import { Phone, Mail, MapPin } from 'lucide-react';
import type { Motorista } from '@/pages/Motoristas';
import { MotoristaStatusBadge } from '@/lib/statusBadges';

interface MotoristaCardProps {
  motorista: Motorista;
  onClick: () => void;
}

export function MotoristaCard({ motorista, onClick }: MotoristaCardProps) {
  return (
    <Card
      className="cursor-pointer hover:bg-muted/50 transition-colors active:scale-[0.98]"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Code and Name */}
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                #{String(motorista.codigo).padStart(3, '0')}
              </span>
              <MotoristaStatusBadge
                statusAtivo={motorista.status_ativo}
                className="text-[10px] px-1.5 py-0"
              />
            </div>

            <h3 className="font-semibold text-base truncate">{motorista.nome}</h3>

            {/* Contact Info */}
            <div className="mt-2 space-y-1">
              {motorista.telefone && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{motorista.telefone}</span>
                </div>
              )}

              {motorista.email && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{motorista.email}</span>
                </div>
              )}

              {motorista.cidade && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{motorista.cidade}</span>
                </div>
              )}
            </div>
          </div>

          {/* NIF on the right */}
          {motorista.nif && (
            <div className="text-right shrink-0">
              <span className="text-xs text-muted-foreground">NIF</span>
              <p className="text-sm font-medium">{motorista.nif}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
