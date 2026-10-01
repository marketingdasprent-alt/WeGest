import { ApiReferenceReact } from '@scalar/api-reference-react';
import '@scalar/api-reference-react/style.css';
import { SUPABASE_URL } from '@/integrations/supabase/env';
import { CONFIGURACAO_BASE, urlDaEspecificacao } from '@/lib/apiDocs';

/** Documentação pública da API de rent-a-car. Sem login. */
export default function ApiDocsPage() {
  const url = urlDaEspecificacao(SUPABASE_URL);
  return (
    <div className="min-h-screen bg-background">
      <div
        role="note"
        className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
      >
        <p>
          No «experimentar» desta página use só uma chave de teste: a chave fica no seu browser. A
          chave de produção vive apenas no backend do site.
        </p>
        <p>
          A whitelist de IP de uma chave só é fiável no URL directo do Supabase; via wegest.pt o IP
          visto é o da Vercel.
        </p>
      </div>
      <ApiReferenceReact configuration={{ ...CONFIGURACAO_BASE, url }} />
    </div>
  );
}
