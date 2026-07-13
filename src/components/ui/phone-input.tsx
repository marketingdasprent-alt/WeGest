import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

// Lista de países (lusófonos + Europa + principais destinos de emigração)
const COUNTRIES = [
  // Portugal e PALOP
  { code: 'PT', name: 'Portugal', dial: '+351', flag: '🇵🇹' },
  { code: 'BR', name: 'Brasil', dial: '+55', flag: '🇧🇷' },
  { code: 'AO', name: 'Angola', dial: '+244', flag: '🇦🇴' },
  { code: 'MZ', name: 'Moçambique', dial: '+258', flag: '🇲🇿' },
  { code: 'CV', name: 'Cabo Verde', dial: '+238', flag: '🇨🇻' },
  { code: 'GW', name: 'Guiné-Bissau', dial: '+245', flag: '🇬🇼' },
  { code: 'ST', name: 'São Tomé e Príncipe', dial: '+239', flag: '🇸🇹' },
  { code: 'TL', name: 'Timor-Leste', dial: '+670', flag: '🇹🇱' },
  // Europa
  { code: 'ES', name: 'Espanha', dial: '+34', flag: '🇪🇸' },
  { code: 'FR', name: 'França', dial: '+33', flag: '🇫🇷' },
  { code: 'GB', name: 'Reino Unido', dial: '+44', flag: '🇬🇧' },
  { code: 'DE', name: 'Alemanha', dial: '+49', flag: '🇩🇪' },
  { code: 'IT', name: 'Itália', dial: '+39', flag: '🇮🇹' },
  { code: 'NL', name: 'Países Baixos', dial: '+31', flag: '🇳🇱' },
  { code: 'BE', name: 'Bélgica', dial: '+32', flag: '🇧🇪' },
  { code: 'CH', name: 'Suíça', dial: '+41', flag: '🇨🇭' },
  { code: 'IE', name: 'Irlanda', dial: '+353', flag: '🇮🇪' },
  { code: 'LU', name: 'Luxemburgo', dial: '+352', flag: '🇱🇺' },
  { code: 'AT', name: 'Áustria', dial: '+43', flag: '🇦🇹' },
  { code: 'SE', name: 'Suécia', dial: '+46', flag: '🇸🇪' },
  { code: 'NO', name: 'Noruega', dial: '+47', flag: '🇳🇴' },
  { code: 'DK', name: 'Dinamarca', dial: '+45', flag: '🇩🇰' },
  { code: 'FI', name: 'Finlândia', dial: '+358', flag: '🇫🇮' },
  { code: 'PL', name: 'Polónia', dial: '+48', flag: '🇵🇱' },
  { code: 'RO', name: 'Roménia', dial: '+40', flag: '🇷🇴' },
  { code: 'UA', name: 'Ucrânia', dial: '+380', flag: '🇺🇦' },
  // Américas
  { code: 'US', name: 'Estados Unidos', dial: '+1', flag: '🇺🇸' },
  { code: 'CA', name: 'Canadá', dial: '+1', flag: '🇨🇦' },
  // África e Médio Oriente
  { code: 'MA', name: 'Marrocos', dial: '+212', flag: '🇲🇦' },
  { code: 'ZA', name: 'África do Sul', dial: '+27', flag: '🇿🇦' },
  { code: 'AE', name: 'Emirados Árabes Unidos', dial: '+971', flag: '🇦🇪' },
  // Ásia
  { code: 'IN', name: 'Índia', dial: '+91', flag: '🇮🇳' },
  { code: 'CN', name: 'China', dial: '+86', flag: '🇨🇳' },
] as const;

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  defaultCountry?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  className?: string;
  id?: string;
}

// Parse phone number string to extract country code and number
export function parsePhoneNumber(fullNumber: string): { countryCode: string; number: string } {
  if (!fullNumber) return { countryCode: 'PT', number: '' };

  const trimmed = fullNumber.trim();

  // Find matching country by dial code
  for (const country of COUNTRIES) {
    if (trimmed.startsWith(country.dial)) {
      const number = trimmed.slice(country.dial.length).trim();
      return { countryCode: country.code, number };
    }
  }

  // If no country code found, assume it's just a number (default to PT)
  const digitsOnly = trimmed.replace(/\D/g, '');
  return { countryCode: 'PT', number: digitsOnly };
}

// Format phone number for storage
export function formatPhoneNumber(countryCode: string, number: string): string {
  const country = COUNTRIES.find((c) => c.code === countryCode);
  const dial = country?.dial || '+351';
  const cleanNumber = number.replace(/\D/g, '');

  if (!cleanNumber) return '';
  return `${dial} ${cleanNumber}`;
}

// Format number for display (with spaces)
function formatDisplayNumber(number: string, countryCode: string): string {
  const digits = number.replace(/\D/g, '');

  // Portugal format: XXX XXX XXX
  if (countryCode === 'PT') {
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
  }

  // Brazil format: XX XXXXX XXXX
  if (countryCode === 'BR') {
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 2)} ${digits.slice(2)}`;
    return `${digits.slice(0, 2)} ${digits.slice(2, 7)} ${digits.slice(7, 11)}`;
  }

  // Generic format: groups of 3
  const groups = [];
  for (let i = 0; i < digits.length; i += 3) {
    groups.push(digits.slice(i, i + 3));
  }
  return groups.join(' ');
}

// Validate phone number
export function validatePhoneNumber(fullNumber: string): boolean {
  const { countryCode, number } = parsePhoneNumber(fullNumber);
  const digits = number.replace(/\D/g, '');

  if (!digits) return false;

  // Portugal: 9 digits, starting with 9 (mobile) or 2 (fixed)
  if (countryCode === 'PT') {
    return /^[92]\d{8}$/.test(digits);
  }

  // Brazil: 10-11 digits
  if (countryCode === 'BR') {
    return /^\d{10,11}$/.test(digits);
  }

  // Generic: at least 7 digits
  return digits.length >= 7;
}

const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  (
    { value, onChange, defaultCountry = 'PT', placeholder, disabled, error, className, id },
    ref
  ) => {
    const [open, setOpen] = React.useState(false);

    // Parse the value to get country and number
    const { countryCode, number } = React.useMemo(() => {
      if (value) {
        return parsePhoneNumber(value);
      }
      return { countryCode: defaultCountry, number: '' };
    }, [value, defaultCountry]);

    const selectedCountry = React.useMemo(() => {
      return COUNTRIES.find((c) => c.code === countryCode) || COUNTRIES[0];
    }, [countryCode]);

    const displayNumber = React.useMemo(() => {
      return formatDisplayNumber(number, countryCode);
    }, [number, countryCode]);

    const handleCountryChange = (newCountryCode: string) => {
      const newCountry = COUNTRIES.find((c) => c.code === newCountryCode);
      if (newCountry) {
        const cleanNumber = number.replace(/\D/g, '');
        const newValue = cleanNumber ? `${newCountry.dial} ${cleanNumber}` : '';
        onChange(newValue);
      }
      setOpen(false);
    };

    const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value;
      const digits = inputValue.replace(/\D/g, '');

      // Limit based on country
      let maxDigits = 15; // Default max
      if (countryCode === 'PT') maxDigits = 9;
      if (countryCode === 'BR') maxDigits = 11;

      const limitedDigits = digits.slice(0, maxDigits);
      const newValue = limitedDigits ? `${selectedCountry.dial} ${limitedDigits}` : '';
      onChange(newValue);
    };

    return (
      <div className={cn('flex', className)}>
        <Popover open={open} onOpenChange={setOpen} modal>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              disabled={disabled}
              className={cn(
                'w-[110px] justify-between rounded-r-none border-r-0 px-2 font-normal',
                error && 'border-destructive',
                disabled && 'cursor-not-allowed opacity-50'
              )}
            >
              <span className="flex items-center gap-1 truncate">
                <span className="text-base">{selectedCountry.flag}</span>
                <span className="text-sm">{selectedCountry.dial}</span>
              </span>
              <ChevronDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0 z-[100]" align="start" sideOffset={4}>
            <Command>
              <CommandInput placeholder="Procurar país..." className="h-9" />
              <CommandList className="max-h-[300px]">
                <CommandEmpty>País não encontrado.</CommandEmpty>
                <CommandGroup>
                  {COUNTRIES.map((country) => (
                    <CommandItem
                      key={country.code}
                      value={`${country.name} ${country.dial}`}
                      onSelect={() => handleCountryChange(country.code)}
                      className="cursor-pointer"
                    >
                      <span className="mr-2 text-base">{country.flag}</span>
                      <span className="flex-1">{country.name}</span>
                      <span className="text-muted-foreground">{country.dial}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Input
          ref={ref}
          id={id}
          type="tel"
          value={displayNumber}
          onChange={handleNumberChange}
          placeholder={placeholder || (countryCode === 'PT' ? '912 345 678' : 'Número de telefone')}
          disabled={disabled}
          className={cn('rounded-l-none flex-1', error && 'border-destructive')}
        />
      </div>
    );
  }
);

PhoneInput.displayName = 'PhoneInput';

export { PhoneInput, COUNTRIES };
