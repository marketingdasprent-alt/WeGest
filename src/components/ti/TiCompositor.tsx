import { useRef, useState, type KeyboardEvent } from 'react';
import { Loader2, Paperclip, SendHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { TI_ANEXO_MAX_FICHEIROS, validarListaFicheiros } from '@/lib/tiTicketAnexos';
import { TI_MENSAGEM_MAX_CARACTERES } from '@/lib/tiTicketChat';

interface TiCompositorProps {
  /** Devolve `true` se enviou — só aí se limpa a caixa. */
  onEnviar: (texto: string, ficheiros: File[]) => Promise<boolean>;
  isPending: boolean;
  placeholder?: string;
}

/** Enter envia, Shift+Enter muda de linha. */
export function TiCompositor({ onEnviar, isPending, placeholder }: TiCompositorProps) {
  const [texto, setTexto] = useState('');
  const [ficheiros, setFicheiros] = useState<File[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const podeEnviar = !isPending && (!!texto.trim() || ficheiros.length > 0);

  const escolher = (novos: FileList | null) => {
    if (!novos?.length) return;
    const lista = [...ficheiros, ...Array.from(novos)];
    const erroValidacao = validarListaFicheiros(lista);
    setErro(erroValidacao);
    if (!erroValidacao) setFicheiros(lista);
  };

  const enviar = async () => {
    if (!podeEnviar) return;
    setErro(null);
    if (await onEnviar(texto.trim(), ficheiros)) {
      setTexto('');
      setFicheiros([]);
    }
  };

  const teclas = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void enviar();
    }
  };

  return (
    <div className="space-y-2 border-t border-border bg-card/60 p-3">
      {ficheiros.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {ficheiros.map((f, i) => (
            <span
              key={`${f.name}-${i}`}
              className="flex max-w-[220px] items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs"
            >
              <span className="truncate">{f.name}</span>
              <button
                type="button"
                aria-label={`Remover ${f.name}`}
                onClick={() => setFicheiros((l) => l.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {erro && <p className="text-xs text-destructive">{erro}</p>}
      <div className="flex items-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label="Anexar ficheiro"
          disabled={isPending || ficheiros.length >= TI_ANEXO_MAX_FICHEIROS}
          onClick={() => input.current?.click()}
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.txt"
          className="hidden"
          onChange={(e) => {
            escolher(e.target.files);
            e.target.value = '';
          }}
        />
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={teclas}
          maxLength={TI_MENSAGEM_MAX_CARACTERES}
          placeholder={placeholder ?? 'Escrever mensagem…'}
          aria-label="Mensagem"
          rows={1}
          className="max-h-40 min-h-[40px] resize-none bg-background [field-sizing:content]"
        />
        <Button
          type="button"
          size="icon"
          className="shrink-0"
          aria-label="Enviar mensagem"
          disabled={!podeEnviar}
          onClick={() => void enviar()}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <SendHorizontal className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
