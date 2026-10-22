import { useState } from 'react';
import { useT } from '../i18n';
import { isIos, isStandalone, useInstall } from '../lib/install';
import { CloseIcon } from './icons';

const DISMISS_KEY = 'travelsteps.phoneBanner.dismissed';

const isPhone = () => isIos() || /android/i.test(navigator.userAgent);

function dismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/** On a phone in the browser: notifications need the app on the home screen. */
export function PhoneBanner() {
  const msg = useT();
  const install = useInstall();
  const [hidden, setHidden] = useState(() => dismissed() || !isPhone() || isStandalone());
  const [showIos, setShowIos] = useState(false);

  if (hidden || install.state === 'installed') return null;

  function close() {
    setHidden(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Ignore: the banner comes back on the next page load.
    }
  }

  function onInstall() {
    if (install.state === 'prompt') void install.install();
    else setShowIos(true);
  }

  return (
    <div className="phone-banner" role="status">
      <div className="phone-banner-row">
        <span>{msg.phoneBanner.text}</span>
        <button type="button" className="btn btn-small btn-primary" onClick={onInstall}>
          {msg.phoneBanner.button}
        </button>
        <button type="button" className="icon-btn" aria-label={msg.phoneBanner.dismiss} onClick={close}>
          <CloseIcon />
        </button>
      </div>
      {showIos && <p className="phone-banner-help">{install.state === 'ios' ? msg.install.ios : msg.install.android}</p>}
    </div>
  );
}
