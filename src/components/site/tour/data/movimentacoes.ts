interface MovimentacaoEvento {
  matricula: string;
  destino: string;
  tipo: 'entrega' | 'recolha' | 'troca' | 'interna';
}

interface MovimentacaoDia {
  dia: number;
  atual: boolean;
  eventos: MovimentacaoEvento[];
}

const evt = (
  matricula: string,
  destino: string,
  tipo: MovimentacaoEvento['tipo']
): MovimentacaoEvento => ({
  matricula,
  destino,
  tipo,
});

// Grelha de Julho 2026 (Seg–Dom), fiel ao número de eventos/dia do
// screenshot de referência — só para dar densidade visual real ao mês.
export const MOVIMENTACOES_SEMANAS: MovimentacaoDia[][] = [
  [
    {
      dia: 29,
      atual: false,
      eventos: [evt('BJ-96-GM', 'Leiria', 'entrega'), evt('BS-31-NH', 'Leiria', 'recolha')],
    },
    {
      dia: 30,
      atual: false,
      eventos: [evt('BN-20-LQ', 'Leiria', 'entrega'), evt('BI-40-LC', 'Leiria', 'recolha')],
    },
    {
      dia: 1,
      atual: false,
      eventos: [evt('BS-52-PX', 'Prior Velho', 'entrega'), evt('BN-36-MG', 'Leiria', 'entrega')],
    },
    {
      dia: 2,
      atual: false,
      eventos: [evt('BN-20-NU', 'Leiria', 'entrega'), evt('BO-24-BR', 'Leiria', 'interna')],
    },
    {
      dia: 3,
      atual: false,
      eventos: [evt('BL-92-BQ', 'Leiria', 'entrega'), evt('BO-75-DF', '—', 'troca')],
    },
    { dia: 4, atual: false, eventos: [evt('BC-90-CT', 'Leiria', 'entrega')] },
    {
      dia: 5,
      atual: false,
      eventos: [evt('BL-84-BH', 'Prior Velho', 'entrega'), evt('BO-75-DF', 'Leiria', 'recolha')],
    },
  ],
  [
    {
      dia: 6,
      atual: false,
      eventos: [evt('BI-91-LC', 'Leiria', 'entrega'), evt('BO-37-LJ', '—', 'troca')],
    },
    {
      dia: 7,
      atual: false,
      eventos: [evt('BM-87-LX', 'Leiria', 'entrega'), evt('CH-16-GO', 'Prior Velho', 'recolha')],
    },
    { dia: 8, atual: false, eventos: [evt('BI-06-LD', 'Leiria', 'interna')] },
    {
      dia: 9,
      atual: false,
      eventos: [evt('BJ-66-GL', 'Leiria', 'entrega'), evt('BJ-85-GL', 'Leiria', 'recolha')],
    },
    {
      dia: 10,
      atual: false,
      eventos: [evt('BO-74-HR', 'Leiria', 'entrega'), evt('BL-30-BR', 'Prior Velho', 'recolha')],
    },
    { dia: 11, atual: false, eventos: [evt('BN-45-IO', 'Leiria', 'entrega')] },
    { dia: 12, atual: false, eventos: [evt('BI-87-LB', '—', 'interna')] },
  ],
  [
    { dia: 13, atual: false, eventos: [evt('BL-32-HM', 'Leiria', 'entrega')] },
    { dia: 14, atual: false, eventos: [evt('BI-82-XC', '—', 'interna')] },
    {
      dia: 15,
      atual: false,
      eventos: [evt('BS-76-XS', 'Leiria', 'recolha'), evt('BN-00-SG', 'V.N. Gaia', 'entrega')],
    },
    {
      dia: 16,
      atual: false,
      eventos: [evt('BO-75-DF', 'Prior Velho', 'recolha'), evt('BV-61-QO', 'Leiria', 'entrega')],
    },
    { dia: 17, atual: false, eventos: [evt('BL-32-RS', 'Leiria', 'entrega')] },
    { dia: 18, atual: false, eventos: [] },
    {
      dia: 19,
      atual: false,
      eventos: [evt('BR-51-MD', 'Açores', 'entrega'), evt('BP-14-VE', 'Açores', 'recolha')],
    },
  ],
  [
    { dia: 20, atual: false, eventos: [evt('BJ-22-GN', 'Prior Velho', 'entrega')] },
    { dia: 21, atual: false, eventos: [evt('BO-87-HR', 'Prior Velho', 'entrega')] },
    {
      dia: 22,
      atual: true,
      eventos: [evt('BO-73-DF', 'Leiria', 'recolha'), evt('BL-84-BH', 'Prior Velho', 'entrega')],
    },
    { dia: 23, atual: false, eventos: [evt('BJ-55-GJ', 'V.N. Gaia', 'entrega')] },
    { dia: 24, atual: false, eventos: [evt('BC-23-ZN', 'Leiria', 'recolha')] },
    { dia: 25, atual: false, eventos: [] },
    { dia: 26, atual: false, eventos: [evt('BS-13-NI', 'Leiria', 'entrega')] },
  ],
];
