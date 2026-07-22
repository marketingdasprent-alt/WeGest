import { motion } from 'framer-motion';
import {
  Megaphone,
  Mail,
  Users,
  Bell,
  BarChart3,
  Upload,
  Plus,
  History,
  Eye,
  Pencil,
  Send,
  Trash2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '../StatusBadge';
import { MARKETING_TABS, MARKETING_CAMPANHAS } from '../tourData';
import { staggerContainer, staggerItem } from '../motionVariants';
import { cn } from '@/lib/utils';

const TAB_ICONS = [Mail, Users, Bell, BarChart3, Upload];

const ACTION_BUTTON = 'flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';

export const AnimatedMarketing = () => {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-8 py-5">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">Marketing</h2>
            <p className="text-sm text-muted-foreground">
              Gerir campanhas de email, listas de transmissão e importações.
            </p>
          </div>
        </div>

        <div className="flex gap-1">
          {MARKETING_TABS.map((tab, index) => {
            const Icon = TAB_ICONS[index];
            const isActive = index === 0;
            return (
              <div
                key={tab}
                className={cn(
                  'flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-sm font-medium',
                  isActive ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 space-y-4 px-8 py-6">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-semibold text-foreground">Campanhas de Email</h3>
          <button className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
            <Plus className="h-4 w-4" />
            Nova Campanha
          </button>
        </div>

        <motion.div className="space-y-3" initial="hidden" animate="visible" variants={staggerContainer}>
          {MARKETING_CAMPANHAS.map((campanha) => (
            <motion.div key={campanha.assunto} variants={staggerItem}>
              <Card>
                <CardContent className="flex flex-wrap items-start justify-between gap-4 pt-5 pb-4">
                  <div className="min-w-[220px] space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{campanha.titulo}</span>
                      <StatusBadge status={campanha.estado} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Assunto: <span className="text-foreground">{campanha.assunto}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Lista: <span className="italic">{campanha.lista}</span>
                    </p>
                    {campanha.enviadoData !== '—' && (
                      <p className="text-sm text-muted-foreground">
                        Enviado: {campanha.enviadoData} às {campanha.enviadoHora}
                      </p>
                    )}
                    {campanha.enviados > 0 && (
                      <p className="flex items-center gap-3 text-sm">
                        <span className="flex items-center gap-1 text-green-500">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {campanha.enviados} enviados
                        </span>
                        <span className="flex items-center gap-1 text-red-500">
                          <XCircle className="h-3.5 w-3.5" />
                          {campanha.erros} erros
                        </span>
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button className={ACTION_BUTTON}>
                      <History className="h-4 w-4" />
                    </button>
                    <button className={ACTION_BUTTON}>
                      <Eye className="h-4 w-4" />
                    </button>
                    <button className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground">
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </button>
                    <button className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
                      <Send className="h-3.5 w-3.5" />
                      Enviar
                    </button>
                    <button className="flex h-8 w-8 items-center justify-center rounded-md bg-red-500/15 text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
};
