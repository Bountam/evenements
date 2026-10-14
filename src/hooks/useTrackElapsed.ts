import { useEffect, useState } from 'react';
import { TrackState } from '../types';
import { networkManager } from '../network';

// Temps écoulé d'une piste, rafraîchi à la cadence d'affichage (requestAnimationFrame) pendant la course
export function useTrackElapsed(track: Pick<TrackState, 'isRunning' | 'startTime' | 'elapsedBeforeStart'>): number {
  const [time, setTime] = useState(track.elapsedBeforeStart);

  useEffect(() => {
    if (!track.isRunning || track.startTime === null) {
      setTime(track.elapsedBeforeStart);
      return;
    }
    let frame = 0;
    const tick = () => {
      setTime(networkManager.now() - track.startTime! + track.elapsedBeforeStart);
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [track.isRunning, track.startTime, track.elapsedBeforeStart]);

  return time;
}
