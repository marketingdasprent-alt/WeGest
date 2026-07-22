import {
  LayoutDashboard,
  KeyRound,
  Car,
  User,
  CalendarDays,
  Wrench,
  BarChart3,
  Mail,
  HelpCircle,
  MessageCircle,
  Building2,
  ScrollText,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

export interface TourModuleMeta {
  key: string;
  label: string;
  icon: LucideIcon;
}

// Os 8 módulos reais do produto + FAQ e Contacto — o percurso "principal"
// do tour, navegável por scroll ou clique na sidebar. O tour não faz
// distinção entre uma página do sistema e a informação institucional,
// tudo é sistema.
export const TOUR_MODULES: TourModuleMeta[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'renting', label: 'Renting', icon: KeyRound },
  { key: 'frota', label: 'Frota', icon: Car },
  { key: 'motoristas', label: 'Motoristas', icon: User },
  { key: 'movimentacoes', label: 'Movimentações', icon: CalendarDays },
  { key: 'assistencia', label: 'Assistência', icon: Wrench },
  { key: 'crm', label: 'CRM', icon: BarChart3 },
  { key: 'marketing', label: 'Marketing', icon: Mail },
  { key: 'mais', label: 'E muito mais', icon: Sparkles },
  { key: 'faq', label: 'FAQ', icon: HelpCircle },
  { key: 'contacto', label: 'Contacto', icon: MessageCircle },
];

// Índice do separador de contacto — usado sempre que um CTA "Fale connosco"
// precisa de saltar direto para o formulário, em vez de rota própria (não
// há self-serve: a organização só é criada depois de assinar connosco).
export const CONTACT_INDEX = TOUR_MODULES.findIndex((module) => module.key === 'contacto');

// Grupo institucional — só acessível por clique (não entra no scroll
// automático do tour principal, que já tem 10 paragens), mas continua
// dentro da mesma sidebar/sistema em vez de ser um site à parte.
export const TOUR_INSTITUTIONAL_MODULES: TourModuleMeta[] = [
  { key: 'sobre', label: 'Sobre', icon: Building2 },
  { key: 'termos', label: 'Termos', icon: ScrollText },
  { key: 'privacidade', label: 'Privacidade', icon: ShieldCheck },
];
