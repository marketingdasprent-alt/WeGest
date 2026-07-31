import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Skeleton com a forma de uma tabela.
 *
 * Existe porque o `Skeleton` cru obriga cada ecrã a desenhar o seu à mão — e foi
 * por isso que, de 55 páginas, só 4 o usavam e 196 ficheiros ficaram pelo
 * spinner. Um spinner não diz nada sobre o que vem a seguir; um skeleton com o
 * número certo de colunas faz a página parecer instantânea, porque o olho já
 * reconhece o layout antes de os dados chegarem.
 *
 * Não substitui o spinner em botões e acções curtas — aí o spinner é o correcto.
 * Isto é para listas e tabelas.
 *
 * @example
 * if (aCarregar) return <TableSkeleton colunas={5} />;
 */

/**
 * Coluna que só aparece a partir de um ponto de quebra — para o skeleton
 * acompanhar tabelas que escondem colunas em ecrã pequeno. Sem isto, o
 * skeleton mostra cinco colunas e a tabela real mostra três, e a transição
 * salta à vista no telemóvel.
 */
export interface ColunaSkeleton {
  /** Ponto de quebra a partir do qual a coluna existe. */
  desde?: 'md' | 'lg';
  /** Largura fixa em vez de repartir o espaço (ex.: 'w-16' para um estado). */
  largura?: string;
}

const CLASSE_DESDE = { md: 'hidden md:block', lg: 'hidden lg:block' } as const;

export interface TableSkeletonProps {
  /**
   * Número de colunas, ou a sua descrição quando há colunas responsivas.
   * Usar o mesmo número/forma da tabela real.
   */
  colunas: number | ColunaSkeleton[];
  /** Linhas de espera. 5 chega para dar forma sem encher o ecrã. */
  linhas?: number;
  /** Desenhar a linha de cabeçalho. Desligar quando o cabeçalho é real. */
  cabecalho?: boolean;
  className?: string;
}

/**
 * Larguras que se repetem em ciclo pelas colunas. Larguras irregulares leem-se
 * como texto; todas iguais leem-se como grelha vazia — e é a diferença entre
 * parecer conteúdo a chegar e parecer o ecrã partido.
 */
const LARGURAS = ['w-3/4', 'w-1/2', 'w-5/6', 'w-2/3', 'w-1/3'] as const;

export function TableSkeleton({
  colunas,
  linhas = 5,
  cabecalho = true,
  className,
}: TableSkeletonProps) {
  const specs: ColunaSkeleton[] =
    typeof colunas === 'number' ? Array.from({ length: colunas }, () => ({})) : colunas;

  return (
    <div
      className={cn('w-full space-y-3', className)}
      // Anunciado como região ocupada para quem usa leitor de ecrã; o conteúdo
      // visual é decorativo e não deve ser lido célula a célula.
      role="status"
      aria-busy="true"
      aria-label="A carregar"
    >
      {cabecalho && (
        <div className="flex gap-4 border-b border-border pb-3" aria-hidden="true">
          {specs.map((spec, c) => (
            <Skeleton
              key={c}
              className={cn(
                'h-4',
                spec.largura ?? 'flex-1',
                spec.desde && CLASSE_DESDE[spec.desde]
              )}
            />
          ))}
        </div>
      )}

      {Array.from({ length: linhas }, (_, l) => (
        <div key={l} className="flex items-center gap-4 py-1" aria-hidden="true">
          {specs.map((spec, c) => (
            <div
              key={c}
              className={cn(spec.largura ?? 'flex-1', spec.desde && CLASSE_DESDE[spec.desde])}
            >
              <Skeleton
                className={cn('h-4', spec.largura ? 'w-full' : LARGURAS[(l + c) % LARGURAS.length])}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton para listas de cartões — o mesmo princípio, outra forma.
 */
export function CardListSkeleton({
  cartoes = 3,
  className,
}: {
  cartoes?: number;
  className?: string;
}) {
  return (
    <div
      className={cn('space-y-3', className)}
      role="status"
      aria-busy="true"
      aria-label="A carregar"
    >
      {Array.from({ length: cartoes }, (_, i) => (
        <div key={i} className="rounded-lg border border-border p-4" aria-hidden="true">
          <Skeleton className="mb-3 h-5 w-1/3" />
          <Skeleton className="mb-2 h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}
