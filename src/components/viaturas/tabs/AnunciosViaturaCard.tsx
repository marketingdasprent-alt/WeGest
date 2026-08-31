import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

import { useDesatribuirAnuncio } from '@/hooks/useClienteAnuncios';
import {
  useAnuncioDaViatura,
  useAnunciosPorAtribuir,
  useAtribuirAnuncio,
  useAtualizarElegibilidadeViatura,
  useViaturaElegivelAnuncios,
} from '@/hooks/useAnunciosViatura';
import { formatarDataPt, formatarRotuloAnuncio } from '@/types/anuncio';

interface AnunciosViaturaCardProps {
  /** Nulo enquanto a viatura ainda não foi gravada — sem id não há o que ligar. */
  viaturaId: string | null;
}

/**
 * Espelho do cartão "Anúncios" do cliente (SeccaoAnuncios), mas do lado da
 * viatura: em vez de criar anúncios, escolhe entre os que já existem e estão
 * por atribuir.
 */
export function AnunciosViaturaCard({ viaturaId }: AnunciosViaturaCardProps) {
  const { data: elegivel = false } = useViaturaElegivelAnuncios(viaturaId);
  const atualizarElegibilidade = useAtualizarElegibilidadeViatura();
  const { data: anuncioAtual, isLoading: aCarregarAtual } = useAnuncioDaViatura(viaturaId);
  const { data: porAtribuir = [] } = useAnunciosPorAtribuir();
  const atribuir = useAtribuirAnuncio();
  const desatribuir = useDesatribuirAnuncio();

  if (!viaturaId) return null;

  const toggleElegivel = (checked: boolean) => {
    atualizarElegibilidade.mutate(
      { viaturaId, elegivel: checked },
      { onError: () => toast.error('Não foi possível actualizar a elegibilidade.') }
    );
  };

  const escolherAnuncio = (anuncioId: string) => {
    atribuir.mutate(
      { anuncioId, viaturaId },
      { onError: (e) => toast.error(e.message) }
    );
  };

  return (
    <div className="md:col-span-3 mt-2 space-y-3">
      <div className="flex max-w-md items-center justify-between rounded-lg border bg-muted/30 p-4">
        <div>
          <p className="font-medium">Elegível para anúncios</p>
          <Badge variant={elegivel ? 'default' : 'secondary'}>
            {elegivel ? 'Sim' : 'Não'}
          </Badge>
        </div>
        <Switch
          checked={elegivel}
          onCheckedChange={toggleElegivel}
          disabled={atualizarElegibilidade.isPending}
        />
      </div>

      {elegivel && !aCarregarAtual && (
        <div className="max-w-md rounded-lg border p-4">
          {anuncioAtual ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-medium">{anuncioAtual.cliente_nome}</span>
              <span>{anuncioAtual.preco.toFixed(2)} €</span>
              <span className="text-muted-foreground">
                {formatarDataPt(anuncioAtual.data_inicio)} a {formatarDataPt(anuncioAtual.data_fim)}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={desatribuir.isPending}
                onClick={() =>
                  desatribuir.mutate(
                    { anuncioId: anuncioAtual.id },
                    { onError: () => toast.error('Não foi possível desatribuir.') }
                  )
                }
              >
                Desatribuir
              </Button>
            </div>
          ) : (
            <Select onValueChange={escolherAnuncio} disabled={atribuir.isPending}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    porAtribuir.length === 0
                      ? 'Sem anúncios por atribuir'
                      : 'Escolher que empresa tem anúncio nesta viatura'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {porAtribuir.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {formatarRotuloAnuncio(a)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
    </div>
  );
}
