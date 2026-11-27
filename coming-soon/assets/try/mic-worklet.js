/* TRY SPEX's microphone: the browser's audio, down to 16 kHz 16-bit mono (what Spex hears in the app), posted in
   chunks of about 40 ms. */
class MicChunks extends AudioWorkletProcessor {
  constructor() { super(); this.ratio = sampleRate / 16000; this.pos = 0; this.out = new Int16Array(640); this.n = 0; }
  process(inputs) {
    var ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (; this.pos < ch.length; this.pos += this.ratio) {
      var s = Math.max(-1, Math.min(1, ch[Math.floor(this.pos)]));
      this.out[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.n === this.out.length) { this.port.postMessage(this.out.slice(0).buffer, []); this.n = 0; }
    }
    this.pos -= ch.length;
    return true;
  }
}
registerProcessor('mic-chunks', MicChunks);
