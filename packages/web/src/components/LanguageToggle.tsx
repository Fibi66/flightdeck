import { useTranslation } from 'react-i18next';
import { setLanguage, getLanguage } from '../i18n';

/**
 * Compact language toggle button for the sidebar.
 * Switches between English and Chinese.
 */
export function LanguageToggle() {
  const { t } = useTranslation();
  const lang = getLanguage();

  const handleToggle = () => {
    setLanguage(lang === 'zh' ? 'en' : 'zh');
  };

  return (
    <button
      onClick={handleToggle}
      className="flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded-lg w-[58px] transition-colors text-th-text-muted hover:text-accent hover:bg-accent/10"
      title={t('settings.language')}
      data-testid="language-toggle"
    >
      <span className="text-sm font-medium leading-none">🌐</span>
      <span className="text-[11px] leading-tight font-medium truncate w-full text-center">
        {t('language.toggle')}
      </span>
    </button>
  );
}
