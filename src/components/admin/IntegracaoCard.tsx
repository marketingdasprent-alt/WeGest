import React from 'react';
import { SINCRONIZACAO_ATIVA } from '@/config/sync';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  CheckCircle,
  MoreVertical,
  Pencil,
  RefreshCw,
  Trash2,
  Power,
  Upload,
  Play,
  Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

export type IntegracaoCardType =
  | 'bolt'
  | 'uber'
  | 'via_verde'
  | 'combustivel'
  | 'robot'
  | 'faturacao'
  | 'email'
  | 'cartrack';

export interface IntegracaoCardData {
  id: string;
  type: IntegracaoCardType;
  nome: string;
  ativo: boolean;
  ultimoSync: string | null;
  username: string | null;
  password: string | null;
  connectionMode: 'api' | 'upload' | 'ftp';
  subLabel?: string;
  rawData?: any;
  logoUrl?: string | null;
}

interface IntegracaoCardProps {
  data: IntegracaoCardData;
  onEdit: (data: IntegracaoCardData) => void;
  onSync?: (data: IntegracaoCardData) => void;
  onToggle?: (data: IntegracaoCardData) => void;
  onDelete?: (data: IntegracaoCardData) => void;
  onImport?: (data: IntegracaoCardData) => void;
  onExecute?: (data: IntegracaoCardData) => void;
  isExecuting?: boolean;
}

const PLATFORM_META: Record<IntegracaoCardType, { label: string; logo: string; color: string }> = {
  bolt: {
    label: 'Bolt',
    logo: '/images/logo-bolt.png',
    color: 'hsl(var(--chart-3))',
  },
  uber: {
    label: 'Uber',
    logo: '/images/logo-uber.png',
    color: 'hsl(var(--foreground))',
  },
  via_verde: {
    label: 'Via Verde',
    logo: '/images/logo-via-verde.png',
    color: 'hsl(var(--chart-2))',
  },
  combustivel: {
    label: 'BP Fleet',
    logo: '/images/comfort.png',
    color: 'hsl(var(--chart-4))',
  },
  robot: {
    label: 'Robot',
    logo: '/images/comfort.png',
    color: 'hsl(var(--chart-5))',
  },
  faturacao: {
    label: 'Faturação',
    logo: '/images/logo-keyinvoice.svg',
    color: 'hsl(var(--chart-1))',
  },
  email: {
    label: 'Brevo',
    logo: '/images/logo-brevo.png',
    color: 'hsl(var(--chart-2))',
  },
  cartrack: {
    label: 'Cartrack',
    logo: '/images/logo-cartrack.png',
    color: 'hsl(var(--chart-1))',
  },
};
export const IntegracaoCard: React.FC<IntegracaoCardProps> = ({
  data,
  onEdit,
  onSync,
  onToggle,
  onDelete,
  onImport,
  onExecute,
  isExecuting,
}) => {
  const meta = PLATFORM_META[data.type];

  const lastSyncFormatted = data.ultimoSync
    ? format(new Date(data.ultimoSync), 'dd/MM/yyyy', { locale: pt })
    : null;

  const isWebhookMode = data.rawData?.auth_mode === 'webhook';
  const connectionLabel = data.ativo
    ? data.connectionMode === 'api'
      ? isWebhookMode
        ? 'Webhook Activo'
        : 'Conectado'
      : data.connectionMode === 'ftp'
        ? 'FTP Activo'
        : 'Upload manual'
    : 'Inactivo';

  const connectionDotColor = data.ativo ? 'bg-emerald-500' : 'bg-muted-foreground/40';

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur-sm hover:border-border transition-colors">
      <CardContent className="p-5 space-y-4">
        {/* Header: Logo + Name + Menu */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted/60 flex items-center justify-center overflow-hidden p-1">
              <img
                src={data.logoUrl || meta.logo}
                alt={meta.label}
                className="h-full w-full object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{data.nome}</span>
                {data.ativo && <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />}
              </div>
              {lastSyncFormatted && (
                <p className="text-xs text-muted-foreground">Atualizado até {lastSyncFormatted}</p>
              )}
              {data.subLabel && !lastSyncFormatted && (
                <p className="text-xs text-muted-foreground">{data.subLabel}</p>
              )}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(data)}>
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </DropdownMenuItem>
              {SINCRONIZACAO_ATIVA && onSync && (
                <DropdownMenuItem onClick={() => onSync(data)}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Sincronizar
                </DropdownMenuItem>
              )}
              {onToggle && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onToggle(data)}>
                    <Power className="mr-2 h-4 w-4" />
                    {data.ativo ? 'Desactivar' : 'Activar'}
                  </DropdownMenuItem>
                </>
              )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onDelete(data)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Eliminar
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Connection status */}
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${connectionDotColor}`} />
          <span className="text-xs text-muted-foreground">{connectionLabel}</span>
          {/* Via Verde e Cartrack são exceções ao kill-switch SINCRONIZACAO_ATIVA:
              Via Verde pelo mesmo motivo do guard em robot-execute; Cartrack por ser
              API REST directa (não robô Apify), o kill-switch não se lhe aplica. */}
          {(SINCRONIZACAO_ATIVA || data.type === 'via_verde' || data.type === 'cartrack') &&
            data.ativo &&
            onExecute && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={isExecuting}
              onClick={(e) => {
                e.stopPropagation();
                onExecute(data);
              }}
            >
              {isExecuting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              ) : (
                <Play className="h-3.5 w-3.5 text-emerald-500" />
              )}
            </Button>
          )}
          {onImport ? (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-6 text-[10px] px-2 py-0"
              onClick={(e) => {
                e.stopPropagation();
                onImport(data);
              }}
            >
              <Upload className="h-3 w-3 mr-1" />
              Importar
            </Button>
          ) : (
            <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
              {meta.label}
            </Badge>
          )}
        </div>

        {/* Upload manual mode placeholder */}
        {!data.username && data.connectionMode === 'upload' && (
          <div className="flex items-center justify-center rounded-md border border-dashed border-border py-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Upload className="h-4 w-4" />
              <span>Upload manual</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
