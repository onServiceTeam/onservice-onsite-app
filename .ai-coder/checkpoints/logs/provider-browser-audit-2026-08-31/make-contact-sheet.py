from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
THUMBNAIL = (250, 165)
LABEL_HEIGHT = 34
COLUMNS = 5
GAP = 10


def make_sheet(source_directory: Path, output: Path) -> None:
    paths = sorted(source_directory.glob("*.png"))
    rows = (len(paths) + COLUMNS - 1) // COLUMNS
    sheet = Image.new(
        "RGB",
        (
            GAP + COLUMNS * (THUMBNAIL[0] + GAP),
            GAP + rows * (THUMBNAIL[1] + LABEL_HEIGHT + GAP),
        ),
        "#e7ecfa",
    )
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=13)

    for index, path in enumerate(paths):
        column = index % COLUMNS
        row = index // COLUMNS
        x = GAP + column * (THUMBNAIL[0] + GAP)
        y = GAP + row * (THUMBNAIL[1] + LABEL_HEIGHT + GAP)
        with Image.open(path) as source:
            image = source.convert("RGB")
            image.thumbnail(THUMBNAIL, Image.Resampling.LANCZOS)
            tile = Image.new("RGB", THUMBNAIL, "white")
            tile.paste(image, ((THUMBNAIL[0] - image.width) // 2, 0))
            sheet.paste(tile, (x, y))
        draw.text((x + 3, y + THUMBNAIL[1] + 5), path.stem[:38], fill="#0b1f44", font=font)

    sheet.save(output, optimize=True)
    print(f"Wrote {output} with {len(paths)} screens")


for viewport in (768, 1024, 1366):
    make_sheet(
        ROOT / "populated-state-screenshots" / str(viewport),
        ROOT / f"provider-populated-{viewport}-contact-sheet.png",
    )
    make_sheet(
        ROOT / "onboarding-flow-screenshots" / str(viewport),
        ROOT / f"provider-onboarding-{viewport}-contact-sheet.png",
    )
