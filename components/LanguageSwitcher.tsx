'use client';

import { useTranslation } from 'react-i18next';
import { LANGUAGES, type LanguageCode } from '@/lib/i18n';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = i18n.language as LanguageCode;

  return (
    <div className="flex items-center gap-1 rounded-sm border border-cosmic-700 bg-cosmic-900/80 px-1.5 py-1 backdrop-blur-md">
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          onClick={() => i18n.changeLanguage(lang.code)}
          className={`rounded-sm px-2 py-0.5 text-[10px] font-medium transition-colors ${
            current === lang.code
              ? 'bg-crimson-700 text-white'
              : 'text-cosmic-400 hover:bg-cosmic-800 hover:text-cosmic-200'
          }`}
          title={lang.label}
        >
          {lang.code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
