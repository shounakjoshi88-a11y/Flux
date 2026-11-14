import { createClient } from "../lib/client";
import { Button } from "../components/ui/button";
import { Loader2, Network, Brain, Layers, BookOpen, Volume2, RefreshCw, ThumbsUp, ThumbsDown } from "lucide-react";
import { IconCheck, IconChevronDown, IconChevronRight, IconCopy, IconExternal, IconGlobe, IconSearch } from "../features/layout/anthropicIcons.tsx";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import { MessageRenderer } from "../features/chat/MessageRenderer";
import { FluxLogo } from "../features/auth/FluxLogo";
import { EASE, EASE_OUT_SOFT } from "../features/auth/motion";
import { GraphBackdrop } from "../features/auth/GraphBackdrop";
import { LiveDemoChat } from "../features/auth/LiveDemoChat";
import { DeepDiveGraphVisual, MemoryManagerMock, FEATURES, USE_CASES } from "../features/auth/AuthShowcase";
import { GoogleIcon, GithubIcon } from "../features/auth/AuthIcons";
import "../../styles/dashboard.css";

export default function Auth() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const reducedMotion = useReducedMotion();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => { document.title = "Sign In"; }, []);

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        navigate("/new");
      } else {
        setChecking(false);
      }
    };
    run();
  }, [navigate]);

  async function login(provider: "github" | "google") {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin + "/new" },
    });
    if (error) {
      alert("Authentication failed. Please try again.");
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.12, delayChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.8, ease: EASE }
    }
  };

  const headlineVariants = {
    hidden: { y: "100%" },
    visible: {
      y: "0%",
      transition: { duration: 1.2, ease: EASE_OUT_SOFT }
    }
  };

  return (
    <div className="relative w-full h-screen bg-background text-foreground overflow-y-auto overflow-x-hidden custom-scrollbar">
      {/* Film Grain Overlay */}
      <div className="pointer-events-none fixed inset-0 z-[100] opacity-[0.03] mix-blend-overlay" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")' }}></div>

      {/* Ambient Background Effects */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[600px] w-[800px] rounded-full bg-primary/5 blur-[120px]"></div>
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-teal-500/5 blur-[100px]"></div>
      </div>
      {/* Subtle Grid Texture */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"></div>

      {/* Minimal top wordmark */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: EASE }}
        className="fixed inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-5 backdrop-blur-md sm:px-10"
      >
        <div className="flex items-center gap-2.5">
          <FluxLogo className="size-6 text-primary" />
          <span className="font-serif text-lg tracking-tight text-foreground">Flux</span>
        </div>
        <div className="hidden md:flex items-center gap-2 font-mono text-[10px] text-muted-foreground tracking-widest border border-border/60 bg-card/40 px-3 py-1.5 rounded-full">
          <span className="flex size-1.5 rounded-full bg-primary animate-pulse"></span>
          LIVE_WEB_v2.4
        </div>
      </motion.header>

      {/* ---------- Hero Section ---------- */}
      <section className="relative z-10 min-h-screen flex items-center px-6 pt-24 pb-16 overflow-hidden">
        <GraphBackdrop reduced={!!reducedMotion} />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,var(--background)_85%)] z-0"></div>

        <div className="relative z-10 mx-auto max-w-7xl w-full grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: Copy & Auth */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={containerVariants}
            className="flex flex-col items-start text-left"
          >
            <motion.div
              variants={itemVariants}
              className="mb-6 flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-md"
            >
              <span className="flex size-2 rounded-full bg-primary shadow-[0_0_10px_#cc785c]" />
              Now mapping the live web in real-time
            </motion.div>

            <h1 className="font-serif text-4xl font-normal leading-[1.1] tracking-tight text-foreground sm:text-5xl md:text-6xl overflow-hidden">
              <motion.span variants={headlineVariants} className="block">
                The AI that shows its
              </motion.span>
              <motion.span variants={headlineVariants} className="block italic text-primary">
                work.
              </motion.span>
            </h1>

            <motion.p
              variants={itemVariants}
              className="mt-6 max-w-lg text-balance text-base text-muted-foreground sm:text-lg"
            >
              Flux searches the live web, cites what it finds, and quietly maps everything you discover along the way — so you're never just trusting a black box.
            </motion.p>

            <motion.div
              variants={itemVariants}
              className="mt-10 flex flex-wrap justify-start gap-3"
            >
              <Button
                disabled={loading}
                onClick={() => login("google")}
                className="group h-12 rounded-xl px-5 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.12)] disabled:opacity-60"
              >
                <GoogleIcon className="mr-2 size-5 transition-transform group-hover:scale-110" />
                Continue with Google
              </Button>
              <Button
                disabled={loading}
                variant="outline"
                onClick={() => login("github")}
                className="group h-12 rounded-xl px-5 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.12)] disabled:opacity-60"
              >
                <GithubIcon className="mr-2 size-5 transition-transform group-hover:scale-110" />
                Continue with GitHub
              </Button>
            </motion.div>

            <motion.p
              variants={itemVariants}
              className="mt-6 text-xs text-muted-foreground/60"
            >
              By continuing, you agree to our <Link to="/terms" className="underline underline-offset-2 decoration-primary/40 hover:decoration-primary transition-colors">Terms of Service</Link> and <Link to="/privacy" className="underline underline-offset-2 decoration-primary/40 hover:decoration-primary transition-colors">Privacy Policy</Link>.
            </motion.p>
          </motion.div>

          {/* Right: Live Demo Chat (Moved here for immediate impact) */}
          <div className="hidden lg:block w-full">
            <LiveDemoChat />
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
        >
          <motion.div
            animate={reducedMotion ? undefined : { y: [0, 6, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          >
            <IconChevronDown className="size-5 text-muted-foreground/50" />
          </motion.div>
        </motion.div>
      </section>

      {/* ---------- Feature Highlights ---------- */}
      <section className="relative z-10 px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: EASE }}
            className="mx-auto mb-16 max-w-2xl text-center"
          >
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="h-px w-12 bg-primary/50"></div>
              <span className="font-mono text-[10px] text-primary tracking-[0.3em]">01 — FEATURES</span>
              <div className="h-px w-12 bg-primary/50"></div>
            </div>
            <h2 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
              Built to think before it answers
            </h2>
            <p className="mt-4 text-base text-muted-foreground">
              Four parts working together, not four separate tools bolted on.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.7, delay: i * 0.1, ease: EASE }}
                className="group relative p-6 rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm transition-all duration-500 hover:-translate-y-1 hover:border-primary/40 hover:bg-card/60 overflow-hidden"
              >
                {/* Corner Notch */}
                <div className="absolute top-0 right-0 h-12 w-12 border-t border-r border-primary/0 group-hover:border-primary/40 transition-all duration-500"></div>
                <div className="absolute bottom-0 left-0 h-12 w-12 border-b border-l border-primary/0 group-hover:border-primary/40 transition-all duration-500"></div>

                <div className="relative">
                  <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-muted text-foreground transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-[0_0_20px_rgba(204,120,92,0.3)]">
                    <feature.icon className="size-5" />
                  </div>
                  <h3 className="mb-2 text-lg font-medium text-foreground">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Deep Dive: Knowledge Graph ---------- */}
      <section className="relative z-10 px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-6xl grid lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: EASE }}
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="h-px w-12 bg-primary/50"></div>
              <span className="font-mono text-[10px] text-primary tracking-[0.3em]">02 — GRAPH</span>
            </div>
            <h2 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
              See the map, <br className="hidden sm:block" />not just the destination.
            </h2>
            <p className="mt-6 text-base leading-relaxed text-muted-foreground">
              Flux tracks topics like <span className="text-foreground">"Misinformation"</span>, <span className="text-foreground">"Elon Musk"</span>, and <span className="text-foreground">"Optimus"</span>.
              By mapping relations like <span className="italic text-primary/90">contradicts</span>, <span className="italic text-primary/90">related_to</span>, and <span className="italic text-primary/90">generates</span>,
              Flux reveals hidden patterns and actively corrects false claims right before your eyes.
            </p>
            <ul className="mt-8 space-y-4">
              <li className="flex items-center gap-3 text-sm text-foreground">
                <span className="size-2.5 rounded-full bg-[#cc785c] shadow-[0_0_8px_#cc785c]" /> Tracks concepts, entities, and topics.
              </li>
              <li className="flex items-center gap-3 text-sm text-foreground">
                <span className="size-2.5 rounded-full bg-teal-400 shadow-[0_0_8px_#2dd4bf]" /> Visualizes dynamic relationships.
              </li>
              <li className="flex items-center gap-3 text-sm text-foreground">
                <span className="size-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_#fbbf24]" /> Actively flags contradictions.
              </li>
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: EASE }}
            className="relative aspect-square w-full rounded-2xl border border-border/60 bg-card/30 backdrop-blur-md overflow-hidden"
          >
            <div className="absolute top-0 left-0 h-12 w-12 border-t border-l border-primary/40"></div>
            <div className="absolute bottom-0 right-0 h-12 w-12 border-b border-r border-primary/40"></div>
            <DeepDiveGraphVisual />
          </motion.div>
        </div>
      </section>

      {/* ---------- Deep Dive: Memory & Reliability ---------- */}
      <section className="relative z-10 px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-6xl grid lg:grid-cols-2 gap-16 items-center">
          <div className="order-2 lg:order-1">
            <MemoryManagerMock />
          </div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: EASE }}
            className="order-1 lg:order-2"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="h-px w-12 bg-primary/50"></div>
              <span className="font-mono text-[10px] text-primary tracking-[0.3em]">03 — MEMORY</span>
            </div>
            <h2 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
              Memory that doesn't forget, <br className="hidden sm:block" />and won't lie to you.
            </h2>
            <p className="mt-6 text-base leading-relaxed text-muted-foreground">
              Flux remembers your preferences, certifications, and ongoing projects across sessions.
              When the web floods with rumors—like <span className="text-foreground">"Perplexity is shutting down"</span>—Flux uses deep search and citations to push back on misinformation, keeping your context grounded in reality.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <span className="px-3 py-1.5 text-xs rounded-full bg-muted/50 border border-border text-foreground">Preferences</span>
              <span className="px-3 py-1.5 text-xs rounded-full bg-muted/50 border border-border text-foreground">Long-term Projects</span>
              <span className="px-3 py-1.5 text-xs rounded-full bg-muted/50 border border-border text-foreground">Fact-Checking</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ---------- Use Cases ---------- */}
      <section className="relative z-10 px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: EASE }}
            className="mx-auto mb-16 max-w-2xl text-center"
          >
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="h-px w-12 bg-primary/50"></div>
              <span className="font-mono text-[10px] text-primary tracking-[0.3em]">04 — USE CASES</span>
              <div className="h-px w-12 bg-primary/50"></div>
            </div>
            <h2 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
              Built for any depth of inquiry
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {USE_CASES.map((use_case, i) => (
              <motion.div
                key={use_case.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.7, delay: i * 0.1, ease: EASE }}
                className="group flex flex-col p-5 rounded-xl border border-border/40 bg-card/20 hover:bg-card/40 transition-all duration-300 hover:border-border"
              >
                <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <use_case.icon className="size-4" />
                </div>
                <h3 className="text-sm font-medium text-foreground">{use_case.title}</h3>
                <p className="text-xs text-muted-foreground mt-1">{use_case.desc}</p>
                <IconChevronRight className="size-4 mt-4 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="relative z-10 border-t border-border/60 px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
          <div className="flex items-center gap-2">
            <FluxLogo className="size-4 text-primary" />
            <span className="text-xs text-muted-foreground">
              Flux — built for people who want to see how AI thinks.
            </span>
          </div>
          <p className="text-xs text-muted-foreground/50">
            © {new Date().getFullYear()} Flux. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
