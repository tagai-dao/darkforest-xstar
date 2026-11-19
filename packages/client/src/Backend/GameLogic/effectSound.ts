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
