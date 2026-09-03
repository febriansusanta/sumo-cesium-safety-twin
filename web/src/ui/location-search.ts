import type { LocationSearchResult } from "../api";

export const LOCATION_AUTOCOMPLETE_MIN_LENGTH = 2;
export const LOCATION_AUTOCOMPLETE_DEBOUNCE_MS = 450;

const LOCAL_LOCATION_RESULTS: Array<{ aliases: string[]; result: LocationSearchResult }> = [
  {
    aliases: ["ugm", "universitas gadjah mada", "gadjah mada"],
    result: {
      placeId: "local-ugm",
      displayName: "Universitas Gadjah Mada, Sleman, Daerah Istimewa Yogyakarta, Indonesia",
      longitude: 110.377,
      latitude: -7.771,
      bbox: {
        west: 110.373373,
        south: -7.774617,
        east: 110.380627,
        north: -7.767383,
      },
      bboxAdjusted: true,
      bboxAreaKm2: 0.64,
      category: "education",
      type: "university",
      osmType: null,
      osmId: null,
      source: "Local suggestion",
    },
  },
  {
    aliases: ["nanke", "southern taiwan science park", "tainan science park"],
    result: {
      placeId: "local-nanke",
      displayName: "Nanke, Tainan, Taiwan",
      longitude: 120.294735,
      latitude: 23.106144,
      bbox: {
        west: 120.293982,
        south: 23.105595,
        east: 120.295489,
        north: 23.106693,
      },
      bboxAdjusted: false,
      bboxAreaKm2: 0.018,
      category: "industrial",
      type: "study-area",
      osmType: null,
      osmId: null,
      source: "Local suggestion",
    },
  },
  {
    aliases: ["ncku", "national cheng kung university"],
    result: {
      placeId: "local-ncku",
      displayName: "National Cheng Kung University, Tainan, Taiwan",
      longitude: 120.2184,
      latitude: 22.9962,
      bbox: {
        west: 120.2168,
        south: 22.9954,
        east: 120.22,
        north: 22.997,
      },
      bboxAdjusted: false,
      bboxAreaKm2: 0.058,
      category: "education",
      type: "university",
      osmType: null,
      osmId: null,
      source: "Local suggestion",
    },
  },
];

export function shouldSearchAutocomplete(query: string): boolean {
  return query.trim().length >= LOCATION_AUTOCOMPLETE_MIN_LENGTH;
}

export function localLocationSuggestions(query: string): LocationSearchResult[] {
  const normalized = query.trim().toLowerCase();
  if (!shouldSearchAutocomplete(normalized)) return [];
  return LOCAL_LOCATION_RESULTS
    .filter((item) =>
      item.aliases.some((alias) => alias.includes(normalized) || normalized.includes(alias)),
    )
    .map((item) => item.result);
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
