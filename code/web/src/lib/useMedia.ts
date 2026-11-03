import { useEffect, useState } from 'react';

/** Desktop layout (sidebar, feed + map); same em breakpoint as styles.css. */
export const DESKTOP_QUERY = '(min-width: 68.75em)';

/** Whether a media query matches, updated when it changes (rotation, text size, window size). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return matches;
}
