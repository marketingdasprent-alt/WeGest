import { esquemaComponente } from '../lib/spec';
import { CodeBlock } from '../componentes/CodeBlock';
import { C, GuiaPagina, Seccao } from '../componentes/GuiaPagina';

export default function DatasEDinheiro() {
  const preco = esquemaComponente('Preco').example;
  return (
    <GuiaPagina slug="datas-e-dinheiro" introducao={<p>Formatos que se repetem em toda a API.</p>}>
      <Seccao id="datas" titulo="Datas">
        <p>
          Datas e horas em ISO 8601, sempre com fuso: <C>2026-10-10T10:00:00+01:00</C> ou{' '}
          <C>2026-10-10T09:00:00Z</C>. Nas fases seguintes, os pedidos com datas sem fuso são
          recusados.
        </p>
      </Seccao>
      <Seccao id="dinheiro" titulo="Dinheiro">
        <p>
          Valores em euros, sempre num objecto com o valor <strong>sem</strong> e{' '}
          <strong>com</strong> IVA e a taxa em percentagem, com 2 casas decimais. A taxa é a da
          organização para rent-a-car.
        </p>
        <CodeBlock codigo={JSON.stringify(preco, null, 2)} linguagem="json" etiqueta="Preco" />
        <p>
          Mostre ao cliente final o <C>com_iva</C>. Não recalcule o IVA do seu lado: use os dois
          valores tal como vêm.
        </p>
      </Seccao>
      <Seccao id="nulos" titulo="Campos sem valor">
        <p>
          Um campo sem valor vem a <C>null</C>; nunca é omitido. O seu código pode confiar que todas
          as chaves do esquema estão presentes.
        </p>
      </Seccao>
    </GuiaPagina>
  );
}
