/* TRY SPEX's bot check, solved in the visitor's browser (a Web Worker, so the page never stalls): find the number
   below maxnumber whose SHA-256 with the salt is the relay's challenge (ALTCHA's format; relay/demo.py). About a second
   for a person's browser; the point is that it costs every visit real work. */
'use strict';
var K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb,
  0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f,
  0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
var W = new Uint32Array(64), OUT = new Int32Array(8), M = new Uint8Array(128);
var hex = function (w) { return [].map.call(w, function (v) { return ('00000000' + (v >>> 0).toString(16)).slice(-8); }).join(''); };
function sha256words(bytes) {
  var n = bytes.length, total = ((n + 9 + 63) >> 6) << 6, m = total <= 128 ? M : new Uint8Array(total);
  m.fill(0, 0, total); m.set(bytes); m[n] = 0x80;
  var bits = n * 8; m[total - 4] = bits >>> 24; m[total - 3] = bits >>> 16; m[total - 2] = bits >>> 8; m[total - 1] = bits;
  var h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  for (var o = 0; o < total; o += 64) {
    for (var i = 0; i < 16; i++) W[i] = (m[o + 4 * i] << 24) | (m[o + 4 * i + 1] << 16) | (m[o + 4 * i + 2] << 8) | m[o + 4 * i + 3];
    for (i = 16; i < 64; i++) {
      var x = W[i - 15], y = W[i - 2];
      var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    var a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (i = 0; i < 64; i++) {
      var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      var t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      var t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  OUT[0] = h0; OUT[1] = h1; OUT[2] = h2; OUT[3] = h3; OUT[4] = h4; OUT[5] = h5; OUT[6] = h6; OUT[7] = h7;
  return OUT;
}
self.onmessage = function (e) {
  var ch = e.data, salt = new TextEncoder().encode(ch.salt);
  // The salt once, then each number's digits written in place: no allocation per try.
  var buf = new Uint8Array(salt.length + 12); buf.set(salt);
  var want0 = parseInt(ch.challenge.slice(0, 8), 16) | 0;
  for (var n = 0; n <= ch.maxnumber; n++) {
    var digits = String(n), len = salt.length + digits.length;
    for (var i = 0; i < digits.length; i++) buf[salt.length + i] = digits.charCodeAt(i);
    if (sha256words(buf.subarray(0, len))[0] === want0 && hex(OUT) === ch.challenge) {
      self.postMessage({ salt: ch.salt, number: n, challenge: ch.challenge, signature: ch.signature });
      return;
    }
  }
  self.postMessage(null);
};
