export const TIPOS_CONFIG = [
  {
    value: 'entrega',
    label: 'Entrega',
    color: 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-400',
    colorActive: 'border-green-500 bg-green-500 text-white',
  },
  {
    value: 'recolha',
    label: 'Recolha',
    color: 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-400',
    colorActive: 'border-blue-500 bg-blue-500 text-white',
  },
  {
    value: 'devolucao',
    label: 'Devolução',
    color: 'border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-400',
    colorActive: 'border-orange-500 bg-orange-500 text-white',
  },
  {
    value: 'troca',
    label: 'Troca',
    color: 'border-purple-500 bg-purple-500/10 text-purple-700 dark:text-purple-400',
    colorActive: 'border-purple-500 bg-purple-500 text-white',
  },
  {
    value: 'upgrade',
    label: 'Upgrade',
    color: 'border-yellow-500 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
    colorActive: 'border-yellow-500 bg-yellow-500 text-white',
  },
  {
    value: 'lista_espera',
    label: 'Lista de Espera',
    color: 'border-pink-500 bg-pink-500/10 text-pink-700 dark:text-pink-400',
    colorActive: 'border-pink-500 bg-pink-500 text-white',
  },
  {
    value: 'slot',
    label: 'Slot',
    color: 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    colorActive: 'border-amber-500 bg-amber-500 text-white',
  },
];

export const TIPO_LABELS: Record<string, string> = Object.fromEntries(
  TIPOS_CONFIG.map((t) => [t.value, t.label])
);

export const TIPO_COLORS_PDF: Record<string, [number, number, number]> = {
  entrega: [34, 197, 94],
  recolha: [59, 130, 246],
  devolucao: [249, 115, 22],
  troca: [168, 85, 247],
  upgrade: [234, 179, 8],
  lista_espera: [236, 72, 153],
  slot: [245, 158, 11],
};

export async function loadImageWithDimensions(
  src: string
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const resp = await fetch(src);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = reject;
      img.src = dataUrl;
    });
    return { dataUrl, ...dims };
  } catch {
    return null;
  }
}
