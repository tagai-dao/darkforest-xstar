// 短音效用 Web Audio 播放。HTML 音频读这些 ogg 时一直拿不到时长，Howler 就不会出声。

let context: AudioContext | undefined;
const buffers = new Map<string, Promise<AudioBuffer | undefined>>();

function audioContext(): AudioContext {
  if (!context) {
    context = new AudioContext();
  }
  return context;
}

function loadBuffer(src: string): Promise<AudioBuffer | undefined> {
  const cached = buffers.get(src);
  if (cached) return cached;

  const pending = fetch(src)
    .then((response) => {
      if (!response.ok) throw new Error(response.statusText);
      return response.arrayBuffer();
    })
    .then((bytes) => audioContext().decodeAudioData(bytes.slice(0)))
    .catch(() => {
      // 失败不缓存，下一次点击可以再拉一次。
      buffers.delete(src);
      return undefined;
    });
  buffers.set(src, pending);
  return pending;
}

export function preloadEffect(src: string): void {
  void loadBuffer(src);
}

// 爆炸音的噪声素材：只生成一次，之后每次复用
let noiseBuffer: AudioBuffer | undefined;

function explosionNoise(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const seconds = 1.2;
  const buffer = ctx.createBuffer(
    1,
    Math.ceil(ctx.sampleRate * seconds),
    ctx.sampleRate,
  );
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  noiseBuffer = buffer;
  return buffer;
}

/**
 * 星球被炸毁时的爆炸声。没有音频文件，直接用白噪声加一个快速降低的低通滤波合成：
 * 开头亮、一闪而过，然后音调和音量一起往下掉，听起来像闷响。
 */
export function playExplosion(volume: number): void {
  if (volume <= 0) return;
  const ctx = audioContext();
  void ctx.resume().then(() => {
    if (ctx.state !== "running") return;
    const now = ctx.currentTime;
    const duration = 1.2;

    const source = ctx.createBufferSource();
    source.buffer = explosionNoise(ctx);

    // 低通滤波的截止频率从 1500Hz 掉到 90Hz，声音越来越闷
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1500, now);
    filter.frequency.exponentialRampToValueAtTime(90, now + duration * 0.9);

    // 音量迅速到顶，然后指数衰减到几乎听不见
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.min(1, volume), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(now);
    source.stop(now + duration);
  });
}

export function playEffect(src: string, volume: number): void {
  if (volume <= 0) return;
  const ctx = audioContext();
  // 第一次要在用户点击里 resume，之后定时器里的到达音才能放。
  void Promise.all([ctx.resume(), loadBuffer(src)]).then(([_, buffer]) => {
    if (!buffer || ctx.state !== "running") return;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    gain.gain.value = Math.min(1, volume);
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  });
}
