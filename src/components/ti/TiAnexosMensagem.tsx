import { FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ehImagem, type TiAnexoVisivel } from '@/lib/tiTicketChat';

interface TiAnexosMensagemProps {
  anexos: TiAnexoVisivel[];
  /** Alinha à direita, como a bolha de quem está a ver. */
  minha: boolean;
}

/** Imagens em miniatura, o resto como ficheiro. Sem URL ainda = a assinar. */
export function TiAnexosMensagem({ anexos, minha }: TiAnexosMensagemProps) {
  if (anexos.length === 0) return null;
  const imagens = anexos.filter((a) => ehImagem(a.mime_type));
  const ficheiros = anexos.filter((a) => !ehImagem(a.mime_type));

  return (
    <div className={cn('flex flex-col gap-1.5', minha ? 'items-end' : 'items-start')}>
      {imagens.length > 0 && (
        <div className={cn('flex flex-wrap gap-1.5', minha && 'justify-end')}>
          {imagens.map((a) =>
            a.url ? (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                title={a.nome}
                className="block overflow-hidden rounded-lg border border-border/60 transition hover:opacity-90"
              >
                <img src={a.url} alt={a.nome} className="h-32 w-auto max-w-[220px] object-cover" />
              </a>
            ) : (
              <div
                key={a.id}
                className="flex h-32 w-32 items-center justify-center rounded-lg border border-border/60 bg-muted/40"
              >
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )
          )}
        </div>
      )}
      {ficheiros.map((a) => (
        <a
          key={a.id}
          href={a.url ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!a.url}
          className={cn(
            'flex max-w-[260px] items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-2.5 py-1.5 text-xs transition hover:bg-muted',
            !a.url && 'pointer-events-none opacity-60'
          )}
        >
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{a.nome}</span>
        </a>
      ))}
    </div>
  );
}
