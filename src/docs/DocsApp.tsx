// Site da documentação da API (docs.wegest.pt e, na app, /docs/*). Entra em
// lazy a partir de WebAppRoutes; os chunks só dele ficam fora do precache do
// PWA (ver separarDocumentacaoDaApi no vite.config.ts).
import { lazy, Suspense, useCallback, useMemo, useState, type ComponentType } from 'react';
import { useLocation } from 'react-router-dom';
import { DocsLayout } from './componentes/DocsLayout';
import { DocsContexto, type ContextoDocs } from './contexto';
import { slugDoCaminho } from './lib/base';
import type { Linguagem } from './lib/exemplosCodigo';
import { pagina, recurso } from './lib/navegacao';
import { guardarLinguagem, lerLinguagem } from './lib/preferencias';
import Alteracoes from './paginas/Alteracoes';
import Autenticacao from './paginas/Autenticacao';
import DatasEDinheiro from './paginas/DatasEDinheiro';
import Erros from './paginas/Erros';
import { A_Carregar, EmBreve, NaoEncontrada } from './paginas/EstadosPagina';
import InicioRapido from './paginas/InicioRapido';
import Introducao from './paginas/Introducao';
import Limites from './paginas/Limites';
import Recurso from './paginas/Recurso';
import Testes from './paginas/Testes';

// O Scalar só se descarrega quando alguém abre a Referência interactiva.
const Referencia = lazy(() => import('./paginas/Referencia'));

/** Páginas de guia por slug; recursos e "em breve" saem da navegação. */
const GUIAS: Record<string, ComponentType> = {
  '': Introducao,
  'inicio-rapido': InicioRapido,
  autenticacao: Autenticacao,
  testes: Testes,
  limites: Limites,
  erros: Erros,
  'datas-e-dinheiro': DatasEDinheiro,
  referencia: Referencia,
  alteracoes: Alteracoes,
};

function armazem(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function Conteudo({ slug }: { slug: string }) {
  const Guia = GUIAS[slug];
  if (Guia) return <Guia />;
  if (recurso(slug)) return <Recurso slug={slug} />;
  if (pagina(slug)?.emBreve) return <EmBreve slug={slug} />;
  return <NaoEncontrada />;
}

export default function DocsApp({ base }: { base: ContextoDocs['base'] }) {
  const { pathname } = useLocation();
  const slug = slugDoCaminho(base, pathname);
  const [linguagem, setLinguagem] = useState<Linguagem>(() => lerLinguagem(armazem()));
  const escolherLinguagem = useCallback((l: Linguagem) => {
    setLinguagem(l);
    guardarLinguagem(armazem(), l);
  }, []);
  const contexto = useMemo(
    () => ({ base, linguagem, escolherLinguagem }),
    [base, linguagem, escolherLinguagem]
  );
  const p = pagina(slug);
  const semRodape = !p || !!p.emBreve;

  return (
    <DocsContexto.Provider value={contexto}>
      <DocsLayout slug={slug} semRodape={semRodape}>
        <Suspense fallback={<A_Carregar />}>
          <Conteudo slug={slug} />
        </Suspense>
      </DocsLayout>
    </DocsContexto.Provider>
  );
}
