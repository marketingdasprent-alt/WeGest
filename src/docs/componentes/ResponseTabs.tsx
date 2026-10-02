import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { Resposta } from '../lib/spec';
import { CodeBlock } from './CodeBlock';

/** Cartão "Resposta": um separador por estado HTTP, com o número sempre escrito. */
export function ResponseTabs({ respostas }: { respostas: Resposta[] }) {
  const comExemplo = respostas.filter((r) => r.exemplo !== undefined);
  if (comExemplo.length === 0) return null;
  return (
    <Tabs defaultValue={comExemplo[0].estado}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Resposta</p>
        <TabsList className="h-auto flex-wrap justify-start bg-transparent p-0">
          {comExemplo.map((r) => (
            <TabsTrigger
              key={r.estado}
              value={r.estado}
              className="gap-1.5 rounded-none border-b-2 border-transparent font-mono text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'h-2 w-2 rounded-full',
                  r.estado.startsWith('2') ? 'bg-success' : 'bg-destructive'
                )}
              />
              {r.estado}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {comExemplo.map((r) => (
        <TabsContent key={r.estado} value={r.estado} className="mt-0">
          <CodeBlock
            codigo={JSON.stringify(r.exemplo, null, 2)}
            linguagem="json"
            etiqueta={`${r.estado} — ${r.descricao}`}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
