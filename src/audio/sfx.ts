// 효과음을 소리 파일 없이 Web Audio로 만든다(인터넷이 막힌 교실에서도 나도록).
import type { SoundKind } from '../model/activity';

export const SOUND_NAMES: Record<SoundKind, string> = {
  whistle: '호루라기',
  bell: '종',
  beep: '삐 소리',
  clap: '박수',
};

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null; // 소리를 못 내는 환경
  }
}

/** 버튼을 누를 때 한 번 불러 두면 이후 재생에서 소리가 막히지 않는다(브라우저 자동재생 규칙) */
export function unlockAudio() {
  audio();
}

export function playSound(kind: SoundKind, volume = 0.6) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.01;
  const out = ac.createGain();
  out.gain.value = volume;
  out.connect(ac.destination);

  if (kind === 'whistle') {
    // 체육 호루라기: 높은 소리에 빠른 떨림(콩알이 굴러가는 소리)
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 2900;
    const lfo = ac.createOscillator();
    lfo.frequency.value = 38;
    const depth = ac.createGain();
    depth.gain.value = 140;
    lfo.connect(depth).connect(osc.frequency);
    const env = ac.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.5, t + 0.03);
    env.gain.setValueAtTime(0.5, t + 0.55);
    env.gain.linearRampToValueAtTime(0, t + 0.7);
    osc.connect(env).connect(out);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + 0.72);
    lfo.stop(t + 0.72);
    return;
  }
  if (kind === 'bell') {
    // 종: 여러 배음이 천천히 사라진다
    for (const [f, g] of [
      [880, 0.5],
      [1760, 0.25],
      [2640, 0.12],
      [1320, 0.18],
    ] as const) {
      const osc = ac.createOscillator();
      osc.frequency.value = f;
      const env = ac.createGain();
      env.gain.setValueAtTime(g, t);
      env.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
      osc.connect(env).connect(out);
      osc.start(t);
      osc.stop(t + 1.25);
    }
    return;
  }
  if (kind === 'beep') {
    const osc = ac.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 1000;
    const env = ac.createGain();
    env.gain.setValueAtTime(0.25, t);
    env.gain.setValueAtTime(0, t + 0.28);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + 0.3);
    return;
  }
  // 박수: 짧은 잡음 세 번
  const len = Math.floor(ac.sampleRate * 0.25);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-((i % (len / 3)) / (ac.sampleRate * 0.02)));
  const src = ac.createBufferSource();
  src.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1500;
  src.connect(bp).connect(out);
  src.start(t);
}
