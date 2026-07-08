from PIL import Image, ImageDraw
import math


def draw_claw_heart(size: int) -> Image.Image:
    """Generate a sharp, minimalist black-claw + red-heart icon."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Scale helpers
    s = size
    cx, cy = s // 2, s // 2

    # Palette
    bg = (8, 8, 8, 255)
    claw = (16, 16, 16, 255)
    claw_edge = (38, 38, 38, 255)
    heart = (220, 38, 38, 255)
    heart_core = (255, 60, 60, 255)
    gold = (250, 204, 21, 255)

    # Background fill
    draw.rectangle([0, 0, s, s], fill=bg)

    pad = int(s * 0.08)
    area = (pad, pad, s - pad, s - pad)

    # === Black claw shape: three sharp talons above, holding the heart ===
    # The claw is a single sharp polygon silhouette.
    claw_points = [
        (cx, int(s * 0.12)),            # top center tip
        (int(s * 0.62), int(s * 0.28)), # right shoulder
        (int(s * 0.82), int(s * 0.18)), # right outer talon tip
        (int(s * 0.74), int(s * 0.44)), # right talon inner
        (int(s * 0.86), int(s * 0.58)), # right claw base corner
        (int(s * 0.68), int(s * 0.72)), # right lower inner
        (cx, int(s * 0.62)),            # bottom center notch
        (int(s * 0.32), int(s * 0.72)), # left lower inner
        (int(s * 0.14), int(s * 0.58)), # left claw base corner
        (int(s * 0.26), int(s * 0.44)), # left talon inner
        (int(s * 0.18), int(s * 0.18)), # left outer talon tip
        (int(s * 0.38), int(s * 0.28)), # left shoulder
    ]
    draw.polygon(claw_points, fill=claw, outline=claw_edge)

    # === Red heart inside the claw ===
    # Build a sharp heart from polygons rather than smooth curves.
    def heart_points(scale: float, oy: float) -> list[tuple[int, int]]:
        r = [
            (cx, int(cy * oy + s * 0.18 * scale)),   # top notch
            (int(cx + s * 0.22 * scale), int(cy * oy - s * 0.08 * scale)),  # right upper lobe
            (int(cx + s * 0.36 * scale), int(cy * oy + s * 0.04 * scale)),  # right outer lobe tip
            (int(cx + s * 0.18 * scale), int(cy * oy + s * 0.28 * scale)),  # right lower side
            (cx, int(cy * oy + s * 0.42 * scale)),   # bottom tip
            (int(cx - s * 0.18 * scale), int(cy * oy + s * 0.28 * scale)),  # left lower side
            (int(cx - s * 0.36 * scale), int(cy * oy + s * 0.04 * scale)),  # left outer lobe tip
            (int(cx - s * 0.22 * scale), int(cy * oy - s * 0.08 * scale)),  # left upper lobe
        ]
        return r

    # Draw outer heart (crimson) then inner highlight
    hp = heart_points(1.0, 1.05)
    draw.polygon(hp, fill=heart)
    hp_inner = heart_points(0.55, 0.98)
    draw.polygon(hp_inner, fill=heart_core)

    # === Gold accent: tiny spike/dot at the very bottom tip ===
    tip_y = int(cy * 1.05 + s * 0.42)
    draw.polygon(
        [
            (cx, tip_y + int(s * 0.06)),
            (cx + int(s * 0.03), tip_y),
            (cx - int(s * 0.03), tip_y),
        ],
        fill=gold,
    )

    return img


if __name__ == "__main__":
    sizes = [256, 128, 64, 48, 32, 16]
    images = [draw_claw_heart(s) for s in sizes]
    images[0].save(
        "public/icon.ico",
        format="ICO",
        sizes=[(s, s) for s in sizes],
        append_images=images[1:],
    )
    print("Generated public/icon.ico")
