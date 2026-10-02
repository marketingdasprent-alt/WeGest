import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { pagina } from '../lib/navegacao';
import { useTituloDocs } from '../lib/useTituloDocs';
import { NestaPagina } from './NestaPagina';

interface Props {
  slug: string;
  /** Trilho (ex.: "Conceitos"). */
  trilho?: string;
  introducao?: ReactNode;
  children: ReactNode;
}

/** Página de guia: coluna de texto e, em xl, "Nesta página" na coluna da direita. */
export function GuiaPagina({ slug, trilho, introducao, children }: Props) {
  const p = pagina(slug);
  const titulo = p?.titulo ?? '';
  useTituloDocs(titulo);
  return (
    <div className="xl:flex xl:gap-12">
      <article className="min-w-0 max-w-3xl space-y-12 xl:max-w-[42rem] xl:flex-1">
        <header className="space-y-3">
          {(trilho ?? p?.grupo) && (
            <p className="text-sm text-muted-foreground">{trilho ?? p?.grupo}</p>
          )}
          <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
            {titulo}
          </h1>
          {introducao && (
            <div className="text-base leading-7 text-muted-foreground">{introducao}</div>
          )}
          <NestaPagina seccoes={p?.seccoes} />
        </header>
        {children}
      </article>
      {p?.seccoes?.length ? (
        <aside className="hidden xl:block xl:w-[28rem] xl:shrink-0">
          <div className="sticky top-20">
            <NestaPagina seccoes={p.seccoes} fixa />
          </div>
        </aside>
      ) : null}
    </div>
  );
}

/** Secção com âncora (H2 com scroll-mt-20). */
export function Seccao({
  id,
  titulo,
  children,
  className,
}: {
  id: string;
  titulo: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-titulo`}
      className={cn('scroll-mt-20 space-y-4', className)}
    >
      <h2 id={`${id}-titulo`} className="font-display text-2xl font-semibold tracking-tight">
        <a href={`#${id}`} className="hover:underline">
          {titulo}
        </a>
      </h2>
      <div className="space-y-4 text-base leading-7">{children}</div>
    </section>
  );
}

/** Código em linha. */
export function C({ children }: { children: ReactNode }) {
  return <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.9em]">{children}</code>;
}
