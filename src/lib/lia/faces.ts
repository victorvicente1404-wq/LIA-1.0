/**
 * Detecção e reconhecimento facial 100% no navegador.
 * Só vetores numéricos (128 números) são guardados — nunca fotos.
 */
export interface KnownFace {
  nome: string;
  descriptor: number[];
}

export interface FaceHit {
  box: { x: number; y: number; width: number; height: number };
  score: number;
  nome: string | null;
  distance: number | null;
  descriptor: Float32Array;
}

const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model";
const MATCH_THRESHOLD = 0.5;

type FaceApi = typeof import("@vladmandic/face-api");
let apiPromise: Promise<FaceApi> | null = null;

export function loadFaceApi(): Promise<FaceApi> {
  apiPromise ??= (async () => {
    const faceapi = await import("@vladmandic/face-api");
    try {
      await faceapi.tf.setBackend("webgl");
    } catch {
      await faceapi.tf.setBackend("cpu");
    }
    await faceapi.tf.ready();
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    return faceapi;
  })().catch((e) => {
    apiPromise = null;
    throw e;
  });
  return apiPromise;
}

function distance(a: Float32Array | number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < b.length; i++) s += ((a[i] ?? 0) - (b[i] ?? 0)) ** 2;
  return Math.sqrt(s);
}

export function matchFace(desc: Float32Array, known: KnownFace[]) {
  let best: { nome: string; d: number } | null = null;
  for (const k of known) {
    const d = distance(desc, k.descriptor);
    if (!best || d < best.d) best = { nome: k.nome, d };
  }
  return best && best.d < MATCH_THRESHOLD ? best : best ? { nome: null, d: best.d } : null;
}

export async function detectFaces(input: HTMLVideoElement, known: KnownFace[]): Promise<FaceHit[]> {
  const faceapi = await loadFaceApi();
  const res = await faceapi
    .detectAllFaces(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptors();
  return res.map((r) => {
    const m = matchFace(r.descriptor, known);
    const b = r.detection.box;
    return {
      box: { x: b.x, y: b.y, width: b.width, height: b.height },
      score: r.detection.score,
      nome: m?.nome ?? null,
      distance: m?.d ?? null,
      descriptor: r.descriptor,
    };
  });
}

/** Média de várias amostras para um cadastro mais estável. */
export function averageDescriptor(samples: Float32Array[]): number[] {
  const out = new Array<number>(128).fill(0);
  for (const s of samples) for (let i = 0; i < 128; i++) out[i]! += (s[i] ?? 0) / samples.length;
  return out;
}
