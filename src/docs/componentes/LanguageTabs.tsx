import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDocs } from '../contexto';
import { LINGUAGENS, exemploDePedido, type Linguagem } from '../lib/exemplosCodigo';
import type { LinguagemCodigo } from '../lib/realce';
import { SERVIDOR, type Operacao } from '../lib/spec';
import { CodeBlock } from './CodeBlock';

const REALCE: Record<Linguagem, LinguagemCodigo> = {
  curl: 'bash',
  javascript: 'javascript',
  php: 'php',
};

/** Cartão "Pedido": cURL · JavaScript · PHP; a escolha é global entre páginas. */
export function LanguageTabs({ operacao }: { operacao: Operacao }) {
  const { linguagem, escolherLinguagem } = useDocs();
  return (
    <Tabs value={linguagem} onValueChange={(v) => escolherLinguagem(v as Linguagem)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Pedido</p>
        <TabsList className="h-9 bg-transparent p-0">
          {LINGUAGENS.map((l) => (
            <TabsTrigger
              key={l.id}
              value={l.id}
              className="rounded-none border-b-2 border-transparent text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              {l.rotulo}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {LINGUAGENS.map((l) => (
        <TabsContent key={l.id} value={l.id} className="mt-0">
          <CodeBlock
            codigo={exemploDePedido(operacao, l.id, SERVIDOR)}
            linguagem={REALCE[l.id]}
            etiqueta={l.id === 'javascript' ? 'Node.js (servidor)' : l.rotulo}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
