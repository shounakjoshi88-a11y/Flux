#!/usr/bin/env python3
"""
Download Bonsai Image 4B + Real-ESRGAN upscaler weights locally.

Usage:
  python setup_image_models.py                               # ternary Bonsai + x2plus upscaler
  python setup_image_models.py --variant binary              # smaller Bonsai (88% quality)
  python setup_image_models.py --variant both                # both Bonsai variants
  python setup_image_models.py --upscaler x4plus_anime       # specific upscaler
  python setup_image_models.py --upscaler all                # all 3 upscaler models
  python setup_image_models.py --no-upscaler                 # skip upscaler download
  python setup_image_models.py --models-dir D:/models        # custom location
  python setup_image_models.py --force                       # re-download everything
"""

import argparse, os, sys, time, urllib.request
from pathlib import Path


# ── Platform detection ───────────────────────────────────────────────────────

def detect_platform() -> str:
    try:
        import torch
        if torch.cuda.is_available():
            name = torch.cuda.get_device_name(0)
            vram = torch.cuda.get_device_properties(0).total_memory / 1e9
            print(f"[setup] CUDA GPU: {name} ({vram:.1f} GB VRAM)")
            return "cuda"
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            print("[setup] Apple Silicon (MPS)")
            return "mps"
        print("[setup] No GPU detected — CPU mode (slow for generation)")
        print("[setup] For NVIDIA GPU on Windows, run:")
        print("[setup]   pip install torch --index-url https://download.pytorch.org/whl/cu121")
    except ImportError:
        print("[setup] torch not installed — cannot auto-detect GPU")
        print("[setup] Run: pip install torch")
    return "cpu"


# ── Bonsai model definitions ─────────────────────────────────────────────────

BONSAI_REPOS = {
    ("binary",  "cuda"): "prism-ml/bonsai-image-binary-4B-gemlite-1bit",
    ("ternary", "cuda"): "prism-ml/bonsai-image-ternary-4B-gemlite-2bit",
    ("binary",  "mps"):  "prism-ml/bonsai-image-binary-4B-mlx-1bit",
    ("ternary", "mps"):  "prism-ml/bonsai-image-ternary-4B-mlx-2bit",
    ("binary",  "cpu"):  "prism-ml/bonsai-image-binary-4B-gemlite-1bit",
    ("ternary", "cpu"):  "prism-ml/bonsai-image-ternary-4B-gemlite-2bit",
}

BONSAI_LOCAL_DIRS = {
    "binary":  "bonsai-binary",
    "ternary": "bonsai-ternary",
}

BONSAI_SIZES = {
    ("binary",  "cuda"): "~4.1 GB",  ("binary",  "mps"): "~3.4 GB",
    ("ternary", "cuda"): "~4.6 GB",  ("ternary", "mps"): "~3.9 GB",
    ("binary",  "cpu"):  "~4.1 GB",  ("ternary", "cpu"): "~4.6 GB",
}

BONSAI_QUALITY = {
    "binary":  "88% FLUX quality — 0.93 GB transformer",
    "ternary": "95% FLUX quality — 1.21 GB transformer  ← recommended",
}


# ── Real-ESRGAN model definitions ────────────────────────────────────────────

UPSCALER_MODELS = {
    "x2plus": {
        "filename": "RealESRGAN_x2plus.pth",
        "url": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth",
        "size": "~67 MB",
        "label": "2× upscale — general purpose  ← recommended",
    },
    "x4plus": {
        "filename": "RealESRGAN_x4plus.pth",
        "url": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth",
        "size": "~67 MB",
        "label": "4× upscale — general purpose  (1024 → 4096px)",
    },
    "x4plus_anime": {
        "filename": "RealESRGAN_x4plus_anime_6B.pth",
        "url": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth",
        "size": "~18 MB",
        "label": "4× upscale — anime / illustration style",
    },
}


# ── Download helpers ─────────────────────────────────────────────────────────

def download_hf_model(repo_id: str, local_dir: Path, token: str | None) -> None:
    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        print("[setup] ERROR: huggingface_hub not installed.")
        print("[setup] Run: pip install huggingface_hub")
        sys.exit(1)

    print(f"[setup] Downloading {repo_id}")
    print(f"[setup] → {local_dir}")
    t0 = time.time()
    snapshot_download(
        repo_id   = repo_id,
        local_dir = str(local_dir),
        token     = token,
    )
    print(f"[setup] ✓ Done in {time.time() - t0:.0f}s\n")


class DownloadProgress:
    def __init__(self, filename: str):
        self.filename = filename
        self.start    = time.time()

    def __call__(self, block_count: int, block_size: int, total_size: int):
        downloaded = block_count * block_size
        if total_size > 0:
            pct  = min(downloaded / total_size * 100, 100)
            mb   = downloaded / 1e6
            tot  = total_size  / 1e6
            elapsed = time.time() - self.start
            speed   = mb / elapsed if elapsed > 0 else 0
            bar     = "█" * int(pct / 4) + "░" * (25 - int(pct / 4))
            print(f"\r  [{bar}] {pct:5.1f}%  {mb:.1f}/{tot:.1f} MB  {speed:.1f} MB/s", end="", flush=True)


def download_weights(url: str, dest: Path) -> None:
    print(f"[setup] Downloading {dest.name}")
    print(f"[setup] Source: {url}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    progress = DownloadProgress(dest.name)
    urllib.request.urlretrieve(url, str(dest), reporthook=progress)
    print(f"\n[setup] ✓ Saved to {dest}\n")


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Download Bonsai Image 4B + Real-ESRGAN models",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--variant",    choices=["binary", "ternary", "both"], default="ternary")
    parser.add_argument("--models-dir", default="./models")
    parser.add_argument("--platform",   choices=["cuda", "mps", "cpu", "auto"], default="auto")
    parser.add_argument("--upscaler",   choices=["x2plus", "x4plus", "x4plus_anime", "all"],
                        default="x2plus", help="Which Real-ESRGAN weights to download")
    parser.add_argument("--no-upscaler", action="store_true",
                        help="Skip Real-ESRGAN download entirely")
    parser.add_argument("--no-bonsai",   action="store_true",
                        help="Skip Bonsai download (only download upscaler)")
    parser.add_argument("--force", action="store_true", help="Re-download even if already exists")
    parser.add_argument("--hf-token",   default=os.environ.get("HF_TOKEN"),
                        help="HuggingFace token (or set HF_TOKEN env var)")
    args = parser.parse_args()

    models_dir   = Path(args.models_dir)
    platform_key = args.platform if args.platform != "auto" else detect_platform()
    variants     = ["binary", "ternary"] if args.variant == "both" else [args.variant]
    upscalers    = list(UPSCALER_MODELS.keys()) if args.upscaler == "all" else [args.upscaler]

    models_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'═'*54}")
    print(f"  Flux Image Model Setup")
    print(f"{'═'*54}")
    print(f"  Platform   : {platform_key}")
    print(f"  Models dir : {models_dir.resolve()}")
    print(f"  HF Token   : {'✓ set' if args.hf_token else '✗ not set (downloads may be slow)'}")
    print(f"{'═'*54}\n")

    # ── Bonsai ───────────────────────────────────────────────────────────
    if not args.no_bonsai:
        print("BONSAI IMAGE 4B")
        print("─" * 40)
        for variant in variants:
            local_dir = models_dir / BONSAI_LOCAL_DIRS[variant]
            key       = (variant, platform_key)
            repo_id   = BONSAI_REPOS[key]
            size      = BONSAI_SIZES.get(key, "?")

            print(f"\n  {variant.upper()} — {BONSAI_QUALITY[variant]}")
            print(f"  Size  : {size}")
            print(f"  Repo  : {repo_id}")

            if local_dir.exists() and (local_dir / "model_index.json").exists() and not args.force:
                print(f"  [skip] Already complete at {local_dir}  (--force to re-download)")
                continue
            if local_dir.exists() and args.force:
                import shutil
                shutil.rmtree(local_dir)
                print(f"  [force] Removed {local_dir}")
            print()
            download_hf_model(repo_id, local_dir, token=args.hf_token)

    # ── Real-ESRGAN ──────────────────────────────────────────────────────
    if not args.no_upscaler:
        print("\nREAL-ESRGAN UPSCALER WEIGHTS")
        print("─" * 40)
        weights_dir = models_dir / "realesrgan"
        weights_dir.mkdir(parents=True, exist_ok=True)

        for name in upscalers:
            cfg  = UPSCALER_MODELS[name]
            dest = weights_dir / cfg["filename"]

            print(f"\n  {name} — {cfg['label']}")
            print(f"  Size : {cfg['size']}")

            if dest.exists() and not args.force:
                print(f"  [skip] Already exists at {dest}  (--force to re-download)")
                continue
            download_weights(cfg["url"], dest)

    # ── Summary ──────────────────────────────────────────────────────────
    print(f"\n{'═'*54}")
    print("  Setup complete!\n")
    print("  Add to your .env:")
    print(f"    BONSAI_MODELS_DIR={models_dir.resolve()}")
    print(f"    BONSAI_VARIANT={variants[-1]}")
    print(f"    BONSAI_PLATFORM={platform_key}")
    print(f"    UPSCALER_MODEL={upscalers[0]}")
    print(f"    IMAGE_SERVICE_URL=http://127.0.0.1:8001\n")
    print("  Start the service:")
    print("    python image_service.py\n")
    print("  Required pip packages (if not installed):")
    print("    pip install torch diffusers transformers accelerate")
    print("    pip install realesrgan basicsr facexlib gfpgan")
    print("    pip install fastapi uvicorn huggingface_hub")
    print()
    print("  ── backend_gpu  (REQUIRED for gemlite/HQQ quantized models) ──")
    print("  The default ternary/binary gemlite packs need the backend_gpu")
    print("  package from the Bonsai Image Demo repo.  Without it the")
    print("  service will fail to load the model.")
    print()
    print("  Windows (PowerShell):")
    print("    cd backend/Bonsai-Image-Demo")
    print("    Set-ExecutionPolicy -Scope CurrentUser RemoteSigned  # one-time")
    print("    .\\setup.ps1")
    print("    # Then install backend_gpu into THIS venv:")
    print("    pip install -e .\\vendor\\image-studio\\backend_gpu")
    print()
    print("  Linux / macOS:")
    print("    git clone https://github.com/PrismML-Eng/Bonsai-Image-Demo.git")
    print("    cd Bonsai-Image-Demo && ./setup.sh")
    print("    pip install -e ./vendor/backend_gpu")
    print()
    print("  Alternative: use the unpacked FP16 model (no backend_gpu needed,")
    print("  but much larger and slower):")
    print(f"    python setup_image_models.py --variant {variants[-1]} \\")
    print( "      # switch repo to prism-ml/bonsai-image-ternary-4B-unpacked")
    print(f"{'═'*54}\n")


if __name__ == "__main__":
    main()