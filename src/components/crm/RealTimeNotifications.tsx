import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bell, CheckCircle, UserPlus, Edit3, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface RealtimeNotification {
  id: string;
  type: 'insert' | 'update' | 'delete';
  message: string;
  timestamp: Date;
  leadName?: string;
  icon: React.ReactNode;
}

interface RealTimeNotificationsProps {
  onNewActivity?: () => void;
  onRealtimeEvent?: (payload: any) => void;
}

export const RealTimeNotifications: React.FC<RealTimeNotificationsProps> = ({
  onNewActivity,
  onRealtimeEvent,
}) => {
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([]);

  const handleRealtimeEvent = (payload: any) => {
    const leadData = payload.new || payload.old;
    const leadName = (leadData as any)?.nome || 'Lead sem nome';

    const notification: RealtimeNotification = {
      id: `${payload.eventType}-${Date.now()}`,
      type: payload.eventType as 'insert' | 'update' | 'delete',
      timestamp: new Date(),
      leadName,
      message: getNotificationMessage(payload.eventType, leadName),
      icon: getNotificationIcon(payload.eventType),
    };

    setNotifications((prev) => [notification, ...prev].slice(0, 5));

    // Auto-hide after 5 seconds
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
    }, 5000);

    onNewActivity?.();
  };

  useEffect(() => {}, [onRealtimeEvent]);

  const getNotificationMessage = (eventType: string, leadName?: string) => {
    switch (eventType) {
      case 'INSERT':
        return `✨ Novo lead: ${leadName}`;
      case 'UPDATE':
        return `📝 Lead atualizado: ${leadName}`;
      case 'DELETE':
        return `🗑️ Lead removido: ${leadName}`;
      default:
        return 'Alteração detectada';
    }
  };

  const getNotificationIcon = (eventType: string) => {
    switch (eventType) {
      case 'INSERT':
        return <UserPlus className="h-4 w-4 text-green-500" />;
      case 'UPDATE':
        return <Edit3 className="h-4 w-4 text-blue-500" />;
      case 'DELETE':
        return <Trash2 className="h-4 w-4 text-red-500" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm">
      <AnimatePresence>
        {notifications.map((notification) => (
          <motion.div
            key={notification.id}
            initial={{ opacity: 0, x: 100, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.9 }}
            className="mb-2 p-3 bg-background/95 border border-border rounded-lg shadow-lg backdrop-blur-sm"
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">{notification.icon}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{notification.message}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {notification.timestamp.toLocaleTimeString()}
                </p>
              </div>
              <Badge variant="secondary" className="text-xs capitalize">
                {notification.type === 'insert'
                  ? 'Novo'
                  : notification.type === 'update'
                    ? 'Editado'
                    : 'Removido'}
              </Badge>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {notifications.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-center">
          <Button variant="ghost" size="sm" onClick={clearNotifications} className="text-xs h-6">
            <CheckCircle className="h-3 w-3 mr-1" />
            Limpar
          </Button>
        </motion.div>
      )}
    </div>
  );
};
