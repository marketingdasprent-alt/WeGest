import { SERVIDOR } from '../lib/spec';
import { CopiarBotao } from './CopiarBotao';

/** A base URL da API, copiável. */
export function BaseUrlCard() {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Base URL
        </p>
        <p className="truncate font-mono text-sm">{SERVIDOR}</p>
      </div>
      <CopiarBotao texto={SERVIDOR} rotulo="Copiar a base URL" />
    </div>
  );
}
