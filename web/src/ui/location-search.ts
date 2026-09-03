import type { LocationSearchResult } from "../api";

export const LOCATION_AUTOCOMPLETE_MIN_LENGTH = 2;
export const LOCATION_AUTOCOMPLETE_DEBOUNCE_MS = 450;

export function shouldSearchAutocomplete(query: string): boolean {
  return query.trim().length >= LOCATION_AUTOCOMPLETE_MIN_LENGTH;
}

export function locationPrimaryLabel(result: LocationSearchResult): string {
  return result.displayName.split(",")[0]?.trim() || result.displayName;
}

export function locationSecondaryLabel(result: LocationSearchResult): string {
  const locationParts = result.displayName
    .split(",")
    .slice(1)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3);
  const aoiNote = result.bboxAdjusted
    ? `safe AOI · ${result.bboxAreaKm2.toFixed(3)} km2`
    : `${result.bboxAreaKm2.toFixed(3)} km2`;

  return locationParts.length > 0
    ? `${locationParts.join(", ")} · ${aoiNote}`
    : aoiNote;
}
