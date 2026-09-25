import { useEffect, useRef } from 'react';
import { createCabinGame, type CabinHandle, type CabinSync } from './CabinGame';

export function CabinView({
  cabin,
  onCarChange,
  onArrive,
}: {
  cabin: CabinSync;
  onCarChange: (car: number, enterFrom: 'left' | 'right') => void;
  onArrive: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<CabinHandle | null>(null);
  const cabinRef = useRef(cabin);
  const handlersRef = useRef({ onCarChange, onArrive });

  useEffect(() => {
    cabinRef.current = cabin;
  }, [cabin]);

  useEffect(() => {
    handlersRef.current = { onCarChange, onArrive };
  }, [onCarChange, onArrive]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const handle = createCabinGame(host, cabinRef.current, {
      onCarChange: (car, enterFrom) => handlersRef.current.onCarChange(car, enterFrom),
      onArrive: () => handlersRef.current.onArrive(),
    });
    gameRef.current = handle;
    return () => {
      handle.destroy();
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    gameRef.current?.sync(cabin);
  }, [cabin]);

  return <div ref={hostRef} className="cabin-host" />;
}
