import { Badge } from '@/components/ui/badge';
import { tipoDoParametro } from '../lib/atributos';
import type { Parametro } from '../lib/spec';

const GRUPOS: { em: Parametro['em']; titulo: string }[] = [
  { em: 'path', titulo: 'Caminho' },
  { em: 'query', titulo: 'Consulta' },
  { em: 'header', titulo: 'Cabeçalhos' },
];

const CHAVE: Parametro = {
  nome: 'X-API-Key',
  em: 'header',
  obrigatorio: true,
  descricao: 'A chave da organização (wg_ra_…), lida de uma variável de ambiente do servidor.',
  esquema: { type: 'string' },
  exemplo: undefined,
};

function Linha({ p }: { p: Parametro }) {
  const valores = Array.isArray(p.esquema.enum) ? (p.esquema.enum as string[]) : [];
  return (
    <div className="grid gap-1 border-t py-3 md:grid-cols-[12rem_8rem_7rem_1fr] md:gap-4">
      <dt className="font-mono text-sm font-medium">{p.nome}</dt>
      <dd className="font-mono text-xs text-muted-foreground">
        {tipoDoParametro(p.esquema)}
        {valores.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1">
            {valores.map((v) => (
              <code key={v} className="rounded-sm bg-muted px-1">
                {v}
              </code>
            ))}
          </span>
        )}
      </dd>
      <dd>
        {p.obrigatorio ? (
          <Badge variant="secondary">obrigatório</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">opcional</span>
        )}
      </dd>
      <dd className="text-sm leading-6">{p.descricao}</dd>
    </div>
  );
}

/** Parâmetros por Caminho · Consulta · Cabeçalhos; X-API-Key sempre obrigatório. */
export function ParamTable({ parametros, publica }: { parametros: Parametro[]; publica: boolean }) {
  const todos = publica ? parametros : [...parametros, CHAVE];
  if (todos.length === 0) {
    return <p className="text-sm text-muted-foreground">Este pedido não recebe parâmetros.</p>;
  }
  return (
    <div className="space-y-6">
      {GRUPOS.map(({ em, titulo }) => {
        const doGrupo = todos.filter((p) => p.em === em);
        if (doGrupo.length === 0) return null;
        return (
          <div key={em}>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {titulo}
            </h4>
            <dl className="mt-2">
              {doGrupo.map((p) => (
                <Linha key={p.nome} p={p} />
              ))}
            </dl>
          </div>
        );
      })}
    </div>
  );
}
