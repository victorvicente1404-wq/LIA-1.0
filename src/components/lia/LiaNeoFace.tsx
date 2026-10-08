import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimationFrame } from "motion/react";
import { X } from "lucide-react";
import { useLia } from "@/lib/lia/LiaProvider";
import { cn } from "@/lib/utils";
import { getSpeechLevel } from "@/lib/lia/tts";
import { useSyncExternalStore } from "react";
import { useAnimationControls } from "motion/react";
import { getFaceOverride, getLastGesture, subscribeFace, type FaceGesture } from "@/lib/lia/face-engine";

export type NeoEmotion = "neutral" | "happy" | "tired" | "curious" | "sad" | "excited" | "surprised";
type Mode = "idle" | "speaking" | "listening" | "thinking";

const OMEGA = "M48 55 C50 62 57 62 60 55 C63 62 70 62 72 55";
const spring = { type: "spring", stiffness: 170, damping: 22 } as const;

function Face({ mode, emotion, size, burst }: { mode: Mode; emotion: NeoEmotion; size: number; burst: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const mouthRef = useRef<SVGEllipseElement>(null);
  const omegaRef = useRef<SVGPathElement>(null);
  const pupilRefs = useRef<(SVGGElement | null)[]>([]);
  const gaze = useRef({ x: 0, y: 0, tx: 0, ty: 0, moved: 0, sacc: 0 });
  const visorRef = useRef<SVGRectElement>(null);
  const scanRef = useRef<SVGRectElement>(null);
  const open = useRef(0);
  const [blink, setBlink] = useState(false);
  const ov = useSyncExternalStore(subscribeFace, getFaceOverride, () => ({}));
  const gesture = useSyncExternalStore(subscribeFace, getLastGesture, () => null);
  const head = useAnimationControls();
  const ovRef = useRef(ov);
  ovRef.current = ov;

  useEffect(() => {
    if (!gesture) return;
    const g: FaceGesture = gesture.g;
    const t = { duration: 0.9, ease: "easeInOut" } as const;
    if (g === "nod") void head.start({ y: [0, 5, -2, 4, 0], transition: t });
    else if (g === "shake") void head.start({ x: [0, -6, 6, -5, 5, 0], transition: t });
    else if (g === "tilt") void head.start({ rotate: [0, -10, -8, 0], transition: { duration: 1.8 } });
    else if (g === "bounce") void head.start({ y: [0, -8, 0, -5, 0], scale: [1, 1.05, 1, 1.03, 1], transition: t });
    else if (g === "blink") {
      setBlink(true);
      setTimeout(() => setBlink(false), 160);
    }
  }, [gesture?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Piscadas orgânicas a cada 3–6 s.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 140);
        if (Math.random() < 0.25) {
          setTimeout(() => setBlink(true), 260);
          setTimeout(() => setBlink(false), 390);
        }
        loop();
      }, 3000 + Math.random() * 3000);
    };
    loop();
    return () => clearTimeout(t);
  }, []);

  // Olhar segue o cursor/toque em tempo real.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const r = svgRef.current?.getBoundingClientRect();
      if (!r) return;
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const d = Math.max(1, Math.hypot(dx, dy));
      const k = Math.min(1, d / 300);
      gaze.current.tx = (dx / d) * 3.2 * k;
      gaze.current.ty = (dy / d) * 2.4 * k;
      gaze.current.moved = performance.now();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  // Lip-sync pelo volume real da voz + olhar suave (direto no DOM, sem re-render).
  useAnimationFrame((time) => {
    let target = ovRef.current.mouthOpen ?? 0;
    if (mode === "speaking") {
      const lvl = getSpeechLevel();
      if (lvl >= 0) target = Math.max(target, lvl);
      else {
        const s = time / 1000;
        target = Math.max(target, Math.sin(s * 13) * 0.5 + Math.sin(s * 21 + 1) * 0.35 + 0.15);
      }
    }
    // Abre rápido, fecha um pouco mais devagar — como uma boca de verdade.
    open.current += (target - open.current) * (target > open.current ? 0.45 : 0.22);
    const o = open.current;
    const m = mouthRef.current;
    if (m) {
      m.setAttribute("ry", String(0.6 + o * 7));
      m.setAttribute("rx", String(5 + o * 2.2));
      m.setAttribute("cy", String(56 + o * 2));
      m.style.opacity = mode === "speaking" || o > 0.05 ? String(Math.min(1, 0.25 + o * 3)) : "0";
    }
    if (omegaRef.current) omegaRef.current.style.opacity = mode === "speaking" || o > 0.05 ? String(Math.max(0, 1 - o * 4)) : "";
    const g = gaze.current;
    // Microssacadas: sem cursor por perto, o olhar passeia sozinho.
    if (time - g.moved > 2500 && time > g.sacc) {
      g.tx = (Math.random() - 0.5) * 4;
      g.ty = (Math.random() - 0.5) * 2.5;
      g.sacc = time + 900 + Math.random() * 2200;
    }
    // Luz do visor pulsa com a voz; varredura enquanto pensa.
    const v = visorRef.current;
    if (v) {
      const glow = mode === "speaking" ? 0.45 + o * 0.55 : mode === "listening" ? 0.6 + Math.sin(time / 300) * 0.2 : 0.5;
      v.setAttribute("stroke-opacity", glow.toFixed(2));
      v.setAttribute("stroke-width", (1.5 + o * 1.4).toFixed(2));
    }
    const sc = scanRef.current;
    if (sc) {
      sc.style.opacity = mode === "thinking" ? "0.35" : "0";
      sc.setAttribute("y", String(8 + ((time / 18) % 60)));
    }
    if (mode === "thinking") {
      g.tx = Math.sin(time / 700) * 2.5;
      g.ty = -2;
    }
    g.x += (g.tx - g.x) * 0.12;
    g.y += (g.ty - g.y) * 0.12;
    for (const el of pupilRefs.current) el?.setAttribute("transform", `translate(${g.x.toFixed(2)} ${g.y.toFixed(2)})`);
  });

  const happy = ov.eyeSmile !== undefined ? ov.eyeSmile > 0.5 : emotion === "happy" || emotion === "excited";
  const smile = ov.mouthSmile ?? (happy ? 1 : 0);
  const blushLvl = ov.blush ?? (happy ? 1 : 0);
  const browUp = (ov.browRaise ?? 0) * 4;
  const browTilt = (ov.browTilt ?? 0) * 3;
  const tired = emotion === "tired" && mode === "idle";
  const listening = mode === "listening";
  const curious = emotion === "curious";
  const surprised = emotion === "surprised";
  const sad = emotion === "sad";
  const eyeScaleY = blink ? 0.08 : ov.eyeOpen !== undefined ? Math.max(0.08, ov.eyeOpen) : tired ? 0.35 : sad ? 0.7 : surprised ? 1.25 : listening || curious ? 1.12 : 1;
  const showOmega = smile < 0.5 && !tired && !surprised;

  return (
    <motion.div animate={head} style={{ display: "inline-block", willChange: "transform" }}>
    <motion.svg
      ref={svgRef}
      viewBox="0 0 120 80"
      width={size}
      height={(size * 80) / 120}
      animate={{ y: [0, -1.5, 0], rotate: (curious ? -4 : 0) + (ov.headTilt ?? 0) }}
      transition={{ y: { duration: 3.6, repeat: Infinity, ease: "easeInOut" }, rotate: spring }}
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
      <rect ref={visorRef} x="4" y="4" width="112" height="72" rx="30" fill="url(#neo-visor)" stroke="var(--color-primary)" strokeOpacity="0.55" strokeWidth="1.5" filter="url(#neo-glow)" />
      <clipPath id="neo-clip"><rect x="4" y="4" width="112" height="72" rx="30" /></clipPath>
      <rect ref={scanRef} x="4" y="10" width="112" height="3" fill="var(--color-primary)" clipPath="url(#neo-clip)" style={{ opacity: 0, transition: "opacity .3s" }} />
      <rect x="10" y="8" width="100" height="14" rx="7" fill="var(--color-foreground)" opacity="0.04" />

      <g filter="url(#neo-glow)" fill="var(--color-primary)" stroke="var(--color-primary)">
        {/* Sobrancelhas expressivas */}
        {[40, 80].map((cx, i) => {
          const inner = i ? cx - 7 : cx + 7;
          const outer = i ? cx + 7 : cx - 7;
          const yIn = browTilt * (i ? 1 : 1) + -browUp + (sad ? 18 : curious && i ? 15 : surprised ? 14 : happy ? 17 : 19);
          const yOut = -browTilt - browUp + (sad ? 22 : curious && i ? 13 : surprised ? 14 : happy ? 16 : 19);
          const show = sad || curious || surprised || happy || listening || browUp !== 0 || browTilt !== 0;
          return (
            <motion.path key={`b${cx}`} fill="none" strokeWidth={2} strokeLinecap="round"
              initial={false}
              animate={{ d: `M${outer} ${yOut} Q${cx} ${Math.min(yIn, yOut) - 2} ${inner} ${yIn}`, opacity: show ? 0.85 : 0.25 }}
              transition={spring} />
          );
        })}
        {/* Olhos */}
        {[40, 80].map((cx, i) => (
          <g key={cx} ref={(el) => { pupilRefs.current[i] = el; }}>
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
            {/* Brilho do olho */}
            <motion.circle cx={cx + 3} cy={30} r={2} fill="var(--color-foreground)" stroke="none"
              animate={{ opacity: happy || blink ? 0 : curious || surprised ? 1 : 0.6 }} />
            <motion.path
              d={`M${cx - 9} 38 Q${cx} 24 ${cx + 9} 38`} fill="none" strokeWidth={3.2} strokeLinecap="round"
              initial={false}
              animate={{ pathLength: happy ? 1 : 0, opacity: happy ? 1 : 0 }}
              transition={spring}
            />
          </g>
        ))}

        {/* Boca ω em repouso */}
        <motion.path
          ref={omegaRef} d={OMEGA} fill="none" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"
          animate={{ opacity: showOmega ? 1 : 0 }} transition={{ duration: 0.25 }}
        />
        {/* Boca falando: abre de verdade, arredondada, sem deformar */}
        <ellipse ref={mouthRef} cx={60} cy={56} rx={5} ry={0.6} fill="var(--color-background)" strokeWidth={2.2} style={{ opacity: 0 }} />
        {/* Sorriso aberto (feliz) */}
        <motion.path
          d="M47 52 C51 66 69 66 73 52 Z" stroke="none"
          initial={false}
          animate={{ opacity: smile > 0 && mode !== "speaking" ? 0.9 * Math.min(1, smile) : 0, scale: 0.4 + Math.max(0, smile) * 0.6 }}
          transition={spring} style={{ transformOrigin: "60px 56px" }}
        />
        {/* Bocejo / surpresa 'O' */}
        <motion.ellipse
          cx={60} cy={58} rx={5} ry={6} fill="none" strokeWidth={2.4}
          initial={false}
          animate={tired || surprised ? { opacity: 1, scaleY: tired ? [0.6, 1.25, 1] : 0.8, scaleX: tired ? [0.8, 1.1, 1] : 0.8 } : { opacity: 0, scaleY: 0.3, scaleX: 0.5 }}
          transition={{ duration: tired ? 1.2 : 0.25, ease: "easeInOut" }} style={{ transformOrigin: "60px 58px" }}
        />
      </g>

      {/* Blush LED */}
      {[26, 94].map((cx) => (
        <motion.g key={cx} initial={false} animate={{ opacity: blushLvl > 0 ? [0.55 * blushLvl, blushLvl, 0.55 * blushLvl] : 0 }}
          transition={blushLvl > 0 ? { duration: 1.6, repeat: Infinity } : { duration: 0.4 }}
          stroke="var(--color-blush)" strokeWidth={1.6} strokeLinecap="round" filter="url(#neo-glow)"
        >
          <line x1={cx - 5} y1={48} x2={cx - 2} y2={44} />
          <line x1={cx} y1={48} x2={cx + 3} y2={44} />
          <line x1={cx + 5} y1={48} x2={cx + 8} y2={44} />
        </motion.g>
      ))}

      {/* Faíscas ao receber petisco */}
      <AnimatePresence>
        {burst > 0 && (
          <motion.g key={burst} fill="var(--color-blush)" filter="url(#neo-glow)">
            {Array.from({ length: 8 }, (_, i) => {
              const a = (i / 8) * Math.PI * 2;
              return (
                <motion.path key={i} d="M0 -3 L1 -1 L3 0 L1 1 L0 3 L-1 1 L-3 0 L-1 -1 Z"
                  initial={{ x: 60, y: 40, scale: 0, opacity: 1 }}
                  animate={{ x: 60 + Math.cos(a) * 62, y: 40 + Math.sin(a) * 44, scale: [0, 1.4, 0.6], opacity: [1, 1, 0], rotate: 180 }}
                  transition={{ duration: 1.3, ease: "easeOut" }} />
              );
            })}
          </motion.g>
        )}
      </AnimatePresence>
    </motion.svg>
    </motion.div>
  );
}

const ELOGIO = /(linda|fofa|obrigad|amo voc|te amo|incr[ií]vel|perfeita|parab[eé]ns|ador[oa]|maravilhosa|boa garota|gostei|muito bem|show|top|legal|demais)/i;
const RISO = /(k{3,}|haha|hehe|rsrs|😂|🤣|😄|😁|😊|🥰|❤)/i;
const TRISTE = /(triste|chatead|cansad|ruim|p[eé]ssim|mal\b|desculp|chorar|sozinh|😢|😭|😞)/i;
const SURPRESA = /(nossa|uau|caramba|s[eé]rio\?|que\?!|wow|meu deus|😮|😱)/i;

function classify(text: string, role: "user" | "lia"): NeoEmotion | null {
  if (SURPRESA.test(text)) return "surprised";
  if (TRISTE.test(text)) return "sad";
  if (ELOGIO.test(text) || RISO.test(text)) return "happy";
  if (role === "user" && /\?\s*$/.test(text.trim())) return "curious";
  if ((text.match(/!/g)?.length ?? 0) >= 2) return "excited";
  return null;
}

/**
 * Emoção ao vivo: lê cada nova mensagem (sua e dela) no momento em que chega
 * e reage ao conteúdo; a intensidade decai aos poucos, proporcional ao texto.
 */
function useEmotion(): { emotion: NeoEmotion; burst: number } {
  const { bond, messages: history, sending } = useLia();
  const [emotion, setEmotion] = useState<NeoEmotion>("neutral");
  const [burst, setBurst] = useState(0);
  const prevTreats = useRef(bond.petiscos);
  const lastAt = useRef(Date.now());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastMsg = history?.at(-1);

  const react = (e: NeoEmotion, ms: number) => {
    setEmotion(e);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setEmotion("neutral"), ms);
  };

  useEffect(() => {
    if (bond.petiscos > prevTreats.current) {
      setBurst((b) => b + 1);
      react("excited", 6000 + bond.humor * 40);
    }
    prevTreats.current = bond.petiscos;
  }, [bond.petiscos]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!lastMsg || Date.now() - lastMsg.createdAt > 15_000) return;
    lastAt.current = Date.now();
    const e = classify(lastMsg.content, lastMsg.role === "user" ? "user" : "lia");
    if (e) react(e, 2500 + Math.min(6000, lastMsg.content.length * 25));
    else if (emotion === "tired") setEmotion("neutral");
  }, [lastMsg?.id, lastMsg?.content]); // eslint-disable-line react-hooks/exhaustive-deps

  // Enquanto pensa numa resposta, fica curiosa.
  useEffect(() => {
    if (sending) setEmotion((e) => (e === "neutral" || e === "tired" ? "curious" : e));
  }, [sending]);

  useEffect(() => {
    const check = () => {
      const h = new Date().getHours();
      const quiet = Date.now() - lastAt.current > 120_000;
      if (quiet && (h < 6 || Math.random() < 0.15)) setEmotion((e) => (e === "neutral" ? "tired" : e));
    };
    const t = setInterval(check, 20_000);
    return () => {
      clearInterval(t);
      clearTimeout(timer.current);
    };
  }, []);

  return { emotion, burst };
}

/** Avatar "Lia Neo-Face": compacto no cabeçalho; clique abre modo flutuante. */
export function LiaNeoFace({ mode, size = 52 }: { mode: Mode; size?: number }) {
  const { emotion, burst } = useEmotion();
  const [floating, setFloating] = useState(false);
  return (
    <>
      <button
        type="button" onClick={() => setFloating((v) => !v)} aria-label="Expandir rosto da Lia"
        className="shrink-0 rounded-[40%] transition-[filter] hover:drop-shadow-[0_0_10px_var(--color-primary)]"
      >
        <Face mode={mode} emotion={emotion} size={size} burst={burst} />
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
            <Face mode={mode} emotion={emotion} size={220} burst={burst} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
