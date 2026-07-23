import { Car, CheckCircle2, Navigation, Wrench } from 'lucide-react';

export const FROTA_STATS = [
  { label: 'Total de viaturas', value: 62, icon: Car, tone: 'blue' as const, highlighted: true },
  { label: 'Disponíveis', value: 18, icon: CheckCircle2, tone: 'green' as const },
  { label: 'Em uso', value: 41, icon: Navigation, tone: 'blue' as const },
  { label: 'Manutenção', value: 3, icon: Wrench, tone: 'amber' as const },
];

export const FROTA_CATEGORIAS = [
  { label: 'TVDE', value: 38, tone: 'violet' as const },
  { label: 'Rent-a-car', value: 24, tone: 'blue' as const },
];

export const FROTA_VIATURAS = [
  {
    matricula: 'AA-12-BC',
    modelo: 'Renault Clio',
    ano: 2021,
    categoria: 'TVDE',
    combustivel: 'Diesel',
    estado: 'Em contrato',
    km: '41 280 km',
    inspecao: { data: '12 ago 2026', urgente: false },
  },
  {
    matricula: 'CD-45-EF',
    modelo: 'Peugeot 208',
    ano: 2022,
    categoria: 'TVDE',
    combustivel: 'Elétrico',
    estado: 'Em contrato',
    km: '38 910 km',
    inspecao: { data: '28 jul 2026', urgente: true },
  },
  {
    matricula: 'GH-78-IJ',
    modelo: 'Dacia Sandero',
    ano: 2020,
    categoria: 'Rent-a-car',
    combustivel: 'Gasolina',
    estado: 'Disponível',
    km: '22 105 km',
    inspecao: { data: '03 nov 2026', urgente: false },
  },
  {
    matricula: 'ST-56-UV',
    modelo: 'Hyundai i20',
    ano: 2019,
    categoria: 'TVDE',
    combustivel: 'Diesel',
    estado: 'Manutenção',
    km: '55 470 km',
    inspecao: { data: '19 jul 2026', urgente: true },
  },
  {
    matricula: 'OP-34-QR',
    modelo: 'VW Polo',
    ano: 2022,
    categoria: 'Rent-a-car',
    combustivel: 'Diesel',
    estado: 'Em contrato',
    km: '29 640 km',
    inspecao: { data: '14 set 2026', urgente: false },
  },
  {
    matricula: 'ML-09-JR',
    modelo: 'Toyota Yaris',
    ano: 2023,
    categoria: 'TVDE',
    combustivel: 'Híbrido',
    estado: 'Em reserva',
    km: '9 340 km',
    inspecao: { data: '02 jan 2027', urgente: false },
  },
];
