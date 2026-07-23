import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, Car, ImageIcon, Eye, ChevronRight, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { DanoCategoriaBadge } from '@/components/viaturas/DanoCategoriaBadge';

interface Dano {
  id: string;
  descricao: string;
  localizacao: string | null;
  data_ocorrencia: string | null;
  data_registo: string;
  valor: number;
  categoria: { id: string; nome: string; cor: string | null } | null;
  viatura: {
    matricula: string;
    marca: string;
    modelo: string;
  } | null;
  fotos: Array<{
    id: string;
    ficheiro_url: string;
    nome_ficheiro: string | null;
  }>;
  status_pagamento: 'por_pagar' | 'pago' | 'sem_debito';
}

interface MotoristaDanosCardProps {
  motoristaId: string;
}

const STATUS_PAGAMENTO = {
  por_pagar: {
    label: 'Por Pagar',
    color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  },
  pago: {
    label: 'Pago',
    color: 'bg-green-500/10 text-green-600 border-green-500/20',
  },
  sem_debito: {
    label: 'Sem Débito',
    color: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20',
  },
};

export function MotoristaDanosCard({ motoristaId }: MotoristaDanosCardProps) {
  const [danos, setDanos] = useState<Dano[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDano, setSelectedDano] = useState<Dano | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    loadDanos();
  }, [motoristaId]);

  async function loadDanos() {
    try {
      // Buscar danos do motorista
      const { data: danosData, error: danosError } = await supabase
        .from('viatura_danos')
        .select(
          `
          id,
          descricao,
          localizacao,
          data_ocorrencia,
          data_registo,
          valor,
          viatura_id,
          viaturas (
            matricula,
            marca,
            modelo
          ),
          categoria:assistencia_categorias (
            id,
            nome,
            cor
          )
        `
        )
        .eq('motorista_id', motoristaId)
        .order('created_at', { ascending: false });

      if (danosError) throw danosError;

      // Para cada dano, buscar as fotos e o status de pagamento
      const danosComFotosEStatus: Dano[] = [];
      for (const dano of danosData || []) {
        // Buscar fotos
        const { data: fotos } = await supabase
          .from('viatura_dano_fotos')
          .select('id, ficheiro_url, nome_ficheiro')
          .eq('dano_id', dano.id);

        // Buscar status de pagamento do movimento financeiro
        const { data: movimento } = await supabase
          .from('motorista_financeiro')
          .select('status')
          .eq('dano_id', dano.id)
          .maybeSingle();

        let status_pagamento: 'por_pagar' | 'pago' | 'sem_debito';
        if (!movimento) {
          status_pagamento = 'sem_debito';
        } else if (movimento.status === 'pago') {
          status_pagamento = 'pago';
        } else {
          status_pagamento = 'por_pagar';
        }

        danosComFotosEStatus.push({
          id: dano.id,
          descricao: dano.descricao,
          localizacao: dano.localizacao,
          data_ocorrencia: dano.data_ocorrencia,
          data_registo: dano.data_registo,
          valor: dano.valor || 0,
          categoria: dano.categoria as Dano['categoria'],
          viatura: dano.viaturas as Dano['viatura'],
          fotos: fotos || [],
          status_pagamento,
        });
      }

      setDanos(danosComFotosEStatus);
    } catch (error) {
      console.error('Erro ao carregar danos:', error);
    } finally {
      setLoading(false);
    }
  }

  function formatCurrency(value: number) {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  }

  function getStatusConfig(status: Dano['status_pagamento']) {
    return STATUS_PAGAMENTO[status] || STATUS_PAGAMENTO.por_pagar;
  }

  const totalDanos = danos.reduce((sum, d) => sum + (d.valor || 0), 0);
  const danosPorPagar = danos.filter((d) => d.status_pagamento === 'por_pagar').length;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Danos Registados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-20 bg-muted rounded" />
            <div className="h-20 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="shadow-sm rounded-[2rem] overflow-hidden border-border bg-background leading-relaxed">
        <CardHeader className="p-8 pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-black flex items-center gap-3">
              <div className="p-2 bg-destructive/10 rounded-xl">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              Danos Registados
            </CardTitle>
            {danos.length > 0 && (
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">
                  Total Acumulado
                </p>
                <p className="text-xl font-black text-destructive">{formatCurrency(totalDanos)}</p>
              </div>
            )}
          </div>
          {danosPorPagar > 0 && (
            <div className="mt-2 flex items-center gap-2 text-xs font-bold text-orange-600 bg-orange-500/10 px-3 py-1.5 rounded-lg w-fit">
              <Clock className="w-3 h-3" />
              {danosPorPagar} dano(s) por liquidar
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {danos.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4 border border-border">
                <Car className="h-8 w-8 opacity-20" />
              </div>
              <p className="font-bold text-foreground">Viatura sem danos</p>
              <p className="text-xs font-medium">Bom trabalho! Continue a conduzir com cuidado.</p>
            </div>
          ) : (
            <div className="divide-y divide-border max-h-[320px] overflow-y-auto scrollbar-hide">
              {danos.map((dano) => {
                const statusConfig = getStatusConfig(dano.status_pagamento);
                const dataDisplay = dano.data_ocorrencia || dano.data_registo;

                return (
                  <div
                    key={dano.id}
                    className="p-6 cursor-pointer hover:bg-muted/30 transition-all group flex items-center justify-between gap-4"
                    onClick={() => setSelectedDano(dano)}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div
                        className={cn(
                          'w-12 h-12 rounded-2xl flex items-center justify-center border border-border shadow-sm group-hover:border-primary/20 transition-all',
                          dano.status_pagamento === 'pago' ? 'bg-green-500/5' : 'bg-destructive/5'
                        )}
                      >
                        <AlertTriangle
                          className={cn(
                            'w-6 h-6',
                            dano.status_pagamento === 'pago' ? 'text-green-600' : 'text-destructive'
                          )}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-foreground group-hover:text-primary transition-colors truncate">
                          {dano.descricao}
                        </p>
                        <DanoCategoriaBadge categoria={dano.categoria} />
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            {format(new Date(dataDisplay), 'dd MMM yyyy', { locale: pt })}
                          </span>
                          {dano.fotos.length > 0 && (
                            <div className="flex items-center gap-1 text-[10px] font-black text-primary uppercase">
                              <ImageIcon className="h-3 w-3" />
                              <span>{dano.fotos.length} FOTOS</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="font-black text-foreground">{formatCurrency(dano.valor)}</p>
                        <div
                          className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider mt-1 border',
                            statusConfig.color
                          )}
                        >
                          {statusConfig.label}
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de detalhes do dano */}
      <Dialog open={!!selectedDano} onOpenChange={() => setSelectedDano(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes do Dano</DialogTitle>
          </DialogHeader>
          {selectedDano && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Descrição</p>
                <p className="font-medium">{selectedDano.descricao}</p>
                <div className="mt-1">
                  <DanoCategoriaBadge categoria={selectedDano.categoria} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Data</p>
                  <p className="font-medium">
                    {format(
                      new Date(selectedDano.data_ocorrencia || selectedDano.data_registo),
                      "d 'de' MMMM 'de' yyyy",
                      { locale: pt }
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Pagamento</p>
                  <Badge
                    variant="outline"
                    className={getStatusConfig(selectedDano.status_pagamento).color}
                  >
                    {getStatusConfig(selectedDano.status_pagamento).label}
                  </Badge>
                </div>
              </div>

              {selectedDano.viatura && (
                <div>
                  <p className="text-sm text-muted-foreground">Viatura</p>
                  <p className="font-medium">
                    {selectedDano.viatura.matricula} - {selectedDano.viatura.marca}{' '}
                    {selectedDano.viatura.modelo}
                  </p>
                </div>
              )}

              <div>
                <p className="text-sm text-muted-foreground">Valor</p>
                <p className="text-xl font-bold text-destructive">
                  {formatCurrency(selectedDano.valor)}
                </p>
              </div>

              {selectedDano.fotos.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Fotografias</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedDano.fotos.map((foto) => (
                      <div
                        key={foto.id}
                        className="relative w-24 h-24 rounded-lg overflow-hidden border cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setLightboxUrl(foto.ficheiro_url)}
                      >
                        <img
                          src={foto.ficheiro_url}
                          alt={foto.nome_ficheiro || 'Foto do dano'}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity">
                          <Eye className="h-5 w-5 text-white" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Lightbox para foto */}
      <Dialog open={!!lightboxUrl} onOpenChange={() => setLightboxUrl(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Fotografia</DialogTitle>
          </DialogHeader>
          {lightboxUrl && (
            <div className="flex items-center justify-center">
              <img
                src={lightboxUrl}
                alt="Foto do dano"
                className="max-h-[70vh] max-w-full object-contain rounded-lg"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
