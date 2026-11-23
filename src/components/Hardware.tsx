import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

type KnobProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue: number;
  display: string;
  leftLabel: string;
  rightLabel: string;
  disabled?: boolean;
  onChange: (value: number) => void;
};

export function Knob({
  label,
  value,
  min,
  max,
  step = 1,
  defaultValue,
  display,
  leftLabel,
  rightLabel,
  disabled,
  onChange,
}: KnobProps) {
  const drag = useRef<{ x: number; y: number; value: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const percent = (value - min) / (max - min);
  const change = (next: number) =>
    onChange(
      Number(
        Math.max(min, Math.min(max, Math.round(next / step) * step)).toFixed(2),
      ),
    );
  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, value };
    setDragging(true);
  };
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const distance =
      drag.current.y - event.clientY + (event.clientX - drag.current.x) * 0.5;
    change(
      drag.current.value +
        (distance / (event.shiftKey ? 700 : 170)) * (max - min),
    );
  };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const actions: Record<string, number> = {
      ArrowUp: value + step,
      ArrowRight: value + step,
      ArrowDown: value - step,
      ArrowLeft: value - step,
      Home: min,
      End: max,
      PageUp: value + step * 10,
      PageDown: value - step * 10,
    };
    if (event.key in actions) {
      event.preventDefault();
      change(actions[event.key]);
    }
  };

  return (
    <div className={`knob-control ${dragging ? "is-dragging" : ""}`}>
      <span className="control-label">{label}</span>
      <div
        className={`knob ${disabled ? "is-disabled" : ""}`}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={display}
        aria-disabled={disabled}
        title="Drag up or down to adjust. Double-click to reset. Hold Shift for fine control."
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={() => {
          drag.current = null;
          setDragging(false);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
        }}
        onDoubleClick={() => !disabled && onChange(defaultValue)}
        onKeyDown={keyDown}
      >
        <svg className="knob-ticks" viewBox="0 0 112 112" aria-hidden="true">
          {Array.from({ length: 29 }, (_, i) => {
            const angle = ((-140 + i * 10) * Math.PI) / 180;
            return (
              <line
                key={i}
                x1={56 + Math.sin(angle) * 48}
                y1={56 - Math.cos(angle) * 48}
                x2={56 + Math.sin(angle) * (i % 7 === 0 ? 42 : 44.5)}
                y2={56 - Math.cos(angle) * (i % 7 === 0 ? 42 : 44.5)}
                className={i / 28 <= percent ? "tick-on" : "tick-off"}
              />
            );
          })}
        </svg>
        <div className="knob-base">
          <div
            className="knob-face"
            style={{ transform: `rotate(${-140 + percent * 280}deg)` }}
          >
            <span className="knob-indicator" />
          </div>
        </div>
      </div>
      <div className="knob-extents">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
      <span className="knob-value">{display}</span>
    </div>
  );
}

export function AnalogMeter({
  channel,
  level,
}: {
  channel: string;
  level: number;
}) {
  const id = useId().replace(/:/g, "");
  const angle = -52 + Math.max(0, Math.min(1, (level + 30) / 36)) * 104;
  const ticks = [-20, -10, -7, -5, -3, 0, 3];
  return (
    <div className="analog-meter">
      <svg
        viewBox="0 0 228 132"
        role="img"
        aria-label={`${channel} volume meter`}
      >
        <defs>
          <linearGradient id={`meter-${id}`} x1="0" y1="0" x2="0.2" y2="1">
            <stop offset="0" stopColor="#d3c39a" />
            <stop offset="0.55" stopColor="#ebddb5" />
            <stop offset="1" stopColor="#cbbb92" />
          </linearGradient>
          <radialGradient id={`glow-${id}`}>
            <stop offset="0" stopColor="#fff3ce" stopOpacity=".44" />
            <stop offset="1" stopColor="#fff3ce" stopOpacity="0" />
          </radialGradient>
          <filter
            id={`shadow-${id}`}
            filterUnits="userSpaceOnUse"
            x="0"
            y="0"
            width="228"
            height="160"
          >
            <feDropShadow dx="1" dy="2" stdDeviation="1" floodOpacity=".28" />
          </filter>
        </defs>
        <rect
          x="0"
          y="0"
          width="228"
          height="132"
          rx="3"
          fill={`url(#meter-${id})`}
        />
        <ellipse cx="114" cy="74" rx="120" ry="90" fill={`url(#glow-${id})`} />
        <path
          d="M 34 80 A 98 98 0 0 1 194 80"
          fill="none"
          stroke="#625a43"
          strokeWidth="1"
        />
        <path
          d="M 155 50 A 98 98 0 0 1 194 80"
          fill="none"
          stroke="#a44832"
          strokeWidth="3.5"
        />
        {Array.from({ length: 33 }, (_, i) => {
          const theta = ((-145 + i * 3.4375) * Math.PI) / 180;
          const outer = i % 4 === 0 ? 102 : 99;
          return (
            <line
              key={i}
              x1={114 + 91 * Math.cos(theta)}
              y1={137 + 91 * Math.sin(theta)}
              x2={114 + outer * Math.cos(theta)}
              y2={137 + outer * Math.sin(theta)}
              stroke={i > 24 ? "#a44832" : "#554f3e"}
              strokeWidth={i % 4 === 0 ? 1.2 : 0.65}
            />
          );
        })}
        {ticks.map((value, i) => {
          const theta = ((-143 + i * 17.3) * Math.PI) / 180;
          return (
            <text
              key={value}
              x={114 + 115 * Math.cos(theta)}
              y={141 + 115 * Math.sin(theta)}
              textAnchor="middle"
              fontSize="10"
              fontFamily="Arial, sans-serif"
              fill={value >= 0 ? "#9b4733" : "#554f3e"}
            >
              {value > 0 ? `+${value}` : value}
            </text>
          );
        })}
        <text
          x="114"
          y="88"
          textAnchor="middle"
          fontSize="25"
          fontWeight="500"
          fontFamily="Georgia, serif"
          fill="#484533"
        >
          VU
        </text>
        <text
          x="114"
          y="106"
          textAnchor="middle"
          fontSize="7.4"
          letterSpacing="2.6"
          fontFamily="Arial, sans-serif"
          fill="#706750"
        >
          {channel} CHANNEL
        </text>
        <g
          className="meter-needle"
          style={{ transform: `rotate(${angle}deg)` }}
          filter={`url(#shadow-${id})`}
        >
          <line
            x1="114"
            y1="138"
            x2="114"
            y2="37"
            stroke="#71392c"
            strokeWidth="1.7"
          />
        </g>
        <path d="M 87 132 A 29 29 0 0 1 141 132" fill="#36362e" />
        <path
          d="M 0 1 H 228"
          stroke="#453f31"
          strokeOpacity=".35"
          strokeWidth="3"
        />
      </svg>
      <div className="meter-glass" />
    </div>
  );
}

export function Waveform({
  buffer,
  time,
  mastered,
  onSeek,
}: {
  buffer: AudioBuffer;
  time: number;
  mastered: boolean;
  onSeek: (time: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 700, height: 115 });
  const peaks = useMemo(() => {
    const data = buffer.getChannelData(0);
    const count = 1000;
    const values = new Float32Array(count);
    const stride = Math.max(1, Math.floor(data.length / count));
    for (let i = 0; i < count; i++) {
      let peak = 0;
      for (
        let j = i * stride;
        j < Math.min(data.length, (i + 1) * stride);
        j += Math.max(1, Math.floor(stride / 60))
      )
        peak = Math.max(peak, Math.abs(data[j]));
      values[i] = peak;
    }
    return values;
  }, [buffer]);
  useEffect(() => {
    if (!wrapper.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(wrapper.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const context = element.getContext("2d");
    if (!context) return;
    const dpr = window.devicePixelRatio || 1;
    element.width = size.width * dpr;
    element.height = size.height * dpr;
    context.scale(dpr, dpr);
    const middle = size.height / 2;
    context.clearRect(0, 0, size.width, size.height);
    context.strokeStyle = "#2b302c";
    context.lineWidth = 0.5;
    for (let i = 0; i < 5; i++) {
      const x = (size.width * i) / 4;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, size.height);
      context.stroke();
    }
    context.beginPath();
    context.moveTo(0, middle);
    context.lineTo(size.width, middle);
    context.stroke();
    const count = Math.floor(size.width / 3.5);
    const maximum = Math.max(0.1, ...peaks);
    for (let i = 0; i < count; i++) {
      const x = (i * size.width) / count;
      const peak =
        peaks[
          Math.min(peaks.length - 1, Math.floor((i / count) * peaks.length))
        ];
      const height = Math.max(2, (peak / maximum) * size.height * 0.86);
      context.fillStyle =
        x / size.width <= time / buffer.duration
          ? "#ee8a59"
          : mastered
            ? "#ab9b76"
            : "#748277";
      context.fillRect(x, middle - height / 2, 2, height);
    }
    const position = (size.width * time) / buffer.duration;
    context.fillStyle = "#f19a6c";
    context.fillRect(position, 0, 1, size.height);
  }, [peaks, size, time, buffer.duration, mastered]);
  return (
    <div
      className="waveform-canvas"
      ref={wrapper}
      role="slider"
      tabIndex={0}
      aria-label="Playback position"
      aria-valuemin={0}
      aria-valuemax={Math.round(buffer.duration)}
      aria-valuenow={Math.round(time)}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        onSeek(((event.clientX - rect.left) / rect.width) * buffer.duration);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          onSeek(time + (event.key === "ArrowRight" ? 5 : -5));
        }
      }}
    >
      <canvas ref={canvas} />
    </div>
  );
}
