'use client';

import { useEffect } from 'react';
import '@/lib/i18n';

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // i18n is initialized in lib/i18n.ts; this component ensures the import runs
  // on the client before any component calls useTranslation.
  useEffect(() => {
    // Language detection has already run during import.
  }, []);

  return <>{children}</>;
}
