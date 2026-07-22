import {
  Calculator,
  FormInput,
  UserPlus,
  CreditCard,
  Wifi,
  FileText,
  Lock,
  Layers,
  Plug,
  FileSignature,
} from 'lucide-react';

// O tour mostra 8 módulos — o produto tem mais. Isto alimenta o painel
// "E muito mais", que funciona como ponte entre o produto e o contacto.
export const MAIS_MODULOS = [
  { label: 'Administrativo & Faturação', icon: Calculator },
  { label: 'Formulários personalizados', icon: FormInput },
  { label: 'Convites de equipa', icon: UserPlus },
  { label: 'Cartões de frota', icon: CreditCard },
  { label: 'Dispositivos OBE', icon: Wifi },
  { label: 'Documentos & modelos', icon: FileText },
  { label: 'Permissões por cargo', icon: Lock },
  { label: 'Multi-organização', icon: Layers },
  { label: 'Integrações (Uber, Bolt, Via Verde)', icon: Plug },
  { label: 'Handover digital com assinatura', icon: FileSignature },
];
