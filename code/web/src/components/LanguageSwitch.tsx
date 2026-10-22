import { SUPPORTED_LANGUAGES, type Language } from '@travelsteps/shared';
import { useLanguage, useT } from '../i18n';

export function LanguageSwitch({
  onChange,
  disabled = false,
  className = '',
}: {
  onChange: (language: Language) => void;
  disabled?: boolean;
  className?: string;
}) {
  const msg = useT();
  const current = useLanguage();
  return (
    <div className={`segmented ${className}`.trim()} role="group" aria-label={msg.language.choose}>
      {SUPPORTED_LANGUAGES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          className={current === l ? 'active' : ''}
          aria-pressed={current === l}
          disabled={disabled}
          onClick={() => current !== l && onChange(l)}
        >
          {msg.language.names[l]}
        </button>
      ))}
    </div>
  );
}
