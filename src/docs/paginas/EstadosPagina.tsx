import { Clock, FileQuestion } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { DocLink } from '../componentes/DocLink';
import { useDocs } from '../contexto';
import { useTituloDocs } from '../lib/useTituloDocs';
import { pagina } from '../lib/navegacao';

const LINK = 'text-primary-text underline';

/** Recurso das fases seguintes: estado vazio, nunca um link morto. */
export function EmBreve({ slug }: { slug: string }) {
  const p = pagina(slug);
  useTituloDocs(p?.titulo ?? 'Em breve');
  return (
    <div className="max-w-3xl space-y-3">
      <p className="text-sm text-muted-foreground">Em breve</p>
      <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
        {p?.titulo ?? 'Em breve'}
      </h1>
      <EmptyState
        icon={Clock}
        title={p?.emBreve ?? 'Em breve.'}
        description="Este recurso ainda não está na API. Acompanhe as novidades no registo de alterações."
        action={
          <div className="flex gap-4 text-sm">
            <DocLink para="alteracoes" className={LINK}>
              Registo de alterações
            </DocLink>
            <DocLink para="inicio-rapido" className={LINK}>
              Início rápido
            </DocLink>
          </div>
        }
      />
    </div>
  );
}

/** 404 dentro da documentação. */
export function NaoEncontrada() {
  const { abrirPesquisa } = useDocs();
  useTituloDocs('Página inexistente');
  return (
    <EmptyState
      icon={FileQuestion}
      title="Esta página não existe."
      description="Pode ter mudado de sítio. Pesquise ou volte à introdução."
      action={
        <div className="flex gap-4 text-sm">
          {abrirPesquisa && (
            <button type="button" className={LINK} onClick={abrirPesquisa}>
              Pesquisar
            </button>
          )}
          <DocLink para="" className={LINK}>
            Introdução
          </DocLink>
        </div>
      }
    />
  );
}

/** Enquanto a página carrega: sem saltos de layout. */
export function A_Carregar() {
  return (
    <div className="max-w-3xl space-y-4" aria-busy="true" aria-label="A carregar">
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
