import type { MeasurementUnit } from "./model";

const PIXELS_PER_UNIT: Record<MeasurementUnit, number> = {
  px: 1,
  mm: 96 / 25.4,
  cm: 96 / 2.54,
  in: 96,
};

export function toPixels(value: number, unit: MeasurementUnit): number {
  return value * PIXELS_PER_UNIT[unit];
}

export function fromPixels(value: number, unit: MeasurementUnit): number {
  return value / PIXELS_PER_UNIT[unit];
}

export function formatMeasurement(valueInPixels: number, unit: MeasurementUnit): string {
  const value = fromPixels(valueInPixels, unit);
  const maximumFractionDigits = unit === "px" ? 0 : 2;
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits }).format(value);
}
