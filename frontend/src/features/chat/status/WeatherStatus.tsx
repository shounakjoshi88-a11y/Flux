/**
 * WeatherStatus — the weather card.
 *
 * Extracted from `features/chat/StatusMessage.tsx`, along with the
 * count-up animation for the temperature (which used to live in the parent
 * component even though only this card uses it).
 *
 * Renders one of three things: the fetching row, the finished weather card, or
 * the error row. Returns `null` for any other subtype.
 */
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { StepRow } from "../ThoughtBlock";
import { WeatherIcon } from "../icons";
import {
  conditionLabel,
  weatherEmoji,
  weatherGradient,
  weatherGradientAnimate,
} from "../weatherUtils";
import type { StatusBlockProps } from "./types";


const SUBTYPES = new Set(["weather"]);


/** True when this family renders the given status subtype. */
export function handles(subtype: string): boolean {
  return SUBTYPES.has(subtype);
}

function WeatherStatusComponent({
  status,
  isFirst,
  isLast,
  isActive,
  rightSlot,
}: StatusBlockProps) {
  const targetTemp =
    status.subtype === "weather" && status.data?.status === "completed"
      ? (status.data?.temperature ?? 0)
      : 0;

  // Count the temperature up from zero so the card feels alive.
  const [displayTemp, setDisplayTemp] = useState(0);
  const prevTempKey = useRef(0);
  useEffect(() => {
    const end = Math.round(targetTemp);
    if (prevTempKey.current === end) return;
    prevTempKey.current = end;
    setDisplayTemp(0);
    let start = 0;
    if (start === end) {
      setDisplayTemp(end);
      return;
    }
    const duration = 600;
    const step = Math.max(1, Math.abs(end - start) / (duration / 16));
    const timer = setInterval(() => {
      start += step;
      if ((step > 0 && start >= end) || (step < 0 && start <= end)) {
        start = end;
        clearInterval(timer);
      }
      setDisplayTemp(Math.round(start));
    }, 16);
    return () => clearInterval(timer);
  }, [targetTemp]);

  if (status.subtype !== "weather") return null;

  if (status.data?.status !== "completed" && status.data?.status !== "error") {
    const apiLabel = status.data?.hasKey ? "OpenWeatherMap" : "Open-Meteo";
    return (
      <StepRow
        rightSlot={rightSlot}
        icon={<WeatherIcon state="fetching" cls={isActive ? "text-[var(--accent)]" : "text-[var(--text-secondary)]/40"} />}
        message={`${status.message} (via ${apiLabel})`}
        isFirst={isFirst}
        isLast={isLast}
        pulse={isActive}
      />
    );
  }

  if (status.data?.status === "error") {
    return (
      <StepRow
        rightSlot={rightSlot}
        icon={<WeatherIcon state="error" cls="text-[var(--text-muted)]" />}
        message={status.message}
        isFirst={isFirst}
        isLast={isLast}
        pulse={false}
      />
    );
  }

  const d = status.data;
  const isOWM = d?.source === "OpenWeatherMap";

  const feels = d?.feelsLike ?? 0;
  const hum = d?.humidity ?? 0;
  const wind = d?.windSpeed ?? 0;
  const desc = d?.description ?? "";
  const city = d?.city ?? "";
  const source = d?.source ?? "";

  const containerVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 8, scale: 0.95 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { delay: 0.25 + i * 0.08, duration: 0.35, ease: "easeOut" as const },
    }),
  };

  return (
    <motion.div className="my-2" variants={containerVariants} initial="hidden" animate="visible">
      <div className={`relative overflow-hidden rounded-xl border border-[var(--surface-border)] bg-[var(--surface-bg)] bg-gradient-to-br ${weatherGradient(desc)} ${weatherGradientAnimate(desc)}`}>
        {/* Decorative glow */}
        <motion.div
          className="pointer-events-none absolute -top-6 -right-6 size-24 rounded-full bg-[var(--accent)]/5 blur-2xl"
          animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="relative z-10 p-4">
          {/* City + source */}
          <motion.div
            className="flex items-center justify-between mb-3"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}
          >
            <span className="text-sm font-semibold text-[var(--text-primary)]">{city}</span>
            <span
              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                isOWM
                  ? "border-[var(--accent)]/20 bg-[var(--accent)]/8 text-[var(--accent)]/80"
                  : "border-teal-500/30 bg-teal-500/8 text-teal-400/80"
              }`}
            >
              {source}
            </span>
          </motion.div>

          {/* Temperature + emoji row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-baseline gap-1">
              <motion.span
                className="text-5xl font-light tracking-tight text-[var(--text-primary)]"
                key={displayTemp}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                {displayTemp}
              </motion.span>
              <span className="text-2xl font-light text-[var(--text-muted)]">°C</span>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <motion.span
                className="text-3xl inline-block"
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              >
                {weatherEmoji(desc)}
              </motion.span>
              <motion.span
                className="text-xs font-medium text-[var(--text-secondary)]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15, duration: 0.3 }}
              >
                {conditionLabel(desc)}
              </motion.span>
            </div>
          </div>

          {/* Detail grid */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Feels Like", value: `${Math.round(feels)}°C` },
              { label: "Humidity", value: `${hum}%` },
              { label: "Wind", value: `${wind} km/h` },
            ].map((item, i) => (
              <motion.div
                key={item.label}
                className="rounded-lg border border-[var(--surface-border)] bg-black/10 px-2.5 py-2"
                custom={i}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
              >
                <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)] mb-0.5">{item.label}</div>
                <motion.div
                  className="text-sm font-semibold text-[var(--text-primary)]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.35 + i * 0.08, duration: 0.2 }}
                >
                  {item.value}
                </motion.div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * The family component plus its `handles` predicate, so a caller can ask
 * whether this family owns a subtype before building the element.
 */
export const WeatherStatus = Object.assign(WeatherStatusComponent, { handles });
