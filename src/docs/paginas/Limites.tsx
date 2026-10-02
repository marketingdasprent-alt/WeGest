import { CodeBlock } from '../componentes/CodeBlock';
import { C, GuiaPagina, Seccao } from '../componentes/GuiaPagina';

export default function Limites() {
  return (
    <GuiaPagina
      slug="limites"
      introducao={<p>Quantos pedidos pode fazer e quanto tempo pode guardar cada resposta.</p>}
    >
      <Seccao id="limites" titulo="Limites de pedidos">
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong className="tabular-nums">120 pedidos por minuto</strong> por chave, por omissão.
            O administrador pode mudar o valor da chave, entre 1 e 10000.
          </li>
          <li>
            <strong className="tabular-nums">60 por minuto</strong> por IP, contados só nos pedidos
            sem chave válida. Quem tem chave válida nunca gasta este limite.
          </li>
        </ul>
        <p>
          Acima do limite, a resposta é <C>429 LIMITE_EXCEDIDO</C> com o cabeçalho{' '}
          <C>Retry-After</C>: os segundos a esperar antes de repetir.
        </p>
        <CodeBlock
          codigo={
            'HTTP/1.1 429 Too Many Requests\nRetry-After: 42\n\n{ "erro": { "codigo": "LIMITE_EXCEDIDO", "mensagem": "Limite de pedidos por minuto excedido." } }'
          }
          linguagem="json"
          etiqueta="429"
        />
      </Seccao>
      <Seccao id="cache" titulo="Cache">
        <p>
          O catálogo muda pouco. Cada resposta diz quanto tempo a pode guardar, e guardá-la poupa
          pedidos ao limite.
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            Catálogo (localizações, categorias, modelos, extras, coberturas):{' '}
            <C>Cache-Control: private, max-age=300</C> e{' '}
            <C>Vary: Origin, X-API-Key, Authorization</C>. Guarde no servidor do site até 5 minutos,
            separado por chave: a resposta é da sua organização.
          </li>
          <li>
            <C>/v1</C> e <C>/v1/openapi.json</C>: <C>public, max-age=3600</C>.
          </li>
          <li>
            <C>/v1/health</C> não se guarda.
          </li>
        </ul>
      </Seccao>
    </GuiaPagina>
  );
}
