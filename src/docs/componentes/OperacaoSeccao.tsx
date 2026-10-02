import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { atributosDe } from '../lib/atributos';
import { errosDaOperacao, resumoDaResposta, type Operacao } from '../lib/spec';
import { AtributosTabela } from './AtributosTabela';
import { CopiarBotao } from './CopiarBotao';
import { DocLink } from './DocLink';
import { LanguageTabs } from './LanguageTabs';
import { MethodBadge } from './MethodBadge';
import { ParamTable } from './ParamTable';
import { ResponseTabs } from './ResponseTabs';

/** Duas colunas em xl (texto | código sticky); em baixo de xl o código vem logo a seguir ao cabeçalho. */
export const GRELHA_RECURSO = 'xl:grid xl:grid-cols-[minmax(0,42rem)_28rem] xl:gap-x-12 xl:gap-y-6';
export const COLUNA_CODIGO =
  'mt-6 space-y-6 xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:mt-0 xl:self-start xl:sticky xl:top-20';

const SUB = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';

function rotuloPermissao(op: Operacao): string {
  if (op.publica) return 'pública, sem chave';
  if (op.permissao === 'chave') return 'qualquer chave válida';
  return op.permissao;
}

interface Props {
  op: Operacao;
  ancora: string;
  /** Esquema do objecto da página: a resposta liga para #objecto em vez de repetir os atributos. */
  objecto?: string;
}

/** Uma operação: cabeçalho, permissão, parâmetros, resposta e erros; Pedido e Resposta ao lado. */
export function OperacaoSeccao({ op, ancora, objecto }: Props) {
  const caminho = `/v1${op.caminho === '/' ? '' : op.caminho}`;
  const sucesso = op.respostas.find((r) => r.estado.startsWith('2'));
  const resumo = sucesso && resumoDaResposta(sucesso);
  const ligaAoObjecto = !!resumo?.ref && resumo.ref === objecto;
  const atributos = resumo?.esquema && !ligaAoObjecto ? atributosDe(resumo.esquema) : [];
  const erros = errosDaOperacao(op);

  return (
    <section
      id={ancora}
      aria-labelledby={`${ancora}-titulo`}
      className={`scroll-mt-20 border-t py-12 ${GRELHA_RECURSO}`}
    >
      <header className="space-y-2 xl:col-start-1">
        <div className="flex flex-wrap items-center gap-2">
          <MethodBadge metodo={op.metodo} />
          <h2 id={`${ancora}-titulo`} className="font-mono text-base font-semibold">
            <a href={`#${ancora}`} className="hover:underline">
              {caminho}
            </a>
          </h2>
          <CopiarBotao texto={caminho} rotulo="Copiar o caminho" />
        </div>
        <p className="text-base leading-7">{op.resumo}</p>
        {op.descricao && op.descricao !== op.resumo && (
          <p className="text-sm leading-6 text-muted-foreground">{op.descricao}</p>
        )}
      </header>

      <div className={COLUNA_CODIGO}>
        <LanguageTabs operacao={op} />
        <ResponseTabs respostas={op.respostas} />
      </div>

      <div className="mt-8 space-y-8 xl:col-start-1 xl:mt-0">
        <div className="space-y-2">
          <h3 className={SUB}>Permissão</h3>
          <Badge variant="outline" className="font-mono">
            {rotuloPermissao(op)}
          </Badge>
        </div>

        <div className="space-y-2">
          <h3 className={SUB}>Parâmetros</h3>
          <ParamTable parametros={op.parametros} publica={op.publica} />
        </div>

        {sucesso && resumo && (
          <div className="space-y-2">
            <h3 className={SUB}>Resposta</h3>
            <p className="text-sm leading-6">
              <span className="font-mono tabular-nums">{sucesso.estado}</span> —{' '}
              {ligaAoObjecto ? (
                <a href="#objecto" className="text-primary-text underline">
                  {resumo.rotulo}
                </a>
              ) : (
                resumo.rotulo
              )}
            </p>
            {atributos.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger className="group inline-flex min-h-9 items-center gap-1 rounded-md text-sm text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <ChevronRight className="h-4 w-4 transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none" />
                  Mostrar {atributos.length} atributos
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-1 border-l pl-4">
                  <AtributosTabela atributos={atributos} />
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        )}

        {erros.length > 0 && (
          <div className="space-y-2">
            <h3 className={SUB}>Erros possíveis</h3>
            <dl className="text-sm">
              {erros.map((e) => (
                <div
                  key={e.estado}
                  className="grid grid-cols-[3rem_1fr] gap-x-4 gap-y-1 border-t py-2 md:grid-cols-[3rem_12rem_1fr]"
                >
                  <dt className="font-mono tabular-nums">{e.estado}</dt>
                  <dd>
                    <DocLink
                      para={`erros#${e.codigo}`}
                      className="font-mono text-primary-text underline"
                    >
                      {e.codigo}
                    </DocLink>
                  </dd>
                  <dd className="col-start-2 text-muted-foreground md:col-start-3">
                    {e.descricao}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </section>
  );
}
