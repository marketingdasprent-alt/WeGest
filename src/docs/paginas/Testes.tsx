import { rotuloPermissao } from '@/lib/apiChaves';
import { Callout } from '../componentes/Callout';
import { DocLink } from '../componentes/DocLink';
import { C, GuiaPagina } from '../componentes/GuiaPagina';

const SO_LEITURA = ['catalogo:read', 'disponibilidade:read'];

export default function Testes() {
  return (
    <GuiaPagina
      slug="testes"
      introducao={
        <p>
          Não há um ambiente de testes separado: testa-se contra a organização verdadeira, com uma
          chave só de leitura para o catálogo, a disponibilidade e as cotações.
        </p>
      }
    >
      <div className="space-y-4 text-base leading-7">
        <ol className="list-decimal space-y-3 pl-6">
          <li>
            Em <strong>Integrações → Chaves de API</strong>, crie uma chave chamada, por exemplo,
            «Testes do site», só com estas permissões:
            <ul className="mt-2 list-disc space-y-1 pl-6">
              {SO_LEITURA.map((p) => (
                <li key={p}>
                  <C>{p}</C> — {rotuloPermissao(p)}
                </li>
              ))}
            </ul>
          </li>
          <li>
            Use-a no ambiente de desenvolvimento do site e no «experimentar» da{' '}
            <DocLink para="referencia" className="text-primary-text underline">
              Referência interactiva
            </DocLink>
            .
          </li>
          <li>
            Quando acabar, ou se a chave aparecer onde não devia, desactive-a na mesma lista. O
            efeito é imediato.
          </li>
        </ol>
        <Callout tipo="nota" titulo="Reservas">
          Uma chave com <C>reservas:write</C> cria reservas verdadeiras: entram como pendentes na
          organização e a equipa recebe o aviso. Para testar a criação, avise a equipa antes e
          cancele a reserva logo a seguir com <C>DELETE /reservas/{'{codigo}'}</C>, enquanto está
          pendente. Cada teste precisa de uma <C>referencia_externa</C> nova.
        </Callout>
      </div>
    </GuiaPagina>
  );
}
