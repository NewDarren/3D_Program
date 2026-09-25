from pathlib import Path
import shutil

from PIL import Image, ImageFilter, ImageOps


SITE = Path(r"D:\MMU\nanyang-3d")
ASSETS = SITE / "assets"
ORIGINALS = ASSETS / "original-lowres"
BAR_SOURCE = ASSETS / "original-highres" / "bar.jpg"

TARGET_WIDTHS = {
    "hero.jpg": 2400,
    "river.jpg": 1800,
    "river2.jpg": 1350,
    "terraces.jpg": 2400,
    "dinner.jpg": 1500,
    "afternoon.jpg": 1164,
    "dragon.jpg": 1802,
    "sidecar.jpg": 1791,
    "skywalk.jpg": 2000,
}


def upscale(source: Path, destination: Path, target_width: int) -> tuple[int, int]:
    with Image.open(source) as loaded:
        image = ImageOps.exif_transpose(loaded).convert("RGB")
        if image.width < target_width:
            target_height = round(image.height * target_width / image.width)
            image = image.resize((target_width, target_height), Image.Resampling.LANCZOS)
            image = image.filter(
                ImageFilter.UnsharpMask(radius=1.0, percent=65, threshold=3)
            )
        image.save(
            destination,
            "JPEG",
            quality=94,
            subsampling=0,
            optimize=True,
            progressive=True,
        )
        return image.size


def difference_hash(path: Path) -> int:
    with Image.open(path) as loaded:
        sample = ImageOps.exif_transpose(loaded).convert("L").resize((9, 8))
        pixels = list(sample.get_flattened_data())
    value = 0
    for row in range(8):
        for column in range(8):
            left = pixels[row * 9 + column]
            right = pixels[row * 9 + column + 1]
            value = (value << 1) | int(left > right)
    return value


def hash_distance(first: Path, second: Path) -> int:
    return (difference_hash(first) ^ difference_hash(second)).bit_count()


def main() -> None:
    for name, target_width in TARGET_WIDTHS.items():
        source = ORIGINALS / name
        if not source.exists():
            raise FileNotFoundError(f"Missing original source: {source}")
        dimensions = upscale(source, ASSETS / name, target_width)
        distance = hash_distance(source, ASSETS / name)
        print(
            f"{name}: {dimensions[0]}x{dimensions[1]} "
            f"(original image preserved; perceptual hash distance {distance}/64)"
        )

    if not BAR_SOURCE.exists():
        raise FileNotFoundError(f"Missing confirmed high-resolution bar image: {BAR_SOURCE}")
    shutil.copy2(BAR_SOURCE, ASSETS / "bar.jpg")
    with Image.open(ASSETS / "bar.jpg") as bar:
        print(
            f"bar.jpg: {bar.width}x{bar.height} "
            "(confirmed exact high-resolution source; byte-for-byte copy)"
        )


if __name__ == "__main__":
    main()
