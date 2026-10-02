import { Badge } from '@/components/ui/badge';
import { CodeBlock } from '../componentes/CodeBlock';
import { C, GuiaPagina, Seccao } from '../componentes/GuiaPagina';
import { ERROS_FASE_A } from '../lib/erros';

const ENVELOPE = JSON.stringify(
  { erro: { codigo: 'SEM_PERMISSAO', mensagem: 'A chave não tem a permissão catalogo:read.' } },
  null,
  2
);

export default function Erros() {
  return (
    <GuiaPagina
      slug="erros"
      introducao={<p>Todos os erros têm o mesmo formato e um código estável.</p>}
    >
      <Seccao id="envelope" titulo="O envelope de erro">
        <p>
          Decida pelo <C>codigo</C>, que não muda. A <C>mensagem</C> é para registo e pode mudar;
          não a mostre ao cliente final. <C>detalhes</C> só aparece em alguns códigos.
        </p>
        <CodeBlock codigo={ENVELOPE} linguagem="json" etiqueta="403" />
      </Seccao>
      <Seccao id="codigos" titulo="Códigos">
        <div className="space-y-6">
          {ERROS_FASE_A.map((e) => (
            <div key={e.codigo} id={e.codigo} className="scroll-mt-20 border-t pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <code className="font-mono text-sm font-semibold">{e.codigo}</code>
                {e.estados.map((s) => (
                  <Badge key={s} variant="secondary" className="font-mono tabular-nums">
                    {s}
                  </Badge>
                ))}
              </div>
              <dl className="mt-2 grid gap-1 text-sm leading-6 sm:grid-cols-[8rem_1fr]">
                <dt className="text-muted-foreground">Quando</dt>
                <dd>{e.quando}</dd>
                <dt className="text-muted-foreground">O que fazer</dt>
                <dd>{e.fazer}</dd>
              </dl>
            </div>
          ))}
        </div>
      </Seccao>
    </GuiaPagina>
  );
}
