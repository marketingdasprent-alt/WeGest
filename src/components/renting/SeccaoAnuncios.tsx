import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

import {
  useAtualizarElegibilidadeCliente,
  useAtualizarAnuncio,
  useApagarAnuncio,
  useClienteAnuncios,
  useClienteElegivelAnuncios,
  useCriarAnuncio,
  useDesatribuirAnuncio,
} from '@/hooks/useClienteAnuncios';
import { formatarDataPt } from '@/types/anuncio';

interface SeccaoAnunciosProps {
  clienteId: string;
}

interface FormAnuncio {
  preco: string;
  dataInicio: string;
  dataFim: string;
}

const FORM_VAZIO: FormAnuncio = { preco: '', dataInicio: '', dataFim: '' };

/**
 * "Anúncios" — só para clientes empresa. O toggle não espera pelo "Guardar"
 * do formulário do cliente: grava logo, tal como o da viatura
 * (AnunciosViaturaCard). Desligar esconde a lista, nunca apaga nada.
 */
export function SeccaoAnuncios({ clienteId }: SeccaoAnunciosProps) {
  const { data: elegivel = false } = useClienteElegivelAnuncios(clienteId);
  const atualizarElegibilidade = useAtualizarElegibilidadeCliente();
  const { data: anuncios = [] } = useClienteAnuncios(clienteId);
  const criarAnuncio = useCriarAnuncio();
  const atualizarAnuncio = useAtualizarAnuncio();
  const apagarAnuncio = useApagarAnuncio();
  const desatribuir = useDesatribuirAnuncio();

  const [aAdicionar, setAAdicionar] = useState(false);
  const [novo, setNovo] = useState<FormAnuncio>(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<FormAnuncio>(FORM_VAZIO);

  const iniciarEdicao = (a: (typeof anuncios)[number]) => {
    setEditandoId(a.id);
    setEdicao({ preco: String(a.preco), dataInicio: a.data_inicio, dataFim: a.data_fim });
  };

  const guardarEdicao = async (anuncioId: string) => {
    const preco = Number(edicao.preco.replace(',', '.'));
    if (!Number.isFinite(preco) || preco < 0 || !edicao.dataInicio || !edicao.dataFim) {
      toast.error('Preenche o preço e as duas datas.');
      return;
    }
    try {
      await atualizarAnuncio.mutateAsync({
        anuncioId,
        preco,
        dataInicio: edicao.dataInicio,
        dataFim: edicao.dataFim,
      });
      setEditandoId(null);
      toast.success('Anúncio actualizado.');
    } catch {
      toast.error('Não foi possível actualizar o anúncio.');
    }
  };

  const toggleElegivel = (checked: boolean) => {
    atualizarElegibilidade.mutate(
      { clienteId, elegivel: checked },
      { onError: () => toast.error('Não foi possível actualizar a elegibilidade.') }
    );
  };

  const submeterNovo = async () => {
    const preco = Number(novo.preco.replace(',', '.'));
    if (!Number.isFinite(preco) || preco < 0 || !novo.dataInicio || !novo.dataFim) {
      toast.error('Preenche o preço e as duas datas.');
      return;
    }
    try {
      await criarAnuncio.mutateAsync({
        clienteId,
        preco,
        dataInicio: novo.dataInicio,
        dataFim: novo.dataFim,
      });
      setNovo(FORM_VAZIO);
      setAAdicionar(false);
      toast.success('Anúncio criado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível criar o anúncio.');
    }
  };

  return (
    <div className="space-y-4 border-t pt-6">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Anúncios
      </h3>

      <Card className="flex max-w-md items-center justify-between p-4">
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
      </Card>

      {elegivel && (
        <div className="space-y-3">
          <Button type="button" size="sm" variant="outline" onClick={() => setAAdicionar((v) => !v)}>
            Adicionar anúncio
          </Button>

          {aAdicionar && (
            <Card className="max-w-lg space-y-3 p-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="anuncio-preco">Preço (€)</Label>
                  <Input
                    id="anuncio-preco"
                    inputMode="decimal"
                    value={novo.preco}
                    onChange={(e) => setNovo((v) => ({ ...v, preco: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="anuncio-inicio">Início</Label>
                  <Input
                    id="anuncio-inicio"
                    type="date"
                    value={novo.dataInicio}
                    onChange={(e) => setNovo((v) => ({ ...v, dataInicio: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="anuncio-fim">Fim</Label>
                  <Input
                    id="anuncio-fim"
                    type="date"
                    value={novo.dataFim}
                    onChange={(e) => setNovo((v) => ({ ...v, dataFim: e.target.value }))}
                  />
                </div>
              </div>
              <Button type="button" size="sm" disabled={criarAnuncio.isPending} onClick={submeterNovo}>
                Guardar anúncio
              </Button>
            </Card>
          )}

          {anuncios.length === 0 && !aAdicionar && (
            <p className="text-sm text-muted-foreground">Ainda não há anúncios.</p>
          )}

          {anuncios.map((a) =>
            editandoId === a.id ? (
              <Card key={a.id} className="max-w-lg space-y-3 p-4">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor={`edicao-preco-${a.id}`}>Preço (€)</Label>
                    <Input
                      id={`edicao-preco-${a.id}`}
                      inputMode="decimal"
                      value={edicao.preco}
                      onChange={(e) => setEdicao((v) => ({ ...v, preco: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`edicao-inicio-${a.id}`}>Início</Label>
                    <Input
                      id={`edicao-inicio-${a.id}`}
                      type="date"
                      value={edicao.dataInicio}
                      onChange={(e) => setEdicao((v) => ({ ...v, dataInicio: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`edicao-fim-${a.id}`}>Fim</Label>
                    <Input
                      id={`edicao-fim-${a.id}`}
                      type="date"
                      value={edicao.dataFim}
                      onChange={(e) => setEdicao((v) => ({ ...v, dataFim: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={atualizarAnuncio.isPending}
                    onClick={() => guardarEdicao(a.id)}
                  >
                    Guardar
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditandoId(null)}>
                    Cancelar
                  </Button>
                </div>
              </Card>
            ) : (
            <Card key={a.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <span className="font-medium">{a.preco.toFixed(2)} €</span>
              <span className="text-muted-foreground">
                {formatarDataPt(a.data_inicio)} a {formatarDataPt(a.data_fim)}
              </span>
              <Button type="button" size="sm" variant="ghost" onClick={() => iniciarEdicao(a)}>
                Editar
              </Button>
              {a.viatura_matricula ? (
                <>
                  <Badge variant="outline">{a.viatura_matricula}</Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={desatribuir.isPending}
                    onClick={() =>
                      desatribuir.mutate(
                        { anuncioId: a.id },
                        { onError: () => toast.error('Não foi possível desatribuir.') }
                      )
                    }
                  >
                    Desatribuir
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-muted-foreground">Sem viatura atribuída</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={apagarAnuncio.isPending}
                    onClick={() =>
                      apagarAnuncio.mutate(
                        { anuncioId: a.id },
                        { onError: (e) => toast.error(e.message) }
                      )
                    }
                  >
                    Apagar
                  </Button>
                </>
              )}
            </Card>
            )
          )}
        </div>
      )}
    </div>
  );
}
