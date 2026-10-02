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
          Nesta fase a API só lê dados, por isso não há um ambiente de testes separado: testa-se
          contra a organização verdadeira com uma chave só de leitura.
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
          Quando chegarem as reservas (fase C), haverá uma organização de testes para criar reservas
          sem tocar na frota verdadeira. Até lá, nenhuma chave consegue escrever.
        </Callout>
      </div>
    </GuiaPagina>
  );
}
