import { useTheme } from 'next-themes';
import { ThemeSwitcher } from '@/components/ui/theme-switcher';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <ThemeSwitcher
      value={theme as 'light' | 'dark' | 'system' | undefined}
      onChange={setTheme}
    />
  );
}
