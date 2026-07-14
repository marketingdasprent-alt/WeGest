import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Settings } from 'lucide-react';
import { useState } from 'react';

interface PrintSettings {
  mostrarMatricula: boolean;
  mostrarGestor: boolean;
  mostrarCartaoFrota: boolean;
  mostrarIBAN: boolean;
  mostrarReciboVerde: boolean;
  orientacao: 'portrait' | 'landscape';
}

interface PrintSettingsPanelProps {
  settings: PrintSettings;
  updateSetting: <K extends keyof PrintSettings>(key: K, value: PrintSettings[K]) => void;
}

export function PrintSettingsPanel({ settings, updateSetting }: PrintSettingsPanelProps) {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="print:hidden">
      <Button
        variant="ghost"
        size="sm"
        className="gap-2 text-muted-foreground"
        onClick={() => setShowSettings((v) => !v)}
      >
        <Settings className="h-4 w-4" />
        Configurar folha de impressão
      </Button>

      {showSettings && (
        <div className="mt-3 p-4 border rounded-lg bg-muted/30 space-y-4">
          <p className="text-sm font-medium text-muted-foreground mb-2">
            Campos a mostrar na impressão
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { key: 'mostrarMatricula' as const, label: 'Matrícula' },
              { key: 'mostrarGestor' as const, label: 'Gestor Responsável' },
              { key: 'mostrarCartaoFrota' as const, label: 'Cartão Frota' },
              { key: 'mostrarIBAN' as const, label: 'IBAN' },
              { key: 'mostrarReciboVerde' as const, label: 'Recibo Verde' },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <Switch
                  id={key}
                  checked={settings[key] as boolean}
                  onCheckedChange={(checked) => updateSetting(key, checked as any)}
                />
                <Label htmlFor={key} className="text-sm cursor-pointer">
                  {label}
                </Label>
              </div>
            ))}
          </div>
          <Separator />
          <div className="flex items-center gap-4">
            <p className="text-sm font-medium text-muted-foreground">Orientação</p>
            <div className="flex gap-2">
              {(['portrait', 'landscape'] as const).map((o) => (
                <Button
                  key={o}
                  size="sm"
                  variant={settings.orientacao === o ? 'default' : 'outline'}
                  onClick={() => updateSetting('orientacao', o)}
                >
                  {o === 'portrait' ? 'Vertical' : 'Horizontal'}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
