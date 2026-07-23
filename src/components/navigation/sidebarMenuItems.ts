import type React from 'react';
import {
  LayoutDashboard,
  BarChart3,
  User,
  FileText,
  ClipboardCheck,
  Wrench,
  Car,
  Wallet,
  CalendarDays,
  Mail,
  KeyRound,
  CalendarCheck,
  Users,
  Layers,
  Tag,
  ShieldCheck,
  PackagePlus,
  Percent,
  Fuel,
  CarFront,
  Calculator,
  CreditCard,
  Wifi,
  Banknote,
  Gauge,
  ExternalLink,
  Ticket,
} from 'lucide-react';
import { REALIZE_ORG_IDS } from '@/config/realize';

export interface SubSubMenuItem {
  label: string;
  url: string;
  icon?: React.ComponentType<{ className?: string }>;
  recurso?: string;
}

export interface SubMenuItem {
  label: string;
  url?: string;
  icon?: React.ComponentType<{ className?: string }>;
  recurso?: string;
  /** Só visível para Admin ou cargo 'Supervisor Gestor TVDE' (ex.: aprovação de pedidos). */
  requireSupervisorTvde?: boolean;
  subItems?: SubSubMenuItem[];
}

export interface MenuItem {
  label: string;
  url?: string;
  icon: React.ComponentType<{ className?: string }>;
  recurso?: string;
  /** Mostra o item se o utilizador tiver QUALQUER um destes recursos. */
  recursosAny?: string[];
  requireAdmin?: boolean;
  /** Restringe o item a orgs específicas (ex.: ferramentas internas que não fazem sentido para outros tenants). */
  orgIds?: string[];
  subItems?: SubMenuItem[];
}

export const MENU_ITEMS: MenuItem[] = [
  { label: 'Dashboard', url: '/dashboard', icon: LayoutDashboard, recurso: 'motoristas_gestao' },
  {
    label: 'Renting',
    icon: KeyRound,
    subItems: [
      {
        label: 'Contratos',
        url: '/renting/contratos',
        icon: FileText,
        recurso: 'renting_contratos',
      },
      {
        label: 'Reservas',
        url: '/renting/reservas',
        icon: CalendarCheck,
        recurso: 'renting_reservas',
      },
      {
        label: 'Clientes',
        url: '/renting/clientes',
        icon: Users,
        recurso: 'renting_clientes',
      },
      {
        label: 'Pedidos de Kms',
        url: '/renting/pedidos-kms',
        icon: Gauge,
        recurso: 'renting_contratos',
        requireSupervisorTvde: true,
      },
      {
        label: 'Tarifas',
        icon: Tag,
        recurso: 'renting_contratos',
        subItems: [
          { label: 'Tarifas', url: '/renting/tarifas', icon: Tag, recurso: 'renting_contratos' },
          {
            label: 'Coberturas',
            url: '/renting/tarifas/coberturas',
            icon: ShieldCheck,
            recurso: 'renting_contratos',
          },
          {
            label: 'Extras',
            url: '/renting/tarifas/extras',
            icon: PackagePlus,
            recurso: 'renting_contratos',
          },
          {
            label: 'Taxas',
            url: '/renting/tarifas/taxas',
            icon: Percent,
            recurso: 'renting_contratos',
          },
        ],
      },
    ],
  },
  {
    label: 'Frota',
    icon: Car,
    recurso: 'viaturas_ver',
    subItems: [
      { label: 'Viaturas', url: '/viaturas', icon: Car },
      { label: 'Grupos', url: '/viaturas/grupos', icon: Layers },
      { label: 'Marcas / Modelos', url: '/viaturas/marcas-modelos', icon: CarFront },
      { label: 'Combustíveis', url: '/viaturas/combustiveis', icon: Fuel },
      { label: 'Tipos', url: '/viaturas/tipos', icon: Tag },
    ],
  },
  {
    label: 'Motoristas',
    icon: User,
    recurso: 'motoristas_gestao',
    subItems: [
      { label: 'Todos Motoristas', url: '/motoristas', icon: User },
      { label: 'Aprovação', url: '/motoristas/candidaturas', icon: ClipboardCheck },
      { label: 'Contratos', url: '/contratos', icon: FileText },
    ],
  },
  {
    label: 'Administrativo',
    icon: Wallet,
    // Mostra com QUALQUER permissão do módulo Administrativo (igual ao AppSidebar).
    recursosAny: [
      'financeiro_recibos',
      'recibos_verdes_adicionar',
      'administrativo_resumos',
      'administrativo_importar',
      'administrativo_plataformas',
      'administrativo_cartoes',
    ],
    subItems: [
      {
        label: 'Resumos',
        url: '/administrativo',
        icon: Calculator,
        recurso: 'administrativo_resumos',
      },
      {
        label: 'Faturação',
        url: '/administrativo/faturacao',
        icon: Banknote,
        recurso: 'financeiro_recibos',
      },
      {
        label: 'Cartões Frota',
        url: '/administrativo/cartoes',
        icon: CreditCard,
        recurso: 'administrativo_cartoes',
      },
      {
        label: 'Dispositivos OBE',
        url: '/administrativo/obe',
        icon: Wifi,
        recurso: 'administrativo_cartoes',
      },
    ],
  },
  { label: 'Movimentações', url: '/calendario', icon: CalendarDays, recurso: 'calendario_ver' },
  { label: 'Assistência', url: '/assistencia', icon: Wrench, recurso: 'assistencia_tickets' },
  { label: 'Meus Tickets', url: '/meus-tickets', icon: Ticket, recurso: 'motoristas_crm' },
  { label: 'Marketing', url: '/marketing', icon: Mail, recurso: 'marketing_ver' },
  { label: 'CRM', url: '/crm', icon: BarChart3, recurso: 'motoristas_crm' },
  { label: 'Realize', url: '/realize', icon: ExternalLink, orgIds: REALIZE_ORG_IDS },
];
