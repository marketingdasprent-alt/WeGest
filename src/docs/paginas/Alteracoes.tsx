import { Badge } from '@/components/ui/badge';
import { GuiaPagina } from '../componentes/GuiaPagina';

type Tipo = 'Novo' | 'Correcção' | 'Incompatível';

interface Alteracao {
  data: string;
  versao: string;
  tipo: Tipo;
  texto: string;
}

/** Lista cronológica, mais recente primeiro. A versão é a do OpenAPI (info.version). */
const ALTERACOES: Alteracao[] = [
  {
    data: '2026-10-06',
    versao: '1.0.0',
    tipo: 'Novo',
    texto:
      'TVDE (fase D1): GET /tvde/modelos e GET /tvde/modelos/{id} com o preço por semana e o IVA ' +
      'do TVDE, e GET /tvde/disponibilidade?inicio= com os carros livres a partir dessa data, sem ' +
      'fim. Permissão nova tvde:catalogo:read. O /health passa a dizer também tarifa_site_tvde.',
  },
  {
    data: '2026-10-02',
    versao: '1.0.0',
    tipo: 'Novo',
    texto:
      'Reservas (fase C): POST /reservas cria uma reserva pendente, GET /reservas/{codigo} ' +
      'consulta-a e DELETE /reservas/{codigo} cancela-a enquanto está pendente. Códigos novos: ' +
      'PRECO_ALTERADO (409) e ESTADO_INVALIDO (409).',
  },
  {
    data: '2026-10-01',
    versao: '1.0.0',
    tipo: 'Novo',
    texto:
      'Primeira versão pública (fase A): localizações, categorias, modelos, extras, ' +
      'coberturas e health, em https://api.wegest.pt/v1.',
  },
];

const VARIANTE: Record<Tipo, 'default' | 'secondary' | 'destructive'> = {
  Novo: 'default',
  Correcção: 'secondary',
  Incompatível: 'destructive',
};

export default function Alteracoes() {
  return (
    <GuiaPagina
      slug="alteracoes"
      introducao={<p>O que mudou na API, por versão. Mudanças incompatíveis vêm assinaladas.</p>}
    >
      <ol className="space-y-6">
        {ALTERACOES.map((a) => (
          <li key={`${a.data}-${a.versao}`} className="border-t pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <time dateTime={a.data} className="font-mono text-sm tabular-nums">
                {a.data}
              </time>
              <span className="font-mono text-sm text-muted-foreground">v{a.versao}</span>
              <Badge variant={VARIANTE[a.tipo]}>{a.tipo}</Badge>
            </div>
            <p className="mt-2 text-base leading-7">{a.texto}</p>
          </li>
        ))}
      </ol>
    </GuiaPagina>
  );
}
