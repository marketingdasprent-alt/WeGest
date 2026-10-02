import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Download, OctagonAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Callout } from '../componentes/Callout';
import { useTituloDocs } from '../lib/useTituloDocs';
import { URL_OPENAPI } from '../lib/spec';

const LeitorScalar = lazy(() => import('../componentes/LeitorScalar'));

type Estado =
  | { tipo: 'a-carregar' }
  | { tipo: 'erro' }
  | { tipo: 'pronto'; especificacao: Record<string, unknown> };

/** Skeleton de 2 colunas, do tamanho do leitor: sem saltos de layout. */
function A_Carregar() {
  return (
    <div className="grid gap-6 md:grid-cols-[16rem_1fr]" aria-busy="true" aria-label="A carregar">
      <div className="hidden space-y-3 md:block">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </div>
      <div className="space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}

/**
 * Referência interactiva (Scalar). Lê a especificação publicada em
 * api.wegest.pt (o CORS aceita docs.wegest.pt e wegest.pt), não a do bundle:
 * o que se experimenta é o que está em produção.
 */
export default function Referencia() {
  useTituloDocs('Referência interactiva');
  const { resolvedTheme } = useTheme();
  const [estado, setEstado] = useState<Estado>({ tipo: 'a-carregar' });

  const carregar = useCallback(async (sinal?: AbortSignal) => {
    setEstado({ tipo: 'a-carregar' });
    try {
      const r = await fetch(URL_OPENAPI, { signal: sinal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setEstado({ tipo: 'pronto', especificacao: await r.json() });
    } catch {
      if (!sinal?.aborted) setEstado({ tipo: 'erro' });
    }
  }, []);

  useEffect(() => {
    const c = new AbortController();
    void carregar(c.signal);
    return () => c.abort();
  }, [carregar]);

  return (
    <div className="space-y-6">
      <header className="max-w-3xl space-y-3">
        <p className="text-sm text-muted-foreground">Ferramentas</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
          Referência interactiva
        </h1>
      </header>
      <div className="max-w-3xl">
        <Callout tipo="perigo" titulo="Só com chave de testes">
          Use uma chave só com catalogo:read; a chave fica no seu browser enquanto a página está
          aberta.
        </Callout>
      </div>

      {estado.tipo === 'a-carregar' && <A_Carregar />}
      {estado.tipo === 'erro' && (
        <Alert variant="destructive" className="max-w-3xl">
          <OctagonAlert className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar a especificação.</AlertTitle>
          <AlertDescription className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void carregar()}>
              Tentar de novo
            </Button>
            <Button asChild size="sm" variant="ghost">
              <a href={URL_OPENAPI} target="_blank" rel="noreferrer">
                <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                Descarregar OpenAPI
              </a>
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {estado.tipo === 'pronto' && (
        <Suspense fallback={<A_Carregar />}>
          <LeitorScalar especificacao={estado.especificacao} escuro={resolvedTheme === 'dark'} />
        </Suspense>
      )}
    </div>
  );
}
