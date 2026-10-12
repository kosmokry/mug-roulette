import json, math, os, sys
import numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi

OUT = sys.argv[1]
os.makedirs(OUT + '/assets', exist_ok=True)
K = 0.12
TEXW = 2048
NPROF = 48

def load(n):
    im = np.array(Image.open(f'hi/{n}.jpg').convert('RGB'))
    m = Image.open(f'mask/{n}.png').resize((im.shape[1], im.shape[0]), Image.BILINEAR)
    m = np.array(m) > 127
    m = ndi.binary_opening(m, iterations=2)
    lab, nl = ndi.label(m)
    if nl > 1:
        sz = ndi.sum(m, lab, range(1, nl + 1))
        m = lab == (1 + int(np.argmax(sz)))
    return im, m

def rows_ext(m, cx=None):
    ys = np.where(m.any(1))[0]
    yt, yb = ys[0], ys[-1]
    L = np.full(m.shape[0], -1.0); R = np.full(m.shape[0], -1.0)
    for y in range(yt, yb + 1):
        xs = np.where(m[y])[0]
        if len(xs): L[y] = xs[0]; R[y] = xs[-1]
    return yt, yb, L, R

CUT=0.0
def fit_template(M, T, bbT, s0):
    # T: cropped v2 silhouette (bool), bbT=(y0,y1,x0,x1) in v2 coords. returns (s, cx, ybottom, Tmask in M coords)
    y0, y1, x0, x1 = bbT
    Tc = T[y0:y1 + 1, x0:x1 + 1].astype(np.uint8)
    D = 4
    Ms = cv2.resize(M.astype(np.uint8), (M.shape[1] // D, M.shape[0] // D), interpolation=cv2.INTER_AREA) > 0
    ys, xs = np.where(M)
    best = None
    for sc in np.linspace(0.62, 1.25, 43):
        Tr = cv2.resize(Tc, (max(int(Tc.shape[1] * sc / D), 2), max(int(Tc.shape[0] * sc / D), 2)), interpolation=cv2.INTER_AREA) > 0
        th, tw = Tr.shape
        yb_s = ys.max() // D
        xl_s = xs.min() // D; xr_s = xs.max() // D
        for yb_c in range(yb_s - 6, yb_s + 4):
            for xs0 in list(range(xl_s - 6, xl_s + 12)) + list(range(xr_s - tw - 12, xr_s - tw + 6)) + list(range((xl_s + xr_s) // 2 - tw // 2 - 8, (xl_s + xr_s) // 2 - tw // 2 + 8)):
                ytop = yb_c - th + 1
                if xs0 < 0 or xs0 + tw > Ms.shape[1]: continue
                a = max(ytop, 0)
                sub = Ms[a:yb_c + 1, xs0:xs0 + tw]
                t = Tr[a - ytop:, :]
                if sub.shape != t.shape: continue
                cut = int(t.shape[0] * CUT)
                inter = (sub[cut:] & t[cut:]).sum(); outside = (t[cut:] & ~sub[cut:]).sum()
                score = inter - 3.0 * outside
                if best is None or score > best[0]:
                    best = (score, sc, xs0, yb_c)
    _, sc, xs0, yb_c = best
    # refine at full res (small local search)
    Tr = cv2.resize(Tc, (int(Tc.shape[1] * sc), int(Tc.shape[0] * sc)), interpolation=cv2.INTER_AREA) > 0
    th, tw = Tr.shape
    bx, by, bsc = xs0 * D, yb_c * D, 0
    bestl = None
    for dy in range(-3 * D, 3 * D + 1, 2):
        for dx in range(-3 * D, 3 * D + 1, 2):
            yb_f = by + dy; x_f = bx + dx
            ytop = yb_f - th + 1
            a = max(ytop, 0)
            if x_f < 0 or x_f + tw > M.shape[1]: continue
            sub = M[a:yb_f + 1, x_f:x_f + tw]; t = Tr[a - ytop:, :]
            if sub.shape != t.shape: continue
            cut = int(t.shape[0] * CUT)
            score = (sub[cut:] & t[cut:]).sum() - 3.0 * (t[cut:] & ~sub[cut:]).sum()
            if bestl is None or score > bestl[0]: bestl = (score, x_f, yb_f)
    _, x_f, yb_f = bestl
    full = np.zeros(M.shape, bool)
    ytop = yb_f - th + 1
    a = max(ytop, 0)
    full[a:yb_f + 1, x_f:x_f + tw] = Tr[a - ytop:, :]
    return sc, x_f + tw / 2.0, yb_f, full

CFG = {
    # name: dict(cat=..., kitten=..., bump=..., label)
}

def build(idx, base):
    global CUT, K
    K = 0.12
    TRIM = 0.13 if idx == 0 else 0.0
    CUT = 0.3 if idx in (5, 6, 7) else 0.0
    v = [load(base + k) for k in range(5)]
    (im1, m1), (im2, m2), (im3, m3), (im4, m4), (im5, m5) = v
    # ---- profile from view 2 (handle hidden)
    yt2, yb2, L2, R2 = rows_ext(m2)
    mid = range(int(yt2 + 0.3 * (yb2 - yt2)), int(yt2 + 0.8 * (yb2 - yt2)))
    cx2 = float(np.median([(L2[y] + R2[y]) / 2 for y in mid]))
    half = np.array([min(cx2 - L2[y], R2[y] - cx2) if L2[y] >= 0 else 0 for y in range(m2.shape[0])])
    Rmax = half.max()
    # body top: first row with width >= 0.55 Rmax
    cand = [y for y in range(yt2, yb2) if half[y] >= 0.55 * Rmax]
    ytb = cand[0]
    # smooth half
    hs = ndi.uniform_filter1d(half, 9)
    Hsil = yb2 - ytb
    Hpx = Hsil - K * (hs[yb2 - 4] + hs[ytb + 2])
    Hu = Hpx / Rmax * (1 - TRIM)
    prof = []
    for j in range(NPROF):
        h = j / (NPROF - 1)           # 0 bottom .. 1 top
        y = int(round(yb2 - 3 - h * (Hsil - 6) * (1 - TRIM)))
        prof.append([float(hs[y] / Rmax), float(h * Hu)])
    # the top rows of the silhouette are the far rim ellipse -> extrapolate the wall instead
    i0 = int(NPROF * 0.86); i1 = int(NPROF * 0.72)
    slope = (prof[i0][0] - prof[i1][0]) / (i0 - i1)
    for j in range(i0 + 1, NPROF):
        prof[j][0] = float(max(prof[i0][0] + slope * (j - i0), prof[i0][0] * 0.92))
    # ---- per view scale + centre
    bbT = (yt2, yb2, int(L2[yt2:yb2 + 1][L2[yt2:yb2 + 1] >= 0].min()), int(R2[yt2:yb2 + 1].max()))
    views = {'v2': dict(im=im2, m=m2, s=1.0, cx=cx2, yb=yb2)}
    tmasks = {}
    for name, im, m in (('v1', im1, m1), ('v3', im3, m3), ('v4', im4, m4)):
        sc, cxk, ybk, tm = fit_template(m, m2, bbT, 1.0 if True else 1)
        views[name] = dict(im=im, m=m, s=sc, cx=cxk - (cx2 - bbT[2]) * sc + (cx2 - bbT[2]) * sc, yb=ybk)
        # centre: template centre x corresponds to bbox centre; shift by (cx2 - bbox centre)
        bc = (bbT[2] + bbT[3]) / 2.0
        views[name]['cx'] = cxk + (cx2 - bc) * sc
        tmasks[name] = tm
    if idx == 5:
        for nm, (cxd, wd, ybd) in {'v1': (167.5, 235, 390), 'v3': (200, 223, 395), 'v4': (183, 220, 400)}.items():
            views[nm].update(cx=cxd * 4, s=wd / 233.0, yb=ybd * 4)
        pm = np.zeros(m1.shape, np.uint8)
        cv2.fillPoly(pm, [np.array([[0, 110 * 4], [287 * 4, 110 * 4], [287 * 4, 125 * 4], [270 * 4, 392 * 4], [0, 392 * 4]])], 1)
        tmasks['v1'] = pm > 0
    # ---- texture: u runs v1(0deg), v4(90), v3(180), v2(270)
    order = [('v1', 0), ('v4', 90), ('v3', 180), ('v2', 270)]
    TH = int(round(TEXW * Hu / (2 * math.pi)))
    TH = max(160, min(TH, 640))
    tex = np.zeros((TH, TEXW, 3), np.float32)
    wsum = np.zeros((TH, TEXW, 1), np.float32)
    hs_prof = np.array([p[0] for p in prof]); hh = np.array([p[1] for p in prof])
    for vname, ang0 in order:
        d = views[vname]
        s, cx, yb = d['s'], d['cx'], d['yb']
        us = (np.arange(TEXW) + 0.5) / TEXW * 360.0
        dth = ((us - ang0 + 180) % 360) - 180          # signed angle from view centre
        if vname == 'v4':
            a = np.abs(dth)
            wgt = np.maximum(np.clip((a - 32) / 8.0, 0, 1) * np.clip(1 - (a - 46) / 10.0, 0, 1), 0.02)
        else:
            a = np.abs(dth)
            lim = 84 if vname in ('v1', 'v3') else 52
            wgt = np.clip(1 - (a - (lim - 14)) / 14.0, 0, 1)
            wgt[a > lim] = 0
        th = np.radians(dth)
        vs = (np.arange(TH) + 0.5) / TH               # 0 top .. 1 bottom
        hgt = (1 - vs) * Hu
        r_h = np.interp(hgt, hh, hs_prof)             # units
        Rpx_b = Rmax * s * hs_prof[0]
        # axis centre y at height h
        yc0 = yb - K * Rpx_b * 1.0
        Y = yc0 - hgt[:, None] * Rmax * s + K * (r_h[:, None] * Rmax * s) * np.cos(th)[None, :]
        X = cx + (r_h[:, None] * Rmax * s) * np.sin(th)[None, :] * 0.985
        im = d['im'].astype(np.float32)
        smp = cv2.remap(im, X.astype(np.float32), Y.astype(np.float32), cv2.INTER_AREA if False else cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        w = wgt[None, :, None]
        tex += smp * w; wsum += w
    tex = tex / np.maximum(wsum, 1e-3)
    if idx == 1:
        p = np.percentile(tex.reshape(-1, 3), 90, axis=0)
        tex = tex * (np.array([244., 242., 236.]) / p)[None, None, :]
    # exposure balance between views: simple per-column low-frequency gain match is skipped
    Image.fromarray(np.clip(tex, 0, 255).astype(np.uint8)).save(f'{OUT}/assets/mug{idx}.jpg', quality=88, optimize=True)

    # ---- handle (view 1, handle on the right)
    d = views['v1']; m = d['m']; s = d['s']; cx = d['cx']; yb = d['yb']
    ppu = Rmax * s
    yc0 = yb - K * Rmax * s * hs_prof[0]
    body = ndi.binary_dilation(tmasks['v1'], iterations=3)
    ov = im1.copy(); ov[tmasks['v1']] = (0.5 * ov[tmasks['v1']] + 0.5 * np.array([0, 255, 0])).astype(np.uint8)
    Image.fromarray(ov).resize((378, 504)).save(f'dbg_o{idx}.png')
    hm = m & ~body
    rimrow = int(np.where(tmasks['v1'].any(1))[0][0]) if tmasks['v1'].any() else 0
    if idx not in (5,): hm[:rimrow + 8] = False
    cxv = views['v1']['cx']; ppu_ = Rmax * views['v1']['s']
    hm[:, :int(cxv + 0.93 * ppu_ * 0.9)] = False
    hm = ndi.binary_opening(hm, iterations=6)
    Image.fromarray((hm*255).astype(np.uint8)).resize((378,504)).save(f'dbg_h{idx}.png')
    lab, nl = ndi.label(hm)
    sz = ndi.sum(hm, lab, range(1, nl + 1))
    hm = lab == (1 + int(np.argmax(sz)))
    hm = ndi.binary_closing(hm, iterations=2)
    dtm = ndi.distance_transform_edt(hm)
    stroke = 2 * dtm.max() / ppu
    cs, hier = cv2.findContours(hm.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    hier = hier[0]
    polys = []
    for i, c in enumerate(cs):
        if cv2.contourArea(c) < 200: continue
        c = cv2.approxPolyDP(c, 1.6, True)[:, 0, :].astype(np.float64)
        pts = [[float((x - cx) / ppu), float((yc0 - y) / ppu)] for x, y in c]
        polys.append(dict(hole=bool(hier[i][3] >= 0), pts=pts))
    # handle colour
    hc = np.median(d['im'][ndi.binary_erosion(hm, iterations=4)], axis=0)
    # ---- interior from top view
    dt5 = ndi.distance_transform_edt(m5)
    cy5, cx5 = np.unravel_index(np.argmax(dt5), dt5.shape)
    r5 = dt5.max()
    # refine centre: mean of pixels with dt > 0.9 max
    yy, xx = np.where(dt5 > 0.93 * r5)
    cy5, cx5 = int(yy.mean()), int(xx.mean())
    im5 = im5
    ring = np.zeros(m5.shape, bool)
    Y_, X_ = np.ogrid[:m5.shape[0], :m5.shape[1]]
    rr = np.hypot(Y_ - cy5, X_ - cx5)
    ring = (rr > 0.78 * r5) & (rr < 0.9 * r5)
    wall = np.median(im5[ring], axis=0)
    a = 0.80 * r5
    crop = im5[int(cy5 - a):int(cy5 + a), int(cx5 - a):int(cx5 + a)]
    crop = cv2.resize(crop, (384, 384), interpolation=cv2.INTER_AREA)
    yy2, xx2 = np.ogrid[:384, :384]
    circ = np.hypot(yy2 - 192, xx2 - 192) < 192
    crop[~circ] = wall
    Image.fromarray(crop).save(f'{OUT}/assets/floor{idx}.jpg', quality=85)
    # outer base colour
    outer = np.median(tex.reshape(-1, 3), axis=0)
    return dict(idx=idx, H=Hu, profile=prof, handle=polys, handleStroke=float(stroke), handleColor=[int(x) for x in hc],
                wallColor=[int(x) for x in wall], baseColor=[int(x) for x in outer], texH=TH)

out = []
for i in range(8):
    r = build(i, 8857 + i * 5)
    print(i, 'H=%.2f stroke=%.2f polys=%d' % (r['H'], r['handleStroke'], len(r['handle'])), r['texH'])
    out.append(r)
json.dump(out, open(OUT + '/assets/mugs.json', 'w'), separators=(',', ':'))
