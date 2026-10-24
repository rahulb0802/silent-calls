/** Decode a reviewed recording in memory and make the 16 kHz mono WAV used by voice cloning. */
export async function voiceSampleWav(blob: Blob): Promise<Uint8Array> {
  if (!blob.size || blob.size > 10 * 1024 * 1024) {
    throw new Error('Choose an audio recording smaller than 10 MB.');
  }
  const context = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(await blob.arrayBuffer());
  } catch {
    throw new Error('This audio file could not be read. Try a WAV, MP3, M4A or WebM recording.');
  } finally {
    await context.close();
  }
  if (decoded.duration < 3 || decoded.duration > 20) {
    throw new Error('Use a voice recording between 3 and 20 seconds.');
  }
  const sampleRate = 16000;
  const length = Math.ceil(decoded.duration * sampleRate);
  const offline = new OfflineAudioContext(1, length, sampleRate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  const samples = rendered.getChannelData(0);
  let energy = 0;
  for (const value of samples) energy += value * value;
  if (Math.sqrt(energy / samples.length) < 0.001) {
    throw new Error('This recording is silent or too quiet. Use a built-in/USB microphone, speak closer, and record again.');
  }
  const wav = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(wav.buffer);
  const ascii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index++) view.setUint8(offset + index, text.charCodeAt(index));
  };
  ascii(0, 'RIFF'); view.setUint32(4, wav.length - 8, true);
  ascii(8, 'WAVE'); ascii(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); ascii(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index++) {
    const value = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, value < 0 ? value * 32768 : value * 32767, true);
  }
  return wav;
}
