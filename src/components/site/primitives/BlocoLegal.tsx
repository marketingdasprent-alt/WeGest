import { AlertTriangle } from 'lucide-react';

/** Um item de lista definida: `termo` é opcional (nem toda a lista define termos). */
export interface ItemLegal {
  termo?: string;
  texto: string;
}

export interface SubsecaoLegal {
  titulo: string;
  paragrafos?: string[];
  itens?: ItemLegal[];
}

export interface SecaoLegal {
  /** Âncora estável: entra em links partilhados (`/cookies#marketing`). */
  id: string;
  titulo: string;
  paragrafos?: string[];
  itens?: ItemLegal[];
  subsecoes?: SubsecaoLegal[];
}

const ListaLegal = ({ itens }: { itens: ItemLegal[] }) => (
  <ul className="mt-4 space-y-2.5">
    {itens.map((item) => (
      <li key={item.termo ?? item.texto} className="flex gap-3 text-[1.0625rem] leading-relaxed">
        {/* Marcador tipográfico em vez de ícone: uma lista legal não precisa de
            um ícone por linha, e o brief exclui ícones decorativos. */}
        <span aria-hidden="true" className="mt-[2px] shrink-0 text-border">
          —
        </span>
        <span className="text-muted-foreground">
          {item.termo && <strong className="font-medium text-foreground">{item.termo}: </strong>}
          {item.texto}
        </span>
      </li>
    ))}
  </ul>
);

/**
 * Uma secção de página legal.
 *
 * Numerada — e aqui a numeração é legítima, ao contrário da que aparece em
 * grelhas de marketing: num documento legal o número é a forma de referenciar
 * uma cláusula ("nos termos do ponto 4"), logo transporta informação real.
 *
 * Antes cada secção era um cartão `bg-gray-800/30 rounded-xl p-6`. Empilhar
 * onze cartões de texto corrido dá onze caixas com o mesmo peso visual e
 * nenhuma hierarquia; réguas finas separam sem competir com o texto.
 */
export const BlocoLegal = ({ secao, numero }: { secao: SecaoLegal; numero: number }) => (
  <section
    id={secao.id}
    className="scroll-mt-20 border-t border-border/50 py-9 first:border-t-0 first:pt-0"
  >
    <div className="flex gap-4 md:gap-6">
      <span
        aria-hidden="true"
        className="shrink-0 pt-1 text-sm font-semibold tabular-nums text-muted-foreground/60"
      >
        {String(numero).padStart(2, '0')}
      </span>

      <div className="min-w-0 flex-1">
        <h2 className="font-display text-xl font-semibold tracking-[-0.01em] text-foreground">
          {secao.titulo}
        </h2>

        {secao.paragrafos?.map((paragrafo) => (
          <p
            key={paragrafo}
            className="mt-4 text-[1.0625rem] leading-relaxed text-muted-foreground"
          >
            {paragrafo}
          </p>
        ))}

        {secao.itens && <ListaLegal itens={secao.itens} />}

        {secao.subsecoes?.map((sub) => (
          <div key={sub.titulo} className="mt-7">
            <h3 className="text-[0.9375rem] font-semibold text-foreground">{sub.titulo}</h3>
            {sub.paragrafos?.map((paragrafo) => (
              <p
                key={paragrafo}
                className="mt-3 text-[1.0625rem] leading-relaxed text-muted-foreground"
              >
                {paragrafo}
              </p>
            ))}
            {sub.itens && <ListaLegal itens={sub.itens} />}
          </div>
        ))}
      </div>
    </div>
  </section>
);

/**
 * Renderiza um documento legal inteiro a partir dos seus dados. As páginas
 * ficam com dez linhas e o texto vive todo em `content/legal*.ts`, que é onde
 * alguém que revê termos consegue trabalhar sem abrir JSX.
 */
export const DocumentoLegal = ({ secoes }: { secoes: SecaoLegal[] }) => (
  <div>
    {secoes.map((secao, index) => (
      <BlocoLegal key={secao.id} secao={secao} numero={index + 1} />
    ))}
  </div>
);

/**
 * Aviso de que um documento aguarda validação jurídica.
 *
 * Usa `warning` (token semântico) e não uma cor fixa, e fica no topo do
 * documento: um aviso destes só serve se for lido antes do texto que qualifica.
 */
export const AvisoRevisaoJuridica = ({ children }: { children: string }) => (
  <div
    role="note"
    className="mb-12 flex gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4"
  >
    <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
    <p className="text-[0.9375rem] leading-relaxed text-foreground">{children}</p>
  </div>
);
