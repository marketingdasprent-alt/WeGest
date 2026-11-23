import type { PedidoTrocaKms } from '@/hooks/usePedidosTrocaKms';

export const ROTA_PEDIDOS_ALTERACAO = '/renting/pedidos-kms';

export const LABEL_VALOR: Record<PedidoTrocaKms['tipo'], { label: string; sufixo: string }> = {
  kms: { label: 'Kms incluídos', sufixo: '' },
  franquia: { label: 'Franquia', sufixo: ' €' },
  tarifa: { label: 'Tarifa diária', sufixo: ' €' },
  preco_semana: { label: 'Valor semanal', sufixo: ' €' },
};

export const TIPO_BADGE_LABEL: Record<PedidoTrocaKms['tipo'], string> = {
  kms: 'Kms',
  franquia: 'Franquia',
  tarifa: 'Tarifa',
  preco_semana: 'Valor semanal',
};
