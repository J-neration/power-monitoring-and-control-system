import { useLayoutEffect, useState } from "react";

export const MOBILE_MEDIA_QUERY = "(max-width: 768px)";

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useLayoutEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);

  return matches;
}
