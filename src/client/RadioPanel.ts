/** The selected panel supplies geometry; the plugin-owned iframe keeps playback across navigation. */
import { useEffect, useRef, type ReactNode } from 'react';
import { h } from './ui';
import type { RadioFrame } from './radio-frame';
export function RadioPanel({ runtime }: { runtime: RadioFrame }): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const anchor = ref.current;
    if (!anchor) return;
    runtime.attach(anchor);
    return () => runtime.detach(anchor);
  }, [runtime]);
  return h('div', { ref, 'data-radio-panel': '1', style: { display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0, height: '100%', width: '100%' } });
}
