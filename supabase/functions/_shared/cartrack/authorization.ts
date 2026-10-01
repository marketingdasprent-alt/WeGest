export interface CartrackVehicleScope {
  registration: string | null;
  viatura_id: string | null;
}

export function normalizeRegistration(value: unknown): string {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function assertCartrackTarget(
  vehicle: CartrackVehicleScope | null,
  registration: string,
  viaturaId?: string | null,
): asserts vehicle is CartrackVehicleScope {
  const registrationMatches =
    vehicle !== null && normalizeRegistration(vehicle.registration) === normalizeRegistration(registration);
  const vehicleMatches = !viaturaId || vehicle?.viatura_id === viaturaId;

  if (!registrationMatches || !vehicleMatches) {
    throw new Error('Viatura Cartrack não pertence à organização');
  }
}
