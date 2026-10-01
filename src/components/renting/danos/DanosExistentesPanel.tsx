import { useState } from 'react';
import { Image as ImageIcon, Loader2 } from 'lucide-react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useDanosExistentes, type DanoExistente } from '@/hooks/useDanosExistentes';
import { LOCALIZACAO_LABEL } from '@/utils/entrega';
import { cn } from '@/lib/utils';

/**
 * Danos que a viatura JÁ TRAZIA de contratos anteriores, no fecho do contrato
 * actual.
 *
 * Existe para responder a uma pergunta que se faz sempre no balcão: "este
 * risco já cá estava?". Sem isto, quem fecha o contrato não tem como saber, e
 * ou cobra ao motorista um dano que não é dele, ou deixa passar um que é.
 *
 * NUNCA mostra o valor. Estes danos não são deste motorista e o valor deles
 * não entra na conta dele — pô-lo no ecrã do fecho era um convite a somá-lo à
 * dívida por engano. Quem precisa do valor vai ao separador Danos da viatura,
 * que é onde se gere a cobrança.
 *
 * Só de leitura: aqui não se edita nem se apaga nada.
 */

interface Props {
  viaturaId: string | null | undefined;
  /** Contrato em curso, se conhecido — os danos que ELE registou não entram. */
  contratoId?: string | null;
  className?: string;
}

export function DanosExistentesPanel({ viaturaId, contratoId, className }: Props) {
  const [aberto, setAberto] = useState<DanoExistente | null>(null);

  const { data: danos = [], isLoading } = useDanosExistentes(viaturaId, contratoId);

  const local = (v: string | null) => (v ? (LOCALIZACAO_LABEL[v] ?? v) : null);
  const data = (v: string | null) =>
    v ? new Date(`${v}T00:00:00`).toLocaleDateString('pt-PT') : null;

  // A carregar ou sem nada: uma linha, sem acordeão. Um painel que se abre
  // para dizer "não há nada" só rouba um clique.
  if (isLoading) {
    return (
      <div className={cn('flex items-center gap-2 py-1 text-xs text-muted-foreground', className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> A procurar danos anteriores…
      </div>
    );
  }
  if (danos.length === 0) {
    return (
      <p className={cn('text-xs italic text-muted-foreground', className)}>
        A viatura não traz danos de contratos anteriores.
      </p>
    );
  }

  return (
    <div className={className}>
      {/* Fechado por omissão: o que se vem aqui fazer é registar danos NOVOS.
          Os antigos são consulta — a contagem no cabeçalho já diz se vale a
          pena abrir. */}
      <Accordion type="single" collapsible>
        <AccordionItem value="existentes" className="border-none">
          <AccordionTrigger className="py-1.5 text-xs hover:no-underline">
            <span className="flex items-center gap-2">
              <Label className="cursor-pointer text-xs">Danos já existentes</Label>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {danos.length}
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-2 pb-2">
            <div className="space-y-1.5">
              {danos.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setAberto(d)}
                  className="flex w-full items-center gap-2 rounded-md border border-border bg-background/60 p-1.5 text-left transition-colors hover:border-primary/50 hover:bg-muted"
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded border border-border bg-muted">
                    {d.fotos[0] ? (
                      <img
                        src={d.fotos[0].url}
                        alt={d.descricao}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <ImageIcon className="h-3.5 w-3.5 text-muted-foreground/60" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{d.descricao}</p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {[local(d.localizacao), data(d.data_registo)].filter(Boolean).join(' · ') ||
                        'sem detalhe'}
                      {d.fotos.length > 1 ? ` · ${d.fotos.length} fotos` : ''}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Dialog open={!!aberto} onOpenChange={(v) => !v && setAberto(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Dano já existente</DialogTitle>
          </DialogHeader>
          {aberto && (
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Descrição
                </p>
                <p>{aberto.descricao}</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Onde</p>
                  <p>{local(aberto.localizacao) ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Registado
                  </p>
                  <p>{data(aberto.data_registo) ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Estado
                  </p>
                  <p className="capitalize">{aberto.estado.replace(/_/g, ' ')}</p>
                </div>
              </div>
              {aberto.observacoes && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Observações
                  </p>
                  <p className="whitespace-pre-wrap">{aberto.observacoes}</p>
                </div>
              )}

              {aberto.fotos.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Fotos ({aberto.fotos.length})
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {aberto.fotos.map((f) => (
                      <a
                        key={f.id}
                        href={f.url}
                        target="_blank"
                        rel="noreferrer"
                        className="group block overflow-hidden rounded border border-border"
                        title={f.descricao || f.nome}
                      >
                        <img
                          src={f.url}
                          alt={f.descricao || f.nome}
                          loading="lazy"
                          className="h-24 w-full object-cover transition-transform group-hover:scale-105"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
