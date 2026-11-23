import { useCallback, useEffect, useRef, useState } from "react";

export function useAudioPlayer(buffer: AudioBuffer | null, volume = 1) {
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const playRequest = useRef(0);
  const bufferRef = useRef(buffer);
  const offsetRef = useRef(0);
  const startRef = useRef(0);
  const isPlayingRef = useRef(false);
  const volumeRef = useRef(volume);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [levels, setLevels] = useState<[number, number]>([-35, -35]);
  bufferRef.current = buffer;
  volumeRef.current = volume;

  const getContext = useCallback(() => {
    if (!contextRef.current || contextRef.current.state === "closed")
      contextRef.current = new AudioContext({ sampleRate: 48000 });
    return contextRef.current;
  }, []);

  const currentTime = useCallback(() => {
    if (!isPlayingRef.current || !contextRef.current) return offsetRef.current;
    return (
      offsetRef.current + contextRef.current.currentTime - startRef.current
    );
  }, []);

  const stopSource = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.onended = null;
      try {
        sourceRef.current.stop();
      } catch {
        /* An already ended source needs no further work. */
      }
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    gainRef.current?.disconnect();
  }, []);

  const start = useCallback(
    async (at: number) => {
      const audio = bufferRef.current;
      if (!audio) return;
      const request = ++playRequest.current;
      const context = getContext();
      await context.resume();
      if (request !== playRequest.current) return;
      stopSource();
      const source = context.createBufferSource();
      source.buffer = audio;
      const gain = context.createGain();
      gain.gain.value = volumeRef.current;
      source.connect(gain).connect(context.destination);
      const offset = Math.max(0, at >= audio.duration - 0.01 ? 0 : at);
      offsetRef.current = offset;
      startRef.current = context.currentTime;
      sourceRef.current = source;
      gainRef.current = gain;
      isPlayingRef.current = true;
      setPlaying(true);
      source.onended = () => {
        isPlayingRef.current = false;
        offsetRef.current = 0;
        setPlaying(false);
        setTime(0);
        setLevels([-35, -35]);
      };
      source.start(0, offset);
    },
    [getContext, stopSource],
  );

  const pause = useCallback(() => {
    playRequest.current++;
    offsetRef.current = currentTime();
    isPlayingRef.current = false;
    stopSource();
    setPlaying(false);
    setTime(offsetRef.current);
    setLevels([-35, -35]);
  }, [currentTime, stopSource]);

  const toggle = useCallback(() => {
    if (isPlayingRef.current) pause();
    else void start(offsetRef.current);
  }, [pause, start]);

  const seek = useCallback(
    (at: number) => {
      const value = Math.max(0, Math.min(bufferRef.current?.duration || 0, at));
      if (isPlayingRef.current) void start(value);
      else {
        offsetRef.current = value;
        setTime(value);
      }
    },
    [start],
  );

  useEffect(() => {
    if (isPlayingRef.current) void start(currentTime());
  }, [buffer, start, currentTime]);

  useEffect(() => {
    if (gainRef.current && contextRef.current)
      gainRef.current.gain.setTargetAtTime(
        volume,
        contextRef.current.currentTime,
        0.03,
      );
  }, [volume]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let previous = 0;
    const tick = (timestamp: number) => {
      if (timestamp - previous > 45) {
        previous = timestamp;
        const position = currentTime();
        setTime(position);
        const audio = bufferRef.current;
        if (audio) {
          const end = Math.min(
            audio.length,
            Math.floor(position * audio.sampleRate),
          );
          const start = Math.max(0, end - 2048);
          const measured = [0, 1].map((channel) => {
            const samples = audio.getChannelData(
              Math.min(channel, audio.numberOfChannels - 1),
            );
            let energy = 0;
            for (let i = start; i < end; i++) energy += samples[i] * samples[i];
            const rms =
              Math.sqrt(energy / Math.max(1, end - start)) * volumeRef.current;
            return Math.max(-35, 20 * Math.log10(Math.max(1e-8, rms)) + 14);
          });
          setLevels([measured[0], measured[1]]);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, currentTime]);

  useEffect(
    () => () => {
      playRequest.current++;
      stopSource();
      void contextRef.current?.close();
      contextRef.current = null;
    },
    [stopSource],
  );

  return { playing, time, levels, getContext, toggle, pause, seek };
}
