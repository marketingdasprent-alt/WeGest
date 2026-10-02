import { anteriorSeguinte } from '../lib/navegacao';
import { VERSAO } from '../lib/spec';
import { DocLink } from './DocLink';

const CARTAO =
  'block rounded-lg border p-4 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Cartões Anterior / Seguinte e a versão da API. */
export function RodapePagina({ slug }: { slug: string }) {
  const { anterior, seguinte } = anteriorSeguinte(slug);
  return (
    <footer className="mt-16 space-y-6 border-t pt-8">
      <div className="grid gap-4 sm:grid-cols-2">
        {anterior ? (
          <DocLink para={anterior.slug} className={CARTAO}>
            <span className="text-xs text-muted-foreground">Anterior</span>
            <span className="block font-medium">{anterior.titulo}</span>
          </DocLink>
        ) : (
          <span />
        )}
        {seguinte && (
          <DocLink para={seguinte.slug} className={`${CARTAO} sm:text-right`}>
            <span className="text-xs text-muted-foreground">Seguinte</span>
            <span className="block font-medium">{seguinte.titulo}</span>
          </DocLink>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Editado na versão {VERSAO}.</p>
    </footer>
  );
}
