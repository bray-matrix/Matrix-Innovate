import fitz
from pathlib import Path
import sys

pdf = Path(sys.argv[1] if len(sys.argv) > 1 else "attached_assets/generated/application-inventory-brief.pdf")
out = Path(".agents/outputs")
out.mkdir(parents=True, exist_ok=True)
doc = fitz.open(pdf)
print(f"Pages: {len(doc)}")
for n, page in enumerate(doc, 1):
    target = out / f"{pdf.stem}-page-{n}.png"
    page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False).save(target)
    blocks = [b for b in page.get_text("blocks") if b[6] == 0]
    print(f"Page {n}: {page.rect}, text blocks={len(blocks)}, images={len(page.get_images())}; render={target}")
    for b in blocks:
        text = b[4].strip().replace("\n", " ")
        print(f"  ({b[0]:.1f},{b[1]:.1f})-({b[2]:.1f},{b[3]:.1f}): {text[:100]}")
        if b[0] < 0 or b[1] < 0 or b[2] > page.rect.width or b[3] > page.rect.height:
            print("  WARNING: text outside page!")