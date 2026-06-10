#!/usr/bin/env python3
"""
Fixed Bonsai Image Service for Flux.
Compatible with the latest backend_gpu API (GpuPipeline).
"""

import asyncio
import base64
import io
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Optional, List
from contextlib import asynccontextmanager

import torch
import uvicorn

# ── Torch Monkeypatches ───────────────────────────────────────────────────────
# 1. basicsr expects torchvision.transforms.functional_tensor
try:
    import torchvision.transforms.functional as F
    sys.modules["torchvision.transforms.functional_tensor"] = F
except ImportError:
    pass

# 2. gemlite expects torch.float8_e8m0fnu which might be missing in some torch versions
if not hasattr(torch, "float8_e8m0fnu"):
    # Create a dummy attribute to prevent import errors in gemlite
    torch.float8_e8m0fnu = torch.uint8 

# 3. triton/torch compat: AttrsDescriptor moved/renamed in some triton-windows versions
try:
    import triton
    import triton.compiler.compiler as tc
    if not hasattr(tc, "AttrsDescriptor"):
        class DummyAttrs:
            def __init__(self, *args, **kwargs): pass
            @classmethod
            def from_dict(cls, *args, **kwargs): return cls()
        tc.AttrsDescriptor = DummyAttrs
    
    # Also patch triton.backends.compiler if it exists
    try:
        import triton.backends.compiler as tbc
        if not hasattr(tbc, "AttrsDescriptor"):
            tbc.AttrsDescriptor = tc.AttrsDescriptor
    except ImportError:
        pass
except (ImportError, AttributeError):
    pass
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ── Configuration ─────────────────────────────────────────────────────────────
# Default to looking in the Bonsai-Image-Demo/models folder
BASE_DIR = Path(__file__).resolve().parent.parent
DEMO_DIR = BASE_DIR / "Bonsai-Image-Demo"
MODELS_DIR = Path(os.environ.get("BONSAI_MODELS_DIR", str(DEMO_DIR / "models")))

VARIANT = os.environ.get("BONSAI_VARIANT", "ternary").lower()
PORT = int(os.environ.get("IMAGE_SERVICE_PORT", "8001"))
CORS_ORIGINS = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173",
).split(",")

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
log = logging.getLogger("BonsaiService")

# ── Global State ──────────────────────────────────────────────────────────────
pipeline = None
upscaler = None
active_variant = None
load_error = None

# One request at a time
_generate_lock = asyncio.Semaphore(1)

# ── backend_gpu Imports ───────────────────────────────────────────────────────
try:
    from backend_gpu.pipeline_gpu import GpuPipeline, DEFAULT_DEVICE
    from gemlite.core import GemLiteLinearTriton
    BACKEND_GPU_AVAILABLE = True
except Exception as e:
    BACKEND_GPU_AVAILABLE = False
    log.error(f"backend_gpu load failed: {e}")
    import traceback
    traceback.print_exc()
    log.error("Please run setup.ps1 in Bonsai-Image-Demo.")

# ── Low-Memory Transformer Loader ─────────────────────────────────────────────
def _low_mem_load_gemlite_transformer(path, device=None):
    from accelerate import init_empty_weights
    from diffusers import Flux2Transformer2DModel
    from gemlite.core import DType, GemLiteLinearTriton, set_packing_bitwidth
    
    if device is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"

    path = Path(path)
    state_path = path / "state_dict.pt"
    config_path = path / "config.json"
    qcfg_path = path / "quantization_config.json"
    autotune_path = path / "gemlite_autotune.json"

    with config_path.open() as fh: cfg = json.load(fh)
    with qcfg_path.open() as fh: qcfg = json.load(fh)
    
    bits = int(qcfg.get("bits", 1))
    group_size = int(qcfg.get("group_size", 128))
    packing_bw = int(qcfg.get("packing_bitwidth", 8))

    set_packing_bitwidth(packing_bw)
    if autotune_path.exists():
        GemLiteLinearTriton.load_config(str(autotune_path))

    log.info(f"Loading gemlite transformer (LOW-MEM): bits={bits} gs={group_size}")

    with init_empty_weights():
        model = Flux2Transformer2DModel.from_config(cfg)

    state = torch.load(str(state_path), map_location="cpu")
    for k in list(state.keys()):
        v = state[k]
        if torch.is_tensor(v) and v.is_floating_point() and v.dtype != torch.float16:
            state[k] = v.to(torch.float16)

    # Monkeypatch the pipeline_gpu internal loader if we can't import it directly
    from backend_gpu import pipeline_gpu as _pipeline_gpu
    _, remainder = _pipeline_gpu._load_gemlite_layers_from_state(
        model, state, bits=bits, group_size=group_size, device=device,
        DType=DType, GemLiteLinearTriton=GemLiteLinearTriton
    )
    
    model.load_state_dict(remainder, strict=False, assign=True)
    _pipeline_gpu._null_gemlite_weights(model, GemLiteLinearTriton)
    return model.to(device).eval()

# ── Pipeline Setup ────────────────────────────────────────────────────────────
def load_bonsai(variant: str = VARIANT):
    global pipeline, active_variant, load_error
    
    if not BACKEND_GPU_AVAILABLE:
        load_error = "backend_gpu library missing"
        return

    # Map variant to actual directory name
    variant_map = {
        "ternary": "bonsai-image-4B-ternary-gemlite",
        "binary": "bonsai-image-4B-binary-gemlite"
    }
    subdir = variant_map.get(variant, variant_map["ternary"])
    model_root = MODELS_DIR / subdir
    
    if not model_root.exists():
        load_error = f"Model directory not found: {model_root}"
        log.error(load_error)
        return

    log.info(f"Initializing GpuPipeline for {variant} from {model_root}")
    
    # Patch the loader to use low-mem variant
    import backend_gpu.pipeline_gpu as _pipeline_gpu
    _pipeline_gpu._load_gemlite_transformer = _low_mem_load_gemlite_transformer

    try:
        backend_id = f"bonsai-{variant}-gemlite"
        
        def _find_dir(root, hint):
            if not root.exists(): return None
            matches = [p for p in root.iterdir() if p.is_dir() and hint in p.name]
            return str(matches[0]) if matches else None

        # GpuPipeline requires paths for both even if using one
        ternary_root = MODELS_DIR / "bonsai-image-4B-ternary-gemlite"
        binary_root = MODELS_DIR / "bonsai-image-4B-binary-gemlite"

        pipeline = GpuPipeline(
            backend=backend_id,
            ternary_transformer_path=_find_dir(ternary_root, "transformer") or "dummy",
            binary_transformer_path=_find_dir(binary_root, "transformer") or "dummy",
            text_encoder_path=_find_dir(model_root, "text_encoder"),
            vae_path=_find_dir(model_root, "vae"),
            tokenizer_path=_find_dir(model_root, "text_encoder") + "/tokenizer" if _find_dir(model_root, "text_encoder") else "dummy",
        )
        pipeline.prewarm()
        active_variant = variant
        load_error = None
        log.info("Bonsai model loaded successfully")
    except Exception as e:
        load_error = f"Pipeline init failed: {str(e)}"
        log.error(load_error)
        import traceback
        traceback.print_exc()

# ── Upscaler Setup ────────────────────────────────────────────────────────────
def load_upscaler():
    global upscaler
    # Basic ESRGAN loader
    weights_path = MODELS_DIR / "realesrgan" / "RealESRGAN_x2plus.pth"
    if not weights_path.exists():
        log.warning("Upscaler weights missing, skipping upscaler load.")
        return
    
    try:
        from basicsr.archs.rrdbnet_arch import RRDBNet
        from realesrgan import RealESRGANer
        
        model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=2)
        upscaler = RealESRGANer(
            scale=2, model_path=str(weights_path), model=model, 
            tile=512, device=torch.device("cuda" if torch.cuda.is_available() else "cpu")
        )
        log.info("Real-ESRGAN x2plus loaded")
    except Exception as e:
        log.warning(f"Could not load upscaler: {e}")

# ── FastAPI App ───────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Run heavy initialization in a thread
    await asyncio.to_thread(load_bonsai)
    await asyncio.to_thread(load_upscaler)
    yield

app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class GenerateRequest(BaseModel):
    prompt: str
    width: int = 512
    height: int = 512
    steps: int = 4
    seed: Optional[int] = None
    upscale: bool = True

@app.get("/health")
def health():
    return {
        "status": "ok" if pipeline else "loading",
        "variant": active_variant,
        "load_error": load_error,
        "backend_gpu": BACKEND_GPU_AVAILABLE
    }

@app.post("/generate")
async def generate(req: GenerateRequest):
    if not pipeline:
        raise HTTPException(status_code=503, detail=load_error or "Model loading")

    async with _generate_lock:
        t0 = time.time()
        try:
            # Run diffusion
            png_bytes = await asyncio.to_thread(
                pipeline.generate_png,
                prompt=req.prompt,
                seed=req.seed if req.seed is not None else 0,
                steps=req.steps,
                width=req.width,
                height=req.height
            )
            
            # Optional upscale
            if req.upscale and upscaler:
                import numpy as np
                from PIL import Image
                img = Image.open(io.BytesIO(png_bytes)).convert("RGB")
                img_np = np.array(img)
                enhanced, _ = await asyncio.to_thread(upscaler.enhance, img_np, outscale=2)
                enhanced_img = Image.fromarray(enhanced)
                buf = io.BytesIO()
                enhanced_img.save(buf, format="PNG")
                png_bytes = buf.getvalue()

            # ── Create lightweight thumbnail ──
            from PIL import Image
            full_img = Image.open(io.BytesIO(png_bytes))
            # Resize to max 256px while maintaining aspect ratio — much faster for grid views
            full_img.thumbnail((256, 256), Image.Resampling.LANCZOS)
            thumb_buf = io.BytesIO()
            # Save as highly compressed JPEG for tiny footprint (~5-10KB)
            full_img.convert("RGB").save(thumb_buf, format="JPEG", quality=60, optimize=True)
            thumb_b64 = base64.b64encode(thumb_buf.getvalue()).decode("utf-8")

            b64 = base64.b64encode(png_bytes).decode("utf-8")
            return {
                "image_base64": b64,
                "thumbnail_base64": thumb_b64,
                "width": req.width * (2 if req.upscale and upscaler else 1),
                "height": req.height * (2 if req.upscale and upscaler else 1),
                "elapsed_ms": int((time.time() - t0) * 1000)
            }
        except Exception as e:
            log.error(f"Generation failed: {e}")
            raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=PORT)
