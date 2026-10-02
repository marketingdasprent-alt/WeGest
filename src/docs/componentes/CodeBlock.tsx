import { CLASSE_DO_TOKEN, realcar, type LinguagemCodigo } from '../lib/realce';
import { CopiarBotao } from './CopiarBotao';

interface Props {
  codigo: string;
  linguagem: LinguagemCodigo;
  /** Etiqueta do cabeçalho (ex.: "cURL", "200"). */
  etiqueta?: string;
  numerarLinhas?: boolean;
}

/** Bloco de código escuro nos dois temas; scroll horizontal só dentro do bloco. */
export function CodeBlock({ codigo, linguagem, etiqueta, numerarLinhas = false }: Props) {
  const tokens = realcar(codigo, linguagem);
  const linhas = codigo.split('\n').length;
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-code-bg text-code-fg">
      <div className="flex h-10 items-center justify-between border-b border-code-linha pl-4 pr-1">
        <span className="text-xs font-medium text-code-muted">{etiqueta ?? linguagem}</span>
        <CopiarBotao
          texto={codigo}
          className="text-code-muted hover:bg-transparent hover:text-code-fg"
        />
      </div>
      <div className="flex">
        {numerarLinhas && (
          <pre
            aria-hidden="true"
            className="select-none py-4 pl-4 pr-2 text-right font-mono text-sm leading-relaxed text-code-linha"
          >
            {Array.from({ length: linhas }, (_, i) => i + 1).join('\n')}
          </pre>
        )}
        {/* tabIndex: o bloco faz scroll e tem de se alcançar pelo teclado. */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
        <pre tabIndex={0} className="flex-1 overflow-x-auto p-4 font-mono text-sm leading-relaxed">
          <code>
            {tokens.map((t, i) =>
              t.tipo === 'texto' ? (
                t.texto
              ) : (
                <span key={i} className={CLASSE_DO_TOKEN[t.tipo]}>
                  {t.texto}
                </span>
              )
            )}
          </code>
        </pre>
      </div>
    </div>
  );
}
