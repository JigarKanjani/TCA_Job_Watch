# Original, procedurally generated music bed for the JobWatch promo (60 s).
# D major, I–V–vi–IV, 104 BPM: pad, bass pulse, plucked arpeggio with echo,
# four-on-the-floor kick, claps, off-beat hats, a riser into the first drop
# and a held final chord under the call to action.
import sys
import numpy as np
import soundfile as sf
from scipy.signal import butter, lfilter

SR = 44100
DUR = 60.0
BPM = 104
BEAT = 60 / BPM
N = int(SR * DUR)
DROP = 4.8      # groove starts with the first feature
OUTRO = 53.6    # call to action: groove stops, chord rings out
rng = np.random.default_rng(7)
out = np.zeros((N, 2))

def midi(m): return 440 * 2 ** ((m - 69) / 12)
def lp(x, f, o=2): b, a = butter(o, f / (SR / 2)); return lfilter(b, a, x)
def hp(x, f, o=2): b, a = butter(o, f / (SR / 2), "high"); return lfilter(b, a, x)
def bp(x, lo, hi, o=2): b, a = butter(o, [lo / (SR / 2), hi / (SR / 2)], "band"); return lfilter(b, a, x)

def add(sig, t0, gain=1.0, pan=0.0):
    i = int(t0 * SR)
    if i >= N: return
    sig = sig[: N - i]
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    out[i : i + len(sig), 0] += sig * gain * l
    out[i : i + len(sig), 1] += sig * gain * r

def tone(f, dur, harm=(1, 0.3, 0.12), detune=0.0):
    t = np.arange(int(dur * SR)) / SR
    s = sum(a * np.sin(2 * np.pi * f * (k + 1) * (1 + detune) * t) for k, a in enumerate(harm))
    return s

def adsr(n, a, d, s, r):
    e = np.ones(n) * s
    A, D, R = int(a * SR), int(d * SR), int(r * SR)
    e[:A] = np.linspace(0, 1, A, endpoint=False) if A else e[:A]
    e[A : A + D] = np.linspace(1, s, max(D, 1))[: len(e[A : A + D])]
    if R: e[-R:] *= np.linspace(1, 0, R)
    return e

# D major: D A Bm G
CHORDS = [(62, 66, 69), (57, 61, 64), (59, 62, 66), (55, 59, 62)]
BASS = [38, 33, 35, 31]
bar = 4 * BEAT
nbars = int(np.ceil(DUR / bar)) + 1

# Pad (whole piece), soft and low-passed
for b in range(nbars):
    t0 = b * bar
    if t0 >= DUR: break
    notes = CHORDS[b % 4]
    n = int((bar + 0.6) * SR)
    seg = np.zeros(n)
    for m in notes + (notes[0] + 12,):
        for dt in (-0.0025, 0.0025):
            seg += tone(midi(m), bar + 0.6, (1, 0.25, 0.08), dt)
    seg = lp(seg, 1800) * adsr(n, 0.35, 0.3, 0.8, 0.6)
    g = 0.022 if t0 < OUTRO else 0.0
    add(seg, t0, g, -0.2)
    add(seg, t0 + 0.012, g, 0.2)

# Final ringing chord for the call to action
fin = np.zeros(int(7 * SR))
for m in (62, 66, 69, 74, 78):
    fin += tone(midi(m), 7, (1, 0.3, 0.1), 0.002) + tone(midi(m), 7, (1, 0.3, 0.1), -0.002)
fin = lp(fin, 2200) * adsr(len(fin), 0.02, 1.5, 0.45, 3.5)
add(fin, OUTRO, 0.03, -0.15); add(fin, OUTRO + 0.01, 0.03, 0.15)

def kick():
    n = int(0.4 * SR); t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)

def clap():
    n = int(0.22 * SR); t = np.arange(n) / SR
    return bp(rng.standard_normal(n), 900, 2600) * np.exp(-t * 22)

def hat():
    n = int(0.06 * SR); t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 7000) * np.exp(-t * 70)

def pluck(f):
    n = int(0.35 * SR); t = np.arange(n) / SR
    return lp(tone(f, 0.35, (1, 0.45, 0.2, 0.1)), 3500) * np.exp(-t * 11)

K, C, H = kick(), clap(), hat()
arp = np.zeros((N, 2))
beats = int(DUR / BEAT) + 1
for i in range(beats):
    t = i * BEAT
    if t < DROP - 1e-6 or t >= OUTRO: continue
    b = int(t // bar)
    add(K, t, 0.42)
    if i % 2 == 1: add(C, t, 0.11, 0.1)
    add(H, t + BEAT / 2, 0.05, 0.3)
    # bass pulse on 8ths
    for h in (0, 0.5):
        n = int(BEAT / 2 * SR)
        tt = np.arange(n) / SR
        bs = lp(tone(midi(BASS[b % 4]), BEAT / 2, (1, 0.5, 0.2)), 600) * np.exp(-tt * 5)
        add(bs, t + h * BEAT, 0.16)
    # arpeggio: 16ths over chord tones, two octaves up
    notes = CHORDS[b % 4]
    pattern = [notes[0], notes[1], notes[2], notes[1] + 12]
    for s in range(4):
        m = pattern[(i * 4 + s) % 4] + 12
        add(pluck(midi(m)), t + s * BEAT / 4, 0.03, 0.35 if s % 2 else -0.35)

# Riser into the drop, then an impact
rn = int((DROP - 0.3) * SR)
noise = rng.standard_normal(rn)
riser = hp(noise, 400) * np.linspace(0, 1, rn) ** 2.5
riser = bp(riser, 800, 9000)
add(riser, 0.3, 0.05)
imp = np.zeros(int(2.5 * SR)); t = np.arange(len(imp)) / SR
imp += hp(rng.standard_normal(len(imp)), 3000) * np.exp(-t * 2.2) * 0.25
imp[: len(K)] += K * 1.1
add(imp, DROP, 0.4)
add(imp, OUTRO, 0.32)

# Echo on the whole groove, gentle glue, fades
d = int(BEAT * 0.75 * SR)
echo = np.zeros_like(out); echo[d:] = out[:-d] * 0.18
out = out + echo[:, ::-1]
out = np.tanh(out * 1.4) / 1.4
fade_in = int(0.4 * SR); fade_out = int(2.5 * SR)
out[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
out[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None]
out /= np.max(np.abs(out)) / 0.89
sf.write(sys.argv[1], out.astype(np.float32), SR)
print("music written", out.shape[0] / SR, "s")
