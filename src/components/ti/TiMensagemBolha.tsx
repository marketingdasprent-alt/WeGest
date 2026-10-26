import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { iniciais, type LadoConversa, type TiAnexoVisivel } from '@/lib/tiTicketChat';
import { TiAnexosMensagem } from './TiAnexosMensagem';

interface TiMensagemBolhaProps {
  nome: string;
  texto: string;
  em: string;
  lado: LadoConversa;
  /** É de quem está a ver — vai para a direita. */
  minha: boolean;
  anexos: TiAnexoVisivel[];
  /** Etiqueta por cima do texto, ex.: "Pedido inicial". */
  etiqueta?: string;
}

export function TiMensagemBolha({
  nome,
  texto,
  em,
  lado,
  minha,
  anexos,
  etiqueta,
}: TiMensagemBolhaProps) {
  return (
    <div className={cn('flex gap-2.5', minha && 'flex-row-reverse')}>
      <div
        aria-hidden
        className={cn(
          'mt-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
          lado === 'suporte' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
        )}
      >
        {iniciais(nome)}
      </div>
      <div className={cn('flex min-w-0 max-w-[80%] flex-col gap-1', minha && 'items-end')}>
        <div className="flex items-baseline gap-2 px-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">{nome}</span>
          {lado === 'suporte' && !minha && <span className="text-primary">Suporte</span>}
          <span>{format(new Date(em), 'HH:mm')}</span>
        </div>
        {(texto || etiqueta) && (
          <div
            className={cn(
              'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm',
              minha
                ? 'rounded-tr-sm bg-primary text-primary-foreground'
                : 'rounded-tl-sm border border-border/60 bg-card'
            )}
          >
            {etiqueta && (
              <p
                className={cn(
                  'mb-1 text-[10px] font-semibold uppercase tracking-wider',
                  minha ? 'text-primary-foreground/70' : 'text-muted-foreground'
                )}
              >
                {etiqueta}
              </p>
            )}
            <p className="whitespace-pre-wrap break-words">{texto}</p>
          </div>
        )}
        <TiAnexosMensagem anexos={anexos} minha={minha} />
      </div>
    </div>
  );
}
