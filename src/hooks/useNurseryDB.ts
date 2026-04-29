import { useState, useCallback } from 'react';
import type { Nursery, FilterType, SortType } from '../types/nursery';
import { SEED } from '../data/seed';

const DB_KEY = 'kurigram_nursery_db_v2';
const LAST_SYNC_KEY = 'kurigram_nursery_last_sync';

function loadDB(): Nursery[] {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore
  }
  return JSON.parse(JSON.stringify(SEED));
}

function saveDB(data: Nursery[]) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(data));
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
  } catch {
    // ignore
  }
}

export function useNurseryDB() {
  const [db, setDb] = useState<Nursery[]>(loadDB);
  const [lastSync, setLastSync] = useState<string>(() => {
    return localStorage.getItem(LAST_SYNC_KEY) || new Date().toISOString();
  });

  const persist = useCallback((next: Nursery[]) => {
    setDb(next);
    saveDB(next);
    setLastSync(new Date().toISOString());
  }, []);

  const updateNursery = useCallback((id: number, updates: Partial<Nursery>) => {
    setDb(prev => {
      const next = prev.map(n =>
        n.id === id
          ? { ...n, ...updates, updatedAt: new Date().toISOString() }
          : n
      );
      saveDB(next);
      setLastSync(new Date().toISOString());
      return next;
    });
  }, []);

  const addNursery = useCallback((nursery: Omit<Nursery, 'id' | 'sl'>) => {
    setDb(prev => {
      const newId = Math.max(...prev.map(n => n.id), 0) + 1;
      const newNursery: Nursery = {
        ...nursery,
        id: newId,
        sl: newId,
        isNew: true,
        updatedAt: new Date().toISOString(),
      } as Nursery;
      const next = [...prev, newNursery];
      saveDB(next);
      setLastSync(new Date().toISOString());
      return next;
    });
  }, []);

  const resetToSeed = useCallback(() => {
    const fresh = JSON.parse(JSON.stringify(SEED));
    persist(fresh);
  }, [persist]);

  const exportCSV = useCallback(() => {
    const updated = db.filter(n => n.updatedAt);
    if (!updated.length) return null;
    const rows = [
      ['ক্র.', 'উপজেলা', 'নাম', 'ঠিকানা', 'মোবাইল', 'অক্ষাংশ', 'দ্রাঘিমাংশ', 'ফলদ', 'বনজ', 'ঔষধি', 'মোট', 'আপডেট', 'কারী'],
    ];
    updated.forEach(n =>
      rows.push([
        String(n.sl),
        n.upazila,
        n.name,
        n.address || '',
        n.mobile,
        n.lat ? String(n.lat) : '',
        n.lon ? String(n.lon) : '',
        String(n.falod),
        String(n.bonaj),
        String(n.oushodhi),
        String(n.total),
        n.updatedAt || '',
        n.updatedBy || '',
      ])
    );
    return rows;
  }, [db]);

  const exportJSON = useCallback(() => {
    return JSON.stringify(db, null, 2);
  }, [db]);

  const exportOneCSV = useCallback((n: Nursery) => {
    return [
      ['ক্র.', 'উপজেলা', 'নাম', 'মোবাইল', 'অক্ষাংশ', 'দ্রাঘিমাংশ', 'মোট'],
      [String(n.sl), n.upazila, n.name, n.mobile, n.lat ? String(n.lat) : '', n.lon ? String(n.lon) : '', String(n.total)],
    ];
  }, []);

  const getFiltered = useCallback((
    activeUpazila: string,
    searchQ: string,
    activeFilter: FilterType,
    activeSort: SortType
  ): Nursery[] => {
    let list = [...db];
    if (activeUpazila) {
      list = list.filter(n => n.upazila === activeUpazila);
    }
    if (searchQ) {
      const q = searchQ.toLowerCase();
      list = list.filter(
        n =>
          n.name.toLowerCase().includes(q) ||
          n.mobile.includes(q) ||
          n.upazila.toLowerCase().includes(q) ||
          (n.address || '').toLowerCase().includes(q)
      );
    }
    if (activeFilter === 'nomob') list = list.filter(n => !n.mobile);
    if (activeFilter === 'nogps') list = list.filter(n => !n.lat || !n.lon);

    if (activeSort === 'total') {
      list.sort((a, b) => (b.total || 0) - (a.total || 0));
    } else if (activeSort === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name, 'bn'));
    } else if (activeSort === 'miss') {
      list.sort((a, b) => {
        const sa = (!a.mobile ? 2 : 0) + (!a.lat ? 1 : 0);
        const sb = (!b.mobile ? 2 : 0) + (!b.lat ? 1 : 0);
        return sb - sa;
      });
    } else {
      list.sort((a, b) => a.sl - b.sl);
    }
    return list;
  }, [db]);

  const getMissing = useCallback((): Nursery[] => {
    return db.filter(n => !n.mobile);
  }, [db]);

  const getById = useCallback((id: number): Nursery | undefined => {
    return db.find(n => n.id === id);
  }, [db]);

  return {
    db,
    lastSync,
    updateNursery,
    addNursery,
    resetToSeed,
    exportCSV,
    exportJSON,
    exportOneCSV,
    getFiltered,
    getMissing,
    getById,
  };
}
