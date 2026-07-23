import { motion } from 'framer-motion';
import { KanbanBoard } from '@/components/ui/kanban-board';
import { ModuleHeader } from '../ModuleHeader';
import { CRM_COLUNAS } from '../tourData';

export const AnimatedCRM = () => {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <ModuleHeader
        title="CRM"
        subtitle="Pipeline de leads até se tornarem motoristas — dados de demonstração."
      />

      <motion.div
        className="flex-1 px-8 py-6"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
      >
        <KanbanBoard columns={CRM_COLUNAS} />
      </motion.div>
    </div>
  );
};
