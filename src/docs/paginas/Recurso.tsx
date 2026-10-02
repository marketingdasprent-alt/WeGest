import { atributosDe } from '../lib/atributos';
import { recurso } from '../lib/navegacao';
import { esquemaComponente, operacao } from '../lib/spec';
import { AtributosTabela } from '../componentes/AtributosTabela';
import { CodeBlock } from '../componentes/CodeBlock';
import { useTituloDocs } from '../lib/useTituloDocs';
import { COLUNA_CODIGO, GRELHA_RECURSO, OperacaoSeccao } from '../componentes/OperacaoSeccao';
import { NaoEncontrada } from './EstadosPagina';

/** Página de um recurso, à Stripe: o objecto e uma secção por operação. */
export default function Recurso({ slug }: { slug: string }) {
  const r = recurso(slug);
  useTituloDocs(r?.titulo ?? 'Página inexistente');
  if (!r) return <NaoEncontrada />;

  const esquema = r.objecto ? esquemaComponente(r.objecto) : undefined;
  return (
    <div className="xl:max-w-[calc(42rem+28rem+3rem)]">
      <header className="max-w-3xl space-y-3 pb-12 xl:max-w-[42rem]">
        <p className="text-sm text-muted-foreground">Recursos / {r.titulo}</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
          {r.titulo}
        </h1>
        <p className="text-base leading-7 text-muted-foreground">{r.introducao}</p>
      </header>

      {r.objecto && esquema && (
        <section
          id="objecto"
          aria-labelledby="objecto-titulo"
          className={`scroll-mt-20 border-t py-12 ${GRELHA_RECURSO}`}
        >
          <h2
            id="objecto-titulo"
            className="font-display text-2xl font-semibold tracking-tight xl:col-start-1"
          >
            <a href="#objecto" className="hover:underline">
              O objecto {r.objecto}
            </a>
          </h2>
          {esquema.example !== undefined && (
            <div className={COLUNA_CODIGO}>
              <CodeBlock
                codigo={JSON.stringify(esquema.example, null, 2)}
                linguagem="json"
                etiqueta={r.objecto}
              />
            </div>
          )}
          <div className="mt-6 xl:col-start-1 xl:mt-0">
            <AtributosTabela atributos={atributosDe(esquema)} />
          </div>
        </section>
      )}

      {r.operacoes.map((o) => (
        <OperacaoSeccao key={o.id} op={operacao(o.id)} ancora={o.ancora} objecto={r.objecto} />
      ))}
    </div>
  );
}
