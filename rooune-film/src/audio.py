"""Sound design for the ROOUNE film, synthesised from scratch and locked to the
film's own cue sheet (footfalls, cuts, beats).

  python3 src/audio.py out/cues.json out/score.wav

Arc: city at dawn + one runner's footsteps -> three separate cadences ->
a restrained pulse as routes converge -> the music breathes when they run
together -> two-note sonic logo (the two O's) and a long, clean tail.
"""
import json, sys
import numpy as np
from scipy import signal

SR = 48000
cues = json.load(open(sys.argv[1]))
T, BEAT = cues['T'], cues['BEAT']
DUR = T['DUR']
N = int(DUR * SR)
rng = np.random.default_rng(7)
L = np.zeros(N); R = np.zeros(N)          # dry bus
RL = np.zeros(N); RR = np.zeros(N)        # reverb send


def db(x): return 10 ** (x / 20)
def ts(t): return int(round(t * SR))
def env_ar(n, a, r):
    e = np.ones(n)
    na, nr = int(a * SR), int(r * SR)
    if na: e[:na] = np.linspace(0, 1, na) ** 2
    if nr: e[-nr:] *= np.linspace(1, 0, nr) ** 2
    return e
def curve(points, n=N):
    """piecewise-linear automation from (time, value) pairs"""
    tt = np.arange(n) / SR
    xs, ys = zip(*points)
    return np.interp(tt, xs, ys)
def place(buf_l, buf_r, x, t, gain=1.0, pan=0.0):
    i = ts(t)
    if i >= N: return
    x = x[: N - i]
    gl, gr = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf_l[i:i + len(x)] += x * gain * gl * 1.414
    buf_r[i:i + len(x)] += x * gain * gr * 1.414
def add(x, t, gain=1.0, pan=0.0, send=0.0):
    place(L, R, x, t, gain, pan)
    if send: place(RL, RR, x, t, gain * send, pan)
def bp(x, lo, hi, order=2): return signal.sosfilt(signal.butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)
def lp(x, f, order=2): return signal.sosfilt(signal.butter(order, f, 'low', fs=SR, output='sos'), x)
def hp(x, f, order=2): return signal.sosfilt(signal.butter(order, f, 'high', fs=SR, output='sos'), x)
def noise(n): return rng.standard_normal(n)
def pink(n):
    w = np.fft.rfft(noise(n)); f = np.arange(len(w)); f[0] = 1
    return np.fft.irfft(w / np.sqrt(f), n) * 30


# ------------------------------------------------------------------ city ambience
amb_n = N
air = hp(pink(amb_n), 300) * 0.06
rumble = lp(np.cumsum(noise(amb_n)) * 0.002, 140, 4)
rumble -= lp(rumble, 20)
traffic = lp(pink(amb_n), 900) * (0.5 + 0.5 * np.sin(np.arange(amb_n) / SR * 0.35 * 2 * np.pi + 1)) * 0.05
city = air + rumble * 0.8 + traffic
# city in the street shots; thins to "air" over the map; returns warmer for the group run
city_gain = curve([(0, 0), (0.6, 0.9), (6.4, 0.9), (7.2, 0.25), (11.6, 0.2), (12.4, 0.0), (12.667, 0.55), (15.8, 0.5), (16.4, 0.0), (DUR, 0)])
stereo_decor = np.roll(city, 1200)
L += city * city_gain * 0.7; R += stereo_decor * city_gain * 0.7

# lake water (runner 03)
water = bp(pink(N), 200, 1400) * (0.5 + 0.5 * np.abs(np.sin(np.arange(N) / SR * 2.1 * np.pi))) * 0.05
wg = curve([(0, 0), (4.0, 0), (4.2, 1), (5.1, 1), (6.6, 0.4), (7.2, 0), (DUR, 0)])
L += water * wg; R += np.roll(water, 900) * wg


def koel(t, gain, pan):
    """Asian koel: the rising two-note 'ku-oo' of a Bengaluru morning"""
    for k, f0 in enumerate([620, 700, 790]):
        for j, (a, b, d) in enumerate([(0.55, 1.0, 0.16), (1.0, 1.22, 0.3)]):
            n = int(d * SR); tt = np.arange(n) / SR
            f = f0 * np.linspace(a, b, n)
            x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * tt / d) ** 1.5
            add(x, t + k * 0.62 + j * 0.2, gain * (0.7 + 0.15 * k), pan, send=1.2)
def chirp(t, gain, pan):
    for k in range(rng.integers(2, 5)):
        n = int(0.05 * SR); tt = np.arange(n) / SR
        f = rng.uniform(2800, 4200) * (1 + 0.4 * np.sin(tt * 90))
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.hanning(n)
        add(x, t + k * rng.uniform(0.07, 0.12), gain, pan, send=0.8)

koel(0.9, 0.035, -0.6)
chirp(3.2, 0.018, 0.5); chirp(3.7, 0.014, -0.3)
chirp(13.4, 0.016, 0.6); chirp(14.8, 0.013, -0.5)
koel(13.9, 0.022, 0.55)


# ------------------------------------------------------------------ footsteps
def footstep(kind):
    n = int(0.16 * SR); tt = np.arange(n) / SR
    thump = np.sin(2 * np.pi * (70 + 60 * np.exp(-tt * 60)) * tt) * np.exp(-tt * 38)
    if kind == 'B':    # park path: grit
        grit = bp(noise(n), 900, 6000) * np.exp(-tt * 28) * 0.55
        thump *= 0.7
    elif kind == 'C':  # lakeside concrete: crisp
        grit = bp(noise(n), 1500, 7000) * np.exp(-tt * 70) * 0.5
    else:              # asphalt, sneakers
        grit = bp(noise(n), 400, 3500) * np.exp(-tt * 55) * 0.45
    scuff = bp(noise(n), 2000, 8000) * np.exp(-((tt - 0.035) / 0.012) ** 2) * 0.12
    return (thump * 0.8 + grit + scuff) * rng.uniform(0.8, 1.1)

step_gain = {'A': 0.26, 'B': 0.24, 'C': 0.22, 'G': 0.2}
for s in cues['steps']:
    t = s['t']
    g = step_gain[s['tag']] * s['gain']
    # tails of each shot duck under the next cut
    if s['tag'] == 'A' and T['a1'] < t < T['c1']: g *= max(0, 1 - (t - T['a1']) / 0.2)
    if s['tag'] == 'B' and T['b1'] < t < T['c1']: g *= max(0, 1 - (t - T['b1']) / 0.2)
    if T['c1'] <= t < T['group']: g *= max(0, 1 - (t - T['c1']) / 1.6)
    if s['tag'] == 'G': g *= min(1, (t - T['group']) / 0.25 + 0.4) * max(0, min(1, (T['end0'] + 0.2 - t) / 0.5))
    add(footstep(s['tag'] if s['tag'] != 'G' else 'A'), t, g, s['pan'] + rng.uniform(-0.05, 0.05), send=0.25)


# ------------------------------------------------------------------ transitions + micro-interactions
def swish(t, d, gain, f0=400, f1=4000, pan=0.0):
    n = int(d * SR); tt = np.arange(n) / SR
    x = noise(n)
    out = np.zeros(n)
    # sweep a band-pass by processing in chunks
    ch = 512
    for i in range(0, n, ch):
        f = f0 * (f1 / f0) ** (i / n)
        out[i:i + ch] = bp(x[i:i + ch], f * 0.7, min(f * 1.4, SR / 2 - 100))
    out *= np.sin(np.pi * tt / d) ** 2
    add(out, t, gain, pan, send=0.6)
def tick(t, gain, f=3200, pan=0.0):
    n = int(0.02 * SR); tt = np.arange(n) / SR
    add(np.sin(2 * np.pi * f * tt) * np.exp(-tt * 400), t, gain, pan, send=0.3)
def blip(t, f, gain, pan=0.0, d=0.35):
    n = int(d * SR); tt = np.arange(n) / SR
    x = (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(2 * np.pi * 2 * f * tt) * np.exp(-tt * 20)) * np.exp(-tt * 9) * env_ar(n, 0.003, 0.02)
    add(x, t, gain, pan, send=0.9)

# the HUD types itself in
for k in range(9): tick(0.4 + k * 0.045, 0.02, 2600 + 300 * (k % 3), -0.5)
for k in range(5): tick(1.2 + k * 0.05, 0.022, 3000, 0.3)
for cut in (T['a1'], T['b1']):
    swish(cut - 0.05, 0.55, 0.05, 300, 5000)
    for k in range(4): tick(cut + 0.1 + k * 0.07, 0.02, 3400, 0.25)
swish(T['c1'] - 0.02, 0.7, 0.045, 5000, 600)
# bands collapse into three dots: three soft pips, one per runner
for i, (f, pan) in enumerate([(587.33, -0.4), (739.99, 0.4), (880.0, 0.0)]):
    blip(T['mapIn'] + 0.55 + i * 0.07, f, 0.05, pan)
swish(T['mapIn'] - 0.05, 0.9, 0.04, 6000, 300)


# ------------------------------------------------------------------ the pulse (90 BPM)
def kick(gain):
    n = int(0.5 * SR); tt = np.arange(n) / SR
    return np.sin(2 * np.pi * (48 * tt + 90 * (1 - np.exp(-tt * 30)) / 30)) * np.exp(-tt * 7) * gain
def shaker(gain):
    n = int(0.06 * SR); tt = np.arange(n) / SR
    return hp(noise(n), 6000) * np.exp(-tt * 80) * gain
def pluck(f, d=0.9):
    n = int(d * SR); tt = np.arange(n) / SR
    x = sum(np.sin(2 * np.pi * f * h * tt) * np.exp(-tt * (5 + 5 * h)) / h for h in (1, 2, 3, 4))
    return x * env_ar(n, 0.004, 0.1)

b0 = 11  # pulse enters on beat 11 (7.33 s), as the routes start to draw
beats = np.arange(b0, 25)
for b in beats:
    t = b * BEAT
    if t >= T['dive0'] + 0.25 and t < T['group'] - 0.01: continue   # hold breath through the dive
    grow = min(1, (b - b0) / 6)
    if t < T['group']:
        add(kick(0.32 * (0.35 + 0.65 * grow)), t, 1, 0, send=0.1)
        if b >= b0 + 3:
            for k in (0.5,):
                add(shaker(0.05 * grow), t + k * BEAT, 1, 0.3, send=0.2)
    else:
        # together: the pulse softens, half-time, and the footsteps carry the rhythm
        if (b - 19) % 2 == 0: add(kick(0.22), t, 1, 0, send=0.25)

# three voices, one per runner — out of phase at first, landing together at the meet
arp_notes = [293.66, 369.99, 440.0]   # D4 F#4 A4
for i, f in enumerate(arp_notes):
    period = BEAT * (1.0 + [0.13, -0.09, 0.21][i])
    t = T['draw0'] + 0.2 + i * 0.21
    while t < T['meet'] - 0.1:
        # periods converge towards the beat
        k = (t - T['draw0']) / (T['meet'] - T['draw0'])
        add(pluck(f, 0.7), t, 0.035 * (0.5 + 0.5 * k), [-0.55, 0.55, 0.0][i], send=0.7)
        t += lerp_p if (lerp_p := period + (BEAT - period) * k) else BEAT


# ------------------------------------------------------------------ meet, dive, breath
def pad(freqs, t0, t1, gain, attack=0.8, release=1.2, bright=1.0):
    n = ts(t1 - t0 + release)
    tt = np.arange(n) / SR
    x = np.zeros(n)
    for f in freqs:
        for det in (-0.12, 0.0, 0.13):
            ff = f * 2 ** (det / 12)
            ph = rng.uniform(0, 2 * np.pi)
            x += (np.sin(2 * np.pi * ff * tt + ph) + 0.25 * bright * np.sin(4 * np.pi * ff * tt + ph)) / 3
    x = lp(x, 2200 * bright)
    e = np.ones(n)
    na = ts(attack); e[:na] = np.linspace(0, 1, na) ** 1.5
    nr = ts(release); e[-nr:] *= np.linspace(1, 0, nr) ** 2
    x *= e / len(freqs)
    for ch, pan in ((0, -0.35), (1, 0.35)):
        place(L if ch == 0 else R, np.zeros(N), x * (1 + 0.1 * (ch * 2 - 1)), t0, gain, -1)
    place(RL, RR, x, t0, gain * 0.9, 0)

# curiosity: a faint, unresolved air tone under the triptych
pad([440.0, 659.25], T['c1'] - 0.3, T['mapIn'] + 0.9, 0.05, attack=1.0, release=0.8, bright=0.4)
# low drone from the pull-back, tension without melody
pad([73.42, 110.0], T['pull0'], T['dive0'] + 0.3, 0.18, attack=2.5, release=0.6, bright=0.6)
# riser into the meet, then into the dive
def riser(t0, d, gain, f0, f1):
    n = ts(d); tt = np.arange(n) / SR
    out = np.zeros(n); x = pink(n); ch = 1024
    for i in range(0, n, ch):
        f = f0 * (f1 / f0) ** (i / n)
        out[i:i + ch] = bp(x[i:i + ch], f * 0.6, min(f * 1.6, SR / 2 - 100))
    out *= (tt / d) ** 2.2
    add(out, t0, gain, 0, send=0.8)
riser(T['meet'] - 1.2, 1.2, 0.05, 300, 3000)
# at the meet: a single warm chord bloom + chime
pad([146.83, 220.0, 293.66, 369.99], T['meet'], T['dive0'], 0.14, attack=0.05, release=0.9)
blip(T['meet'], 1174.66, 0.035, 0.2, d=1.2)
riser(T['dive0'], T['group'] - T['dive0'] - 0.06, 0.08, 200, 9000)

# the breath: music opens as they run together
G0, E0 = T['group'], T['end0']
pad([73.42, 146.83, 220.0, 277.18, 329.63, 369.99], G0, E0 + 0.6, 0.2, attack=0.35, release=2.2)      # D maj9
pad([587.33, 739.99], G0 + 0.6, E0 + 0.2, 0.05, attack=1.5, release=1.6, bright=0.5)                   # air
sub = np.sin(2 * np.pi * 36.71 * np.arange(ts(E0 - G0 + 1.5)) / SR) * env_ar(ts(E0 - G0 + 1.5), 0.4, 1.4)
add(sub, G0, 0.16)
# a slow, human melody — felt-piano tones, one per beat pair
mel = [(0, 880.0), (2, 739.99), (3, 659.25), (4, 587.33), (6, 659.25), (7, 739.99)]
for bb, f in mel:
    t = G0 + bb * BEAT * 0.83 + 0.35
    if t < E0 - 0.1: add(pluck(f, 1.6), t, 0.05, [-0.3, 0.3][bb % 2], send=1.1)


# ------------------------------------------------------------------ sonic logo
def bell(f, d=3.5):
    n = ts(d); tt = np.arange(n) / SR
    parts = [(1, 1, 1.4), (2.0, 0.35, 3), (2.76, 0.18, 5), (4.07, 0.08, 8)]
    x = sum(a * np.sin(2 * np.pi * f * m * tt) * np.exp(-tt * k) for m, a, k in parts)
    return x * env_ar(n, 0.002, 0.3)
M = T['mark']
add(bell(659.25), M - 0.2, 0.09, -0.25, send=1.0)     # O
add(bell(987.77), M, 0.08, 0.25, send=1.0)            # O — a fifth above: the two, together
add(bell(329.63, 4.0), M, 0.05, 0, send=0.8)
add(kick(0.22), M, 1, 0, send=0.4)
thump = lp(noise(ts(0.3)), 200) * np.exp(-np.arange(ts(0.3)) / SR * 18)
add(thump, M, 0.2, 0)
# final soft click on the tagline
tick(T['tag'] + 0.02, 0.015, 2400, 0)


# ------------------------------------------------------------------ reverb + master
def ir(d=2.6, predelay=0.022):
    n = ts(d); tt = np.arange(n) / SR
    out = []
    for s in (1, 2):
        x = noise(n) * np.exp(-tt * 3.0)
        x = lp(x, 5000) * (1 - np.exp(-tt * 200))
        out.append(np.concatenate([np.zeros(ts(predelay)), x]) / np.sqrt(np.sum(x ** 2)))
    return out
irl, irr = ir()
wl = signal.fftconvolve(RL, irl)[:N]
wr = signal.fftconvolve(RR, irr)[:N]
mixL = L + wl * 0.55
mixR = R + wr * 0.55
# gentle glue: high-pass rumble, soft saturation
mixL, mixR = hp(mixL, 28), hp(mixR, 28)
st = np.stack([mixL, mixR], 1)
st /= np.max(np.abs(st)) + 1e-9
st = np.tanh(st * 1.3) / np.tanh(1.3)
fade = np.ones(N); nf = ts(0.4); fade[-nf:] = np.linspace(1, 0, nf) ** 2
fade[:ts(0.3)] = np.linspace(0, 1, ts(0.3))
st *= fade[:, None] * db(-1)
from scipy.io import wavfile
wavfile.write(sys.argv[2], SR, (st * 32767).astype(np.int16))
print('wrote', sys.argv[2], f'{DUR:.2f}s')
