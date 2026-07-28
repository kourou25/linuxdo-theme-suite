#!/usr/bin/env python3
"""Build a four-frame transparent APNG companion from any 2x2 sprite sheet."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


FRAME_SIZE = 640
FRAME_DURATIONS_MS = (1500, 420, 720, 420)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Crop a transparent 2x2 sprite sheet into a 640 px APNG.",
    )
    parser.add_argument("--input", required=True, help="Transparent 2x2 PNG sheet.")
    parser.add_argument("--output", required=True, help="Output APNG path.")
    return parser.parse_args()


def crop_frames(sheet: Image.Image) -> list[Image.Image]:
    rgba = sheet.convert("RGBA")
    cell_width = rgba.width // 2
    cell_height = rgba.height // 2
    if cell_width < 1 or cell_height < 1:
        raise ValueError("Sprite sheet must contain four non-empty cells.")

    frames: list[Image.Image] = []
    for row in range(2):
        for column in range(2):
            left = column * cell_width
            top = row * cell_height
            right = rgba.width if column == 1 else left + cell_width
            bottom = rgba.height if row == 1 else top + cell_height
            cell = rgba.crop((left, top, right, bottom))
            fitted = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
            cell.thumbnail((FRAME_SIZE, FRAME_SIZE), Image.Resampling.LANCZOS)
            fitted.alpha_composite(
                cell,
                ((FRAME_SIZE - cell.width) // 2, FRAME_SIZE - cell.height),
            )
            frames.append(fitted)
    return frames


def main() -> None:
    args = parse_args()
    source = Path(args.input)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)

    with Image.open(source) as sheet:
        frames = crop_frames(sheet)

    frames[0].save(
        output,
        format="PNG",
        save_all=True,
        append_images=frames[1:],
        duration=FRAME_DURATIONS_MS,
        loop=0,
        disposal=2,
        blend=0,
        optimize=False,
    )


if __name__ == "__main__":
    main()
