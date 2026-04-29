export interface Species {
  n: string;
  q: number;
}

export interface Nursery {
  id: number;
  sl: number;
  upazila: string;
  name: string;
  address: string;
  mobile: string;
  lat: number | null;
  lon: number | null;
  falod: number;
  bonaj: number;
  oushodhi: number;
  total: number;
  fs: Species[];
  bs: Species[];
  os: Species[];
  updatedAt?: string;
  updatedBy?: string;
  isNew?: boolean;
}

export type TabType = 'map' | 'list' | 'missing' | 'upazila';
export type FilterType = 'all' | 'nomob' | 'nogps';
export type MapFilterType = 'all' | 'ok' | 'nomob' | 'nogps';
export type SortType = 'sl' | 'total' | 'name' | 'miss';
