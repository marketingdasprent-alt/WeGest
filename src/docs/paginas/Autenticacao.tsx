import { PERMISSOES_POR_ESCOPO, rotuloPermissao } from '@/lib/apiChaves';
import { Callout } from '../componentes/Callout';
import { CodeBlock } from '../componentes/CodeBlock';
import { C, GuiaPagina, Seccao } from '../componentes/GuiaPagina';

export default function Autenticacao() {
  return (
    <GuiaPagina
      slug="autenticacao"
      introducao={<p>Cada pedido leva a chave da organização. A chave define a organização.</p>}
    >
      <Seccao id="cabecalho" titulo="O cabeçalho X-API-Key">
        <p>
          Envie a chave no cabeçalho <C>X-API-Key</C>. Também se aceita{' '}
          <C>Authorization: Bearer wg_ra_…</C> ou <C>Authorization: ApiKey wg_ra_…</C>.
        </p>
        <CodeBlock
          codigo={'curl https://api.wegest.pt/v1/health \\\n  -H "X-API-Key: $WEGEST_API_KEY"'}
          linguagem="bash"
          etiqueta="cURL"
        />
        <Callout tipo="perigo" titulo="Só a partir do backend">
          Uma chave no browser fica à vista de qualquer visitante. Chame a API do servidor do site e
          devolva ao browser só o que ele precisa de mostrar.
        </Callout>
      </Seccao>
      <Seccao id="permissoes" titulo="Permissões">
        <p>Cada chave tem as permissões escolhidas ao criá-la:</p>
        <ul className="list-disc space-y-1 pl-6">
          {PERMISSOES_POR_ESCOPO.rent_a_car.map((p) => (
            <li key={p}>
              <C>{p}</C> — {rotuloPermissao(p)}
            </li>
          ))}
        </ul>
        <p>
          Sem a permissão do recurso, a resposta é <C>403 SEM_PERMISSAO</C>. O catálogo de
          rent-a-car pede <C>catalogo:read</C>; o de TVDE pede <C>tvde:catalogo:read</C>. Uma não
          abre as rotas da outra.
        </p>
      </Seccao>
      <Seccao id="whitelist" titulo="Whitelist de IP">
        <p>
          Uma chave pode aceitar só pedidos de certos IPs. Por <C>api.wegest.pt</C> o pedido passa
          pelo Cloudflare e o IP que a API vê não é o do seu servidor, por isso a whitelist só é
          fiável no URL directo:
        </p>
        <CodeBlock
          codigo="https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/api-rent-a-car/v1"
          linguagem="bash"
          etiqueta="Servidor directo"
        />
      </Seccao>
      <Seccao id="expiracao" titulo="Expiração e desactivação">
        <p>
          A chave pode ter data de validade. Expirada ou desactivada, responde{' '}
          <C>403 SEM_PERMISSAO</C>. Uma chave desactivada não se reactiva: crie outra e troque a
          variável de ambiente.
        </p>
      </Seccao>
    </GuiaPagina>
  );
}
