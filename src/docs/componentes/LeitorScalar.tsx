import { ApiReferenceReact } from '@scalar/api-reference-react';
import '@scalar/api-reference-react/style.css';
import { CONFIGURACAO_BASE, CSS_SCALAR } from '@/lib/apiDocs';

/** O Scalar em si (~1 MB): só se carrega dentro da Referência interactiva. */
export default function LeitorScalar({
  especificacao,
  escuro,
}: {
  especificacao: Record<string, unknown>;
  escuro: boolean;
}) {
  return (
    <ApiReferenceReact
      configuration={{
        ...CONFIGURACAO_BASE,
        content: especificacao,
        customCss: CSS_SCALAR,
        forceDarkModeState: escuro ? 'dark' : 'light',
      }}
    />
  );
}
