import { useState } from 'react';
import { AlertTriangle, ChevronDown, Database, Eye, MessageSquareText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { CampoComTokens } from '../modal/CampoComTokens';
import { paresDoPayload, substituirTokens, tokensUsados } from '../tokens';
import { Campo, Seccao } from './CamposDoPasso';

/**
 * O corpo do email, com os campos disponíveis e a pré-visualização.
 *
 * Numa coluna de 380px não há espaço para três painéis lado a lado, por isso a
 * entrada e a pré-visualização são secções recolhíveis junto do campo a que
 * dizem respeito — em vez de colunas a competir pela largura.
 */
export function Mensagem({
  payload,
  corpo,
  onCorpo,
  regrasQueUsam,
  assunto,
}: {
  payload: Record<string, unknown> | null;
  corpo: string;
  onCorpo: (v: string) => void;
  regrasQueUsam: number;
  assunto: string;
}) {
  const [verPrevia, setVerPrevia] = useState(false);
  const pares = paresDoPayload(payload);
  const campos = pares.filter((p) => p.inserivel).map((p) => p.campo);
  const { usados, desconhecidos } = tokensUsados(corpo, payload);

  return (
    <Seccao titulo="Mensagem" icone={MessageSquareText}>
      {/* O corpo vive em notification_templates, indexado por código — é
          partilhado por todas as regras com o mesmo template. */}
      {regrasQueUsam > 1 && (
        <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 p-2 text-[11px] leading-snug text-warning">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          Partilhada por {regrasQueUsam} automações. Alterá-la muda-as a todas.
        </p>
      )}

      <Collapsible>
        <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/5">
          <span className="flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5" />
            Campos disponíveis ({campos.length})
          </span>
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          {pares.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Esta automação ainda não correu — os campos aparecem depois do primeiro disparo.
            </p>
          ) : (
            <ul className="space-y-1">
              {pares.map((p) => (
                <li key={p.campo}>
                  {p.inserivel ? (
                    <button
                      type="button"
                      draggable
                      aria-label={`Inserir campo ${p.campo}`}
                      title="Arrasta ou carrega para inserir no texto"
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', `{{${p.campo}}}`)}
                      onClick={() => onCorpo(`${corpo}{{${p.campo}}}`)}
                      className="w-full cursor-grab rounded-md border border-border bg-card px-2.5 py-1.5 text-left transition-colors hover:border-primary/50 active:cursor-grabbing"
                    >
                      <span className="block font-mono text-[11px] text-primary">{p.campo}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {p.valor}
                      </span>
                    </button>
                  ) : (
                    <div
                      className="rounded-md border border-dashed border-border px-2.5 py-1.5 opacity-70"
                      title="Campo aninhado — não pode ser usado como token"
                    >
                      <span className="block font-mono text-[11px] text-muted-foreground">
                        {p.campo}
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CollapsibleContent>
      </Collapsible>

      <Campo label="Corpo (email)">
        <CampoComTokens valor={corpo} campos={campos} onAlterar={onCorpo} linhas={7} />

        {/* Que campos é que este texto usa. Responde à pergunta sem esperar
            pelo primeiro disparo — que é quando os "campos disponíveis"
            aparecem. */}
        {usados.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Campos usados
            </p>
            <div className="flex flex-wrap gap-1">
              {usados.map((t) => {
                const suspeito = desconhecidos.includes(t);
                return (
                  <span
                    key={t}
                    title={
                      suspeito
                        ? 'Não veio no último disparo — sai vazio se o nome estiver errado'
                        : 'Existe no último disparo'
                    }
                    className={cn(
                      'rounded border px-1.5 py-0.5 font-mono text-[10px]',
                      suspeito
                        ? 'border-warning/40 bg-warning/10 text-warning'
                        : 'border-border bg-muted/50 text-muted-foreground'
                    )}
                  >
                    {t}
                  </span>
                );
              })}
            </div>
            {desconhecidos.length > 0 && (
              <p className="text-[11px] leading-snug text-warning">
                {desconhecidos.length === 1
                  ? 'Um campo não veio no último disparo.'
                  : `${desconhecidos.length} campos não vieram no último disparo.`}{' '}
                Um nome errado não dá erro — sai vazio no email.
              </p>
            )}
          </div>
        )}
      </Campo>

      <div className="space-y-2">
        <Button
          size="sm"
          variant="outline"
          className="h-7 w-full text-xs"
          onClick={() => setVerPrevia((v) => !v)}
        >
          <Eye className="mr-1.5 h-3.5 w-3.5" />
          {verPrevia ? 'Esconder pré-visualização' : 'Pré-visualizar'}
        </Button>

        {verPrevia && (
          <div className={cn('space-y-2 rounded-md border border-border bg-muted/40 p-2.5')}>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Assunto
              </p>
              <p className="text-[11px] text-foreground">
                {substituirTokens(assunto, payload ?? {}) || '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Corpo
              </p>
              {/* Substituição local, pela MESMA regra do servidor. Não é uma
                  execução: não há endpoint que corra uma regra isolada. */}
              <div
                className="prose prose-sm max-w-none text-[11px] dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: substituirTokens(corpo, payload ?? {}) }}
              />
            </div>
          </div>
        )}
      </div>
    </Seccao>
  );
}
