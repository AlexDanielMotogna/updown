import { useQuery } from '@tanstack/react-query';

const API = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002')
  : '';

export interface CategoryConfig {
  code: string;
  type: string;
  enabled: boolean;
  comingSoon: boolean;
  label: string;
  shortLabel: string | null;
  color: string | null;
  badgeUrl: string | null;
  iconKey: string | null;
  numSides: number;
  sideLabels: string[];
  sortOrder: number;
}

/**
 * Fetch visible categories (enabled + comingSoon) from API.
 * Uses placeholderData so UI renders instantly even if API is slow.
 */
export function useCategories() {
  return useQuery({
    queryKey: ['pool-categories'],
    queryFn: async (): Promise<CategoryConfig[]> => {
      const res = await fetch(`${API}/api/config/categories`);
      const json = await res.json();
      if (!json.success) throw new Error('Failed to fetch categories');
      return json.data;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
  });
}

/** Get display info for a specific category code. */
export function useCategoryMap() {
  const { data } = useCategories();
  const map = new Map<string, CategoryConfig>();
  if (data) {
    for (const cat of data) {
      map.set(cat.code, cat);
    }
  }
  return map;
}

/** Get badge URL for a league code from categories API. */
export function useBadgeUrl(code: string | null | undefined): string | null {
  const map = useCategoryMap();
  if (!code) return null;
  return map.get(code)?.badgeUrl ?? null;
}

/** Hook that returns a lookup function: code → badgeUrl. */
export function useBadgeLookup() {
  const map = useCategoryMap();
  return (code: string) => map.get(code)?.badgeUrl ?? null;
}
