import { Badge } from '@/components/ui/badge';

interface DanoCategoria {
  nome: string;
  cor: string | null;
}

interface DanoCategoriaBadgeProps {
  categoria: DanoCategoria | null | undefined;
}

/** Mostra a categoria de um dano (ex.: "Sinistro"), com a cor definida em
 * Definições > Categorias de Assistência. Sem categoria, não renderiza nada
 * — evita reservar espaço vazio nas listagens. */
export function DanoCategoriaBadge({ categoria }: DanoCategoriaBadgeProps) {
  if (!categoria) return null;

  return (
    <Badge
      variant="outline"
      style={{
        borderColor: categoria.cor ? `${categoria.cor}40` : undefined,
        backgroundColor: categoria.cor ? `${categoria.cor}1A` : undefined,
        color: categoria.cor || undefined,
      }}
    >
      {categoria.nome}
    </Badge>
  );
}
