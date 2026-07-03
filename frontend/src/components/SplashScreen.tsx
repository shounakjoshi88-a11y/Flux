import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* ─── Premium easing — gentle float ─── */
const EASE_PREMIUM = [0.4, 0, 0.2, 1] as const;
const EASE_EMPHASIZED = [0.05, 0.7, 0.1, 1] as const;

/* ─── Floating particle for ambient depth ─── */
function Particle({
  x,
  y,
  size,
  color,
  dur,
  delay,
}: {
  x: number; y: number; size: number; color: string; dur: number; delay: number;
}) {
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{ width: size, height: size, background: color, left: `${x}%`, top: `${y}%` }}
      animate={{
        y: [0, -18, 0, 14, 0],
        x: [0, 8, -4, -8, 0],
        opacity: [0, 0.5, 0.2, 0.4, 0],
      }}
      transition={{
        duration: dur,
        repeat: Infinity,
        ease: "easeInOut",
        delay,
      }}
    />
  );
}

export function SplashScreen({ onFinish }: { onFinish: () => void }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const main = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onFinish(), 700);
    }, 2400);
    return () => clearTimeout(main);
  }, [onFinish]);

  return (
    <AnimatePresence>
      {!exiting && (
        <motion.div
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden"
          style={{ background: "#181715" }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: EASE_PREMIUM }}
        >
          {/* ─── AMBIENT LAYER ─── */}

          {/* Main coral glow — pulses slowly */}
          <motion.div
            className="absolute pointer-events-none"
            style={{
              width: 520,
              height: 520,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(204,120,92,0.10) 0%, transparent 65%)",
              willChange: "transform",
            }}
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* Secondary teal glow — offset for depth */}
          <motion.div
            className="absolute pointer-events-none"
            style={{
              width: 380,
              height: 380,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(93,184,166,0.05) 0%, transparent 60%)",
              transform: "translate(25%, -20%)",
              willChange: "transform",
            }}
            animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
          />

          {/* Floating ambient particles — layered drifting */}
          <Particle x={42} y={38} size={3} color="rgba(204,120,92,0.3)" dur={6} delay={0} />
          <Particle x={58} y={42} size={2} color="rgba(93,184,166,0.25)" dur={7} delay={1.2} />
          <Particle x={50} y={35} size={2.5} color="rgba(204,120,92,0.2)" dur={5.5} delay={2.5} />
          <Particle x={46} y={55} size={1.5} color="rgba(250,249,245,0.15)" dur={8} delay={0.7} />
          <Particle x={55} y={52} size={2} color="rgba(204,120,92,0.15)" dur={6.5} delay={1.8} />

          {/* ─── PRIMARY LAYER: Logo ─── */}
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.9, ease: EASE_PREMIUM }}
          >
            <svg
              width={76}
              height={76}
              viewBox="0 0 24 24"
              fill="none"
              stroke="#cc785c"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <motion.path
                d="M2 16C5 6 8 18 11 10S17 6 22 12"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.6, ease: EASE_EMPHASIZED, delay: 0.15 }}
              />
            </svg>
          </motion.div>

          {/* ─── SECONDARY LAYER: Wordmark ─── */}
          <motion.h1
            className="mt-6 text-[28px] font-serif tracking-tight"
            style={{ color: "#faf9f5", fontFamily: "'Cormorant Garamond', serif", letterSpacing: "-0.5px" }}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE_PREMIUM, delay: 0.8 }}
          >
            Flux
          </motion.h1>

          {/* Tagline */}
          <motion.p
            className="mt-2.5 text-sm font-sans"
            style={{ color: "#6c6a64", letterSpacing: "0.4px", fontWeight: 400 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, ease: EASE_PREMIUM, delay: 1.2 }}
          >
            Thinking partner
          </motion.p>

          {/* Ambient dots — subtle breathing */}
          <motion.div
            className="flex items-center gap-2.5 mt-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, ease: EASE_PREMIUM, delay: 1.5 }}
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="rounded-full"
                style={{ width: 3, height: 3, background: "#cc785c" }}
                animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1, 0.8] }}
                transition={{
                  duration: 1.4,
                  repeat: Infinity,
                  delay: i * 0.25,
                  ease: "easeInOut",
                }}
              />
            ))}
          </motion.div>

          {/* Subtle bottom gradient fade */}
          <div
            className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
            style={{
              background: "linear-gradient(to top, rgba(204,120,92,0.04) 0%, transparent 100%)",
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
