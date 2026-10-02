import { useLayoutEffect } from 'react';
import { AppContext } from '@/app';
import { DESKTOP_MEDIA_QUERY } from '@/app/constants';

export function useWorkspaceLayout() {
  const { send } = AppContext.useActorRef();

  useLayoutEffect(() => {
    const viewport = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const updateLayout = () => send({ type: 'layout.update', isDesktop: viewport.matches });
    updateLayout();
    viewport.addEventListener('change', updateLayout);
    return () => viewport.removeEventListener('change', updateLayout);
  }, [send]);
}
