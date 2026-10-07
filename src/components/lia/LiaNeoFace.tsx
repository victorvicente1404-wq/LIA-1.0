import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimationFrame } from "motion/react";
import { X } from "lucide-react";
import { useLia } from "@/lib/lia/LiaProvider";
import { cn } from "@/lib/utils";

export type NeoEmotion = "neutral" | "happy" | "tired";
type Mode = "idle" | "speaking" | "listening" | "thinking";

const OMEGA = "M48 55 C50 62 57 62 60 55 C63 62 70 62 72 55";
const spring = { type: "spring", stiffness: 260, damping: 18 } as const;

function Face({ mode, emotion, size }: { mode: Mode; emotion: NeoEmotion; size: number }) {
  const mouthRef = useRef<SVGPathElement>(null);
  const [blink, setBlink] = useState(false);

  // Piscadas orgânicas a cada 3–6 s.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 140);
        loop();
      }, 3000 + Math.random() * 3000);
    };
    loop();
    return () => clearTimeout(t);
  }, []);

  // Lip-sync procedural direto no DOM (sem re-render do React).
  useAnimationFrame((time) => {
    const el = mouthRef.current;
    if (!el) return;
    if (mode !== "speaking") {
      el.setAttribute("d", OMEGA);
      return;
    }
    const s = time / 1000;
    const a = Math.max(0, Math.sin(s * 14) * 0.6 + Math.sin(s * 23 + 1) * 0.4) * 7;
    const w = Math.sin(s * 9) * 1.5;
    el.setAttribute(
      "d",
      `M${48 - w} 55 C${50 - w} ${62 + a} 57 ${62 + a} 60 ${55 + a * 0.45} C63 ${62 + a} ${70 + w} ${62 + a} ${72 + w} 55`,
    );
  });

  const happy = emotion === "happy";
  const tired = emotion === "tired" && mode === "idle";
  const listening = mode === "listening";
  const eyeScaleY = blink ? 0.08 : tired ? 0.35 : listening ? 1.12 : 1;

  return (
    <motion.svg
      viewBox="0 0 120 80"
      width={size}
      height={(size * 80) / 120}
      animate={{ y: [0, -1.5, 0] }}
      transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
      style={{ willChange: "transform" }}
      className="overflow-visible"
    >
      <defs>
        <filter id="neo-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <linearGradient id="neo-visor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-surface-2, var(--color-card))" stopOpacity="0.95" />
          <stop offset="1" stopColor="var(--color-background)" stopOpacity="0.98" />
        </linearGradient>
      </defs>

      {/* Visor fumê */}
      <rect x="4" y="4" width="112" height="72" rx="30" fill="url(#neo-visor)" stroke="var(--color-primary)" strokeOpacity="0.55" strokeWidth="1.5" />
      <rect x="10" y="8" width="100" height="14" rx="7" fill="var(--color-foreground)" opacity="0.04" />

      <g filter="url(#neo-glow)" fill="var(--color-primary)" stroke="var(--color-primary)">
        {/* Olhos */}
        {[40, 80].map((cx) => (
          <g key={cx}>
            {listening && (
              <motion.circle
                cx={cx} cy={34} r={14} fill="none" strokeWidth={1}
                animate={{ opacity: [0.7, 0.1, 0.7], scale: [0.9, 1.15, 0.9] }}
                transition={{ duration: 1.4, repeat: Infinity }}
                style={{ transformOrigin: `${cx}px 34px` }}
              />
            )}
            <motion.ellipse
              cx={cx} cy={34} rx={8} ry={10} stroke="none"
              animate={{ scaleY: happy ? 0 : eyeScaleY, opacity: happy ? 0 : 1 }}
              transition={blink ? { duration: 0.07 } : spring}
              style={{ transformOrigin: `${cx}px 34px` }}
            />
            <motion.path
              d={`M${cx - 9} 38 Q${cx} 24 ${cx + 9} 38`} fill="none" strokeWidth={3.2} strokeLinecap="round"
              initial={false}
              animate={{ pathLength: happy ? 1 : 0, opacity: happy ? 1 : 0 }}
              transition={spring}
            />
          </g>
        ))}

        {/* Boca ω (lip-sync) */}
        <motion.path
          ref={mouthRef} d={OMEGA} fill="none" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"
          animate={{ opacity: happy || tired ? 0 : 1 }} transition={{ duration: 0.25 }}
        />
        {/* Sorriso aberto (feliz) */}
        <motion.path
          d="M47 52 C51 66 69 66 73 52 Z" stroke="none"
          initial={false}
          animate={{ opacity: happy ? 0.9 : 0, scale: happy ? 1 : 0.4 }}
          transition={spring} style={{ transformOrigin: "60px 56px" }}
        />
        {/* Bocejo 'O' */}
        <motion.ellipse
          cx={60} cy={58} rx={5} ry={6} fill="none" strokeWidth={2.4}
          initial={false}
          animate={tired ? { opacity: 1, scaleY: [0.6, 1.25, 1], scaleX: [0.8, 1.1, 1] } : { opacity: 0, scaleY: 0.3, scaleX: 0.5 }}
          transition={{ duration: 1.2, ease: "easeInOut" }} style={{ transformOrigin: "60px 58px" }}
        />
      </g>

      {/* Blush LED */}
      {[26, 94].map((cx) => (
        <motion.g key={cx} initial={false} animate={{ opacity: happy ? [0.55, 1, 0.55] : 0 }}
          transition={happy ? { duration: 1.6, repeat: Infinity } : { duration: 0.4 }}
          stroke="var(--color-blush)" strokeWidth={1.6} strokeLinecap="round" filter="url(#neo-glow)"
        >
          <line x1={cx - 5} y1={48} x2={cx - 2} y2={44} />
          <line x1={cx} y1={48} x2={cx + 3} y2={44} />
          <line x1={cx + 5} y1={48} x2={cx + 8} y2={44} />
        </motion.g>
      ))}
    </motion.svg>
  );
}

const ELOGIO = /\b(linda|fofa|obrigad|amo voc|te amo|incr[ií]vel|perfeita|parab[eé]ns|ador[oa]|maravilhosa|boa garota)/i;

/** Emoção derivada: feliz após petisco/elogio; cansada após muito tempo parada ou de madrugada. */
function useEmotion(): NeoEmotion {
  const { bond, messages: history } = useLia();
  const [emotion, setEmotion] = useState<NeoEmotion>("neutral");
  const prevTreats = useRef(bond.petiscos);
  const last = history?.filter((m) => m.role === "user").at(-1);

  useEffect(() => {
    if (bond.petiscos > prevTreats.current) {
      setEmotion("happy");
      const t = setTimeout(() => setEmotion("neutral"), 7000);
      prevTreats.current = bond.petiscos;
      return () => clearTimeout(t);
    }
  }, [bond.petiscos]);

  useEffect(() => {
    if (last && Date.now() - last.createdAt < 10_000 && ELOGIO.test(last.content)) {
      setEmotion("happy");
      const t = setTimeout(() => setEmotion("neutral"), 7000);
      return () => clearTimeout(t);
    }
  }, [last?.createdAt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const check = () => {
      const h = new Date().getHours();
      const quiet = !last || Date.now() - last.createdAt > 120_000;
      setEmotion((e) => (e === "happy" ? e : quiet && (h < 6 || Math.random() < 0.15) ? "tired" : "neutral"));
    };
    const t = setInterval(check, 20_000);
    return () => clearInterval(t);
  }, [last?.createdAt]); // eslint-disable-line react-hooks/exhaustive-deps

  return emotion;
}

/** Avatar "Lia Neo-Face": compacto no cabeçalho; clique abre modo flutuante. */
export function LiaNeoFace({ mode, size = 52 }: { mode: Mode; size?: number }) {
  const emotion = useEmotion();
  const [floating, setFloating] = useState(false);
  return (
    <>
      <button
        type="button" onClick={() => setFloating((v) => !v)} aria-label="Expandir rosto da Lia"
        className="shrink-0 rounded-[40%] transition-[filter] hover:drop-shadow-[0_0_10px_var(--color-primary)]"
      >
        <Face mode={mode} emotion={emotion} size={size} />
      </button>
      <AnimatePresence>
        {floating && (
          <motion.div
            drag dragMomentum={false}
            initial={{ opacity: 0, scale: 0.6, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.6 }}
            transition={spring}
            className={cn("fixed bottom-24 right-4 z-50 cursor-grab rounded-[2.5rem] border border-primary/40 bg-background/70 p-4 backdrop-blur-xl active:cursor-grabbing", "shadow-[0_0_40px_-8px_var(--color-primary)]")}
          >
            <button type="button" onClick={() => setFloating(false)} aria-label="Fechar" className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
            <Face mode={mode} emotion={emotion} size={220} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
