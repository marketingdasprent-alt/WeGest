import { Callout } from '../componentes/Callout';
import { CodeBlock } from '../componentes/CodeBlock';
import { DocLink } from '../componentes/DocLink';
import { C, GuiaPagina, Seccao } from '../componentes/GuiaPagina';
import { LanguageTabs } from '../componentes/LanguageTabs';
import { ResponseTabs } from '../componentes/ResponseTabs';
import { operacao } from '../lib/spec';

export default function InicioRapido() {
  const health = operacao('GET /health');
  const categorias = operacao('GET /categorias');
  return (
    <GuiaPagina
      slug="inicio-rapido"
      introducao={<p>Três passos, do zero ao primeiro pedido com dados reais da organização.</p>}
    >
      <Seccao id="obter-a-chave" titulo="1. Obter a chave">
        <p>
          No WeGest, um administrador cria a chave em <strong>Integrações → Chaves de API</strong>.
          A chave começa por <C>wg_ra_</C> e só aparece uma vez: guarde-a numa variável de ambiente
          do servidor do site.
        </p>
        <CodeBlock codigo={'export WEGEST_API_KEY="wg_ra_..."'} linguagem="bash" etiqueta=".env" />
        <Callout tipo="aviso" titulo="Nunca no browser">
          A chave dá acesso aos dados da organização. Não a ponha em código que corre no browser nem
          num repositório.
        </Callout>
      </Seccao>
      <Seccao id="verificar-a-chave" titulo="2. Verificar a chave">
        <p>
          <C>GET /health</C> confirma que a chave autentica. Espere <C>ok: true</C>. Se{' '}
          <C>tarifa_site</C> vier <C>false</C>, a organização ainda não marcou a tarifa do site e os
          modelos vêm vazios.
        </p>
        <LanguageTabs operacao={health} />
        <ResponseTabs respostas={health.respostas.filter((r) => r.estado === '200')} />
      </Seccao>
      <Seccao id="primeiro-pedido" titulo="3. Primeiro pedido">
        <p>
          <C>GET /categorias</C> devolve as categorias com modelos publicáveis. Mostre o{' '}
          <C>preco_dia_desde.com_iva</C> no site («desde 43,05 €/dia»).
        </p>
        <LanguageTabs operacao={categorias} />
        <ResponseTabs respostas={categorias.respostas.filter((r) => r.estado === '200')} />
        <p>
          A seguir:{' '}
          <DocLink para="recursos/modelos" className="text-primary-text underline">
            Modelos
          </DocLink>{' '}
          e{' '}
          <DocLink para="limites" className="text-primary-text underline">
            Limites e cache
          </DocLink>
          .
        </p>
      </Seccao>
    </GuiaPagina>
  );
}
