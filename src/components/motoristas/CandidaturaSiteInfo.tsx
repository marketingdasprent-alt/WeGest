import { Globe } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { type CandidaturaSiteCampos, detalhesCandidaturaSite } from '@/utils/candidaturaSite';

interface SeloCandidaturaSiteProps {
  origem: CandidaturaSiteCampos['origem'];
}

/** Selo "Site" para as candidaturas que chegaram pela API; nada para as do portal. */
export function SeloCandidaturaSite({ origem }: SeloCandidaturaSiteProps) {
  if (origem !== 'site') return null;
  return (
    <Badge variant="outline" className="gap-1">
      <Globe className="h-3 w-3" />
      Site
    </Badge>
  );
}

interface CandidaturaSiteInfoProps {
  candidatura: CandidaturaSiteCampos;
}

/** O que o motorista escolheu no formulário do site (modelo, início, formação TVDE). */
export function CandidaturaSiteInfo({ candidatura }: CandidaturaSiteInfoProps) {
  if (candidatura.origem !== 'site') return null;
  const linhas = detalhesCandidaturaSite(candidatura);
  return (
    <div>
      <h4 className="font-semibold mb-3 flex items-center gap-2">
        <Globe className="h-4 w-4" />
        Enviada pelo site
        <SeloCandidaturaSite origem={candidatura.origem} />
      </h4>
      {linhas.length > 0 && (
        <div className="grid grid-cols-2 gap-3 text-sm bg-muted/30 rounded-lg p-4">
          {linhas.map((l) => (
            <div key={l.rotulo}>
              <span className="text-muted-foreground text-xs">{l.rotulo}</span>
              <p className="font-medium">{l.valor}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
