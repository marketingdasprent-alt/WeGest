import { Callout } from '../componentes/Callout';
import { CodeBlock } from '../componentes/CodeBlock';
import { DocLink } from '../componentes/DocLink';
import { C, GuiaPagina, Seccao } from '../componentes/GuiaPagina';

const LIGACAO = 'text-primary-text underline';

const REGISTO = `// No browser do site: só a chave pública (publishable) do WeGest, nunca a chave de API.
import { createClient } from '@supabase/supabase-js';

const wegest = createClient(
  'https://hkqzzxgeedsmjnhyquke.supabase.co',
  WEGEST_PUBLISHABLE_KEY
);

const { error } = await wegest.auth.signUp({
  email: 'carla@exemplo.pt',
  password,
  options: {
    emailRedirectTo: 'https://www.exemplo.pt/rent-a-car/conta',
    data: {
      tipo_utilizador: 'cliente',
      org_id: ORGANIZACAO, // o "organizacao" do GET /health
      nome: 'Carla Nova',
      telefone: '+351 912 345 678',
      data_nascimento: '1990-05-01',
      pais: 'Portugal',
      // Opcionais:
      nif: '258714638',
      morada: 'Rua das Flores, 10',
      codigo_postal: '1200-192',
      localidade: 'Lisboa',
    },
  },
});`;

const PEDIDO = `curl "https://api.wegest.pt/v1/conta/reservas" \\
  -H "X-API-Key: $WEGEST_API_KEY" \\
  -H "X-Conta-Token: $CONTA_TOKEN"`;

export default function ContasDeCliente() {
  return (
    <GuiaPagina
      slug="contas-de-cliente"
      introducao={
        <p>
          A pessoa cria conta no site, confirma o email e passa a ver no site as suas reservas de
          rent-a-car e as suas faturas. A conta é só do site: não entra no WeGest.
        </p>
      }
    >
      <Seccao id="criar-a-conta" titulo="1. Criar a conta">
        <p>
          A conta cria-se no browser, com o <C>supabase-js</C> e a chave pública do WeGest (peça-a à
          equipa). Mande <C>tipo_utilizador: &apos;cliente&apos;</C> e o <C>org_id</C> da
          organização, que é o <C>organizacao</C> do <C>GET /health</C>. O resto dos dados vai para
          a ficha de cliente: <C>nome</C>, <C>telefone</C>, <C>data_nascimento</C> (AAAA-MM-DD) e{' '}
          <C>pais</C>; <C>nif</C>, <C>morada</C>, <C>codigo_postal</C> e <C>localidade</C> são
          opcionais.
        </p>
        <CodeBlock codigo={REGISTO} linguagem="javascript" etiqueta="JavaScript (browser)" />
        <Callout tipo="aviso" titulo="O endereço de regresso tem de estar autorizado">
          O <C>emailRedirectTo</C> é a página do site para onde o link de confirmação leva. Peça à
          equipa do WeGest para o autorizar antes de abrir o registo.
        </Callout>
      </Seccao>

      <Seccao id="confirmar-o-email" titulo="2. Confirmar o email">
        <p>
          A pessoa recebe um email e abre o link. Até lá não há sessão, logo não há token para
          chamar a API: o <C>signUp</C> responde sem <C>session</C>, e é a partir dessa resposta que
          o site mostra &quot;verifique o email&quot;.
        </p>
        <p>
          Depois de confirmar, a conta fica ligada a uma ficha de cliente da organização. Se houver
          <strong>uma única</strong> ficha <strong>particular</strong> com o mesmo email, criada
          pela equipa e ainda sem conta (alguém que já alugou), é essa, com as reservas e faturas
          que já tinha; senão cria-se uma ficha nova com os dados do registo. Com duas ou mais
          fichas com esse email, ou fichas de empresa, não se liga nada: a equipa resolve à mão.
        </p>
        <p>
          O NIF escrito no registo <strong>não</strong> vai para a ficha: fica anotado para a equipa
          confirmar ao balcão. Por isso uma conta nova devolve <C>cliente.nif: null</C> até lá, e
          uma reserva feita com NIF no pedido fica marcada para a equipa confirmar a identidade.
        </p>
        <Callout tipo="nota" titulo="cliente: null com o email confirmado">
          <C>GET /conta</C> com <C>email_confirmado: true</C> e <C>cliente: null</C> quer dizer que
          ainda não há ficha ligada, e as listas de reservas e faturas vêm vazias. A primeira
          chamada à API com a chave do site liga ou cria a ficha; se continuar <C>null</C>, contacte
          a equipa do WeGest.
        </Callout>
      </Seccao>

      <Seccao id="pedidos-com-a-conta" titulo="3. Pedidos com a conta">
        <p>
          O browser manda ao servidor do site o <C>access_token</C> da sessão (
          <C>session.access_token</C> no <C>supabase-js</C>). O servidor do site chama a API com a
          chave e com o token no cabeçalho <C>X-Conta-Token</C>. A API confirma o token a cada
          pedido e só devolve o que é desta conta.
        </p>
        <CodeBlock codigo={PEDIDO} linguagem="bash" etiqueta="cURL" />
        <ul className="list-disc space-y-2 pl-6">
          <li>
            Sem token, ou com um token inválido ou expirado: <C>401 SESSAO_INVALIDA</C>. O token
            dura cerca de uma hora: o <C>supabase-js</C> renova-o sozinho; mande sempre o actual.
          </li>
          <li>
            A chave precisa de <C>conta:read</C> para ler e de <C>conta:write</C> para cancelar.
          </li>
          <li>
            <C>X-Motorista-Token</C> continua a ser aceite como sinónimo de <C>X-Conta-Token</C>.
          </li>
        </ul>
        <Callout tipo="perigo" titulo="O token é uma sessão">
          Quem tem o token entra na conta. Não o registe nos logs do site nem o guarde além da
          sessão.
        </Callout>
        <p>
          Rotas em{' '}
          <DocLink para="recursos/conta" className={LIGACAO}>
            Conta de cliente
          </DocLink>
          .
        </p>
      </Seccao>

      <Seccao id="reservar-com-a-conta" titulo="4. Reservar com a conta">
        <p>
          No <C>POST /reservas</C>, mande também o <C>X-Conta-Token</C> quando a pessoa entrou. A
          reserva fica na ficha de cliente da conta, em vez de se procurar o cliente pelo NIF ou
          pelo email, e aparece logo em <C>GET /conta/reservas</C>. Sem o cabeçalho, a reserva
          funciona como sempre. Com um token inválido a resposta é <C>401 SESSAO_INVALIDA</C> e nada
          é criado.
        </p>
        <p>
          Mais em{' '}
          <DocLink para="recursos/reservas" className={LIGACAO}>
            Reservas
          </DocLink>
          .
        </p>
      </Seccao>

      <Seccao id="faturas" titulo="5. Faturas">
        <p>
          <C>GET /conta/faturas</C> lista as faturas emitidas <strong>em nome do cliente</strong> da
          conta (é ele o destinatário fiscal), não todas as do contrato: um documento do mesmo
          aluguer emitido a outra entidade, como a empresa que paga, não aparece.
        </p>
        <p>
          O PDF (<C>GET /conta/faturas/{'{id}'}</C>) pede-se na hora ao programa de faturação e pode
          demorar até cerca de <strong className="tabular-nums">45 s</strong>: dê esse tempo ao
          pedido e não o repita antes, porque cada repetição volta a pedir o PDF.
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            Limite de <strong className="tabular-nums">10 PDF por minuto</strong> por conta e chave;
            acima disso, <C>429 LIMITE_EXCEDIDO</C> com <C>Retry-After</C>.
          </li>
          <li>
            Fatura sem número no programa de faturação: <C>404 NAO_ENCONTRADO</C> &quot;Esta fatura
            não tem PDF disponível.&quot;
          </li>
          <li>
            Programa de faturação sem resposta: <C>503 ERRO_INTERNO</C> &quot;Fatura indisponível de
            momento.&quot; Tente mais tarde.
          </li>
        </ul>
      </Seccao>
    </GuiaPagina>
  );
}
