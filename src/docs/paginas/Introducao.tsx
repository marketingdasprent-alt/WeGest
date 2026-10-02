import { BookOpen, KeyRound, Rocket } from 'lucide-react';
import { BaseUrlCard } from '../componentes/BaseUrlCard';
import { DocLink } from '../componentes/DocLink';
import { GuiaPagina } from '../componentes/GuiaPagina';
import { VERSAO } from '../lib/spec';

const CARTOES = [
  {
    para: 'inicio-rapido',
    titulo: 'Início rápido',
    texto: 'Do zero ao primeiro pedido em 3 passos.',
    Icone: Rocket,
  },
  {
    para: 'autenticacao',
    titulo: 'Autenticação',
    texto: 'A chave X-API-Key, as permissões e a whitelist.',
    Icone: KeyRound,
  },
  {
    para: 'recursos/modelos',
    titulo: 'Recursos',
    texto: 'Localizações, categorias, modelos, extras e coberturas.',
    Icone: BookOpen,
  },
];

export default function Introducao() {
  return (
    <GuiaPagina
      slug=""
      trilho="Documentação"
      introducao={
        <p>
          A API de rent-a-car do WeGest dá ao site da sua organização o catálogo de aluguer
          (estações, categorias, modelos com preço por dia, extras e coberturas), a disponibilidade
          num período, a cotação com cobertura e extras, e as reservas: o site cria, consulta e
          cancela reservas, que entram como pendentes e a equipa confirma no WeGest. Versão actual:{' '}
          {VERSAO}.
        </p>
      }
    >
      <div className="space-y-4">
        <BaseUrlCard />
        <p className="text-sm text-muted-foreground">
          Todas as respostas são JSON. Chama-se só a partir do backend do site, nunca do browser,
          porque a chave dá acesso aos dados da organização.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {CARTOES.map(({ para, titulo, texto, Icone }) => (
          <DocLink
            key={para}
            para={para}
            className="rounded-lg border bg-card p-4 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icone className="h-5 w-5 text-primary-text" aria-hidden="true" />
            <p className="mt-3 font-medium">{titulo}</p>
            <p className="mt-1 text-sm text-muted-foreground">{texto}</p>
          </DocLink>
        ))}
      </div>
    </GuiaPagina>
  );
}
