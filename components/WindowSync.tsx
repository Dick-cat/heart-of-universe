'use client';

import { useEffect } from 'react';
import { useGraphStore } from '@/hooks/useGraphStore';

export function WindowSync() {
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'ai-knowledge-graph-storage') {
        useGraphStore.persist.rehydrate();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return null;
}
