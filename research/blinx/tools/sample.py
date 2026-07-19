#!/usr/bin/env python3
"""Rock-bottom pixel sampler for the Blinx evidence crops.

Each SAMPLE is (file, x, y, w, h, label). Prints mean RGB, HSV and stdev so
the art laws can be stated as NUMBERS (value ladder rungs, dab deltas, pool
falloff ratios, saturation ration) rather than adjectives.
"""
import colorsys
import os
import sys
from PIL import Image, ImageStat

CROPS = os.path.join(os.path.dirname(__file__), "..", "crops")

SAMPLES = [
    # --- lamp pool falloff (Time Square): painted light, not dynamic ---
    ("lamppool.jpg",  90,  90, 60, 60, "lamp pool CORE"),
    ("lamppool.jpg",  40, 170, 40, 40, "lamp pool EDGE"),
    ("lamppool.jpg", 300,  40, 50, 50, "ground OFF-POOL"),
    # --- pit darkness ladder (Deja Vu): darkest dark is not black ---
    ("blackpit.jpg", 230, 130, 60, 60, "pit CORE"),
    ("blackpit.jpg", 160,  50, 80, 30, "pit RIM lip (top face)"),
    ("blackpit.jpg",  60, 330, 60, 60, "floor tile"),
    # --- water: wall above vs below the waterline (alpha/tint estimate) ---
    ("wateredge.jpg", 560, 280, 80, 60, "open WATER"),
    ("wateredge.jpg", 430,  40, 80, 60, "wall ABOVE waterline"),
    ("wateredge.jpg", 400, 170, 60, 50, "wall BELOW waterline (through water)"),
    # --- cave wall blob values + crystal core (Hourglass) ---
    ("marble.jpg", 150,  80, 60, 60, "cave blob DARK"),
    ("marble.jpg", 450, 250, 60, 60, "cave blob MID"),
    ("marble.jpg", 700, 120, 60, 60, "cave blob LIGHT"),
    ("marble.jpg", 400, 200, 50, 50, "crystal CORE"),
    # --- lava crackle cells (Forge): core/mid/border/rim ---
    ("lava.jpg", 240, 100, 50, 50, "lava cell CORE (yellow)"),
    ("lava.jpg", 130, 200, 50, 50, "lava cell MID (orange)"),
    ("lava.jpg", 380, 160, 40, 40, "lava cell BORDER (red)"),
    ("lava.jpg",  90, 185, 30, 30, "lava EDGE rim at ledge"),
    ("lava.jpg", 120, 370, 60, 50, "dark floor near lava"),
    # --- painted relief light logic (Temple) ---
    ("relief.jpg", 250, 100, 40, 40, "glyph HIGHLIGHT"),
    ("relief.jpg", 300, 160, 40, 40, "glyph SHADE"),
    ("relief.jpg", 500, 300, 50, 50, "recess STAIN"),
    # --- brick mottle (Time Square) ---
    ("brickwall.jpg", 380, 200, 40, 40, "brick LIT dab"),
    ("brickwall.jpg", 200, 300, 40, 40, "brick MID"),
    ("brickwall.jpg", 100, 100, 40, 40, "brick DARK dab/mortar"),
    # --- snow cliff: orientation value stepping (Everwinter) ---
    ("w7s-65.jpg", 200, 140, 60, 40, "snow TOP face"),
    ("w7s-65.jpg", 260, 230, 50, 40, "cliff SIDE face"),
    ("w7s-65.jpg", 320,  40, 80, 30, "sky band"),
    ("w7s-65.jpg",  90, 105, 50, 30, "far mesa"),
    # --- icicle vs backing (Everwinter): light-against-dark staging ---
    ("w7s-110.jpg", 250, 15, 60, 20, "icicle PALE"),
    ("w7s-110.jpg", 250,  60, 60, 30, "overhang BACKING dark"),
    ("w7s-110.jpg", 320, 250, 60, 50, "snow ground"),
    # --- crystal stalk lamp (Mine): orb/halo/rock ladder ---
    ("crystalstalk.jpg", 455, 200, 30, 30, "orb CORE"),
    ("crystalstalk.jpg", 420, 240, 40, 40, "halo MID"),
    ("crystalstalk.jpg", 180,  80, 60, 60, "rock FAR"),
    ("crystalstalk.jpg", 350, 350, 60, 60, "rock NEAR warm"),
    # --- threshold value+temperature step (Time Square arch) ---
    ("banner.jpg", 150,  50, 50, 50, "arch INNER (dark frame)"),
    ("banner.jpg", 320, 140, 60, 60, "corridor BEYOND (bright core)"),
    ("banner.jpg",  60, 180, 40, 80, "honey wall LIT"),
    # --- temple tiers: ledge bright top / dark under ---
    ("tiers.jpg", 180, 360, 80, 60, "relief band"),
    ("tiers.jpg", 600, 160, 80, 60, "smooth band"),
    ("tiers.jpg", 820, 225, 60, 20, "ledge TOP edge"),
    ("tiers.jpg", 820, 255, 60, 20, "ledge UNDER"),
]

def main():
    print(f"{'label':38s} {'RGB mean':22s} {'V%':>5s} {'S%':>5s} {'hue':>5s} {'stdev':>6s}")
    for fname, x, y, w, h, label in SAMPLES:
        path = os.path.join(CROPS, fname)
        if not os.path.exists(path):
            print(f"{label:38s} MISSING {fname}")
            continue
        im = Image.open(path).convert("RGB")
        x = min(x, im.width - 1); y = min(y, im.height - 1)
        w = min(w, im.width - x); h = min(h, im.height - y)
        region = im.crop((x, y, x + w, y + h))
        st = ImageStat.Stat(region)
        r, g, b = st.mean
        hh, ss, vv = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        sd = sum(st.stddev) / 3
        print(f"{label:38s} ({r:5.1f},{g:5.1f},{b:5.1f})   {vv*100:5.1f} {ss*100:5.1f} {hh*360:5.0f} {sd:6.1f}")

if __name__ == "__main__":
    main()
