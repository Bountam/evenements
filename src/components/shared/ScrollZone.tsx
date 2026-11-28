import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

// Plan v1.9, étape 6 : la page ne défile jamais. ScrollZone est la SEULE façon permise de faire défiler
// (garde-fou dans scripts/check-design-tokens.js). Un léger fondu en haut ou en bas signale qu'il reste
// du contenu à voir.
//  - kind="liste" : liste longue (file d'attente, classement, résultats) : elle peut défiler.
//  - kind="page"  : filet de sécurité du contenu d'un écran ; l'écran doit tenir sans qu'elle défile
//                   (tests/zero-defilement.spec.ts le vérifie).
type Fade = 'aucun' | 'haut' | 'bas' | 'deux';

export interface ScrollZoneProps extends React.HTMLAttributes<HTMLElement> {
  kind?: 'liste' | 'page';
  as?: 'div' | 'main' | 'section' | 'ul' | 'ol';
  // Défilement horizontal (rangée de cartes) au lieu de vertical
  horizontal?: boolean;
}

const ScrollZone = forwardRef<HTMLElement, ScrollZoneProps>(function ScrollZone(
  { kind = 'liste', as = 'div', horizontal = false, className = '', children, onScroll, ...rest },
  forwarded
) {
  const ref = useRef<HTMLElement>(null);
  useImperativeHandle(forwarded, () => ref.current as HTMLElement);
  const [fade, setFade] = useState<Fade>('aucun');

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const start = horizontal ? el.scrollLeft : el.scrollTop;
    const size = horizontal ? el.clientWidth : el.clientHeight;
    const total = horizontal ? el.scrollWidth : el.scrollHeight;
    const before = start > 2;
    const after = start + size < total - 2;
    setFade(before && after ? 'deux' : before ? 'haut' : after ? 'bas' : 'aucun');
  }, [horizontal]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const resize = new ResizeObserver(update);
    const observeChildren = () => {
      resize.disconnect();
      resize.observe(el);
      Array.from(el.children).forEach((child) => resize.observe(child));
    };
    observeChildren();
    const mutations = new MutationObserver(() => {
      observeChildren();
      update();
    });
    mutations.observe(el, { childList: true });
    update();
    return () => {
      resize.disconnect();
      mutations.disconnect();
    };
  }, [update]);

  const Tag = as as React.ElementType;
  const axis = horizontal ? 'overflow-x-auto overflow-y-hidden' : 'overflow-y-auto overflow-x-hidden';
  return (
    <Tag
      ref={ref}
      data-scroll-zone={kind}
      data-fade={fade === 'aucun' ? undefined : fade}
      onScroll={(e: React.UIEvent<HTMLElement>) => {
        update();
        onScroll?.(e);
      }}
      className={`scroll-zone min-h-0 min-w-0 overscroll-contain ${axis} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
});

export default ScrollZone;
