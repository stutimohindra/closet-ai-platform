import argparse
import json
import random
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--width", type=int, required=True)
    parser.add_argument("--height", type=int, required=True)
    parser.add_argument("--steps", type=int, default=28)
    parser.add_argument("--guidance-scale", type=float, default=7.5)
    parser.add_argument("--strength", type=float, default=0.75)
    parser.add_argument("--device", default="auto")
    return parser.parse_args()


def resolve_device(preferred: str) -> str:
    import torch

    if preferred != "auto":
        return preferred

    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def main() -> int:
    args = parse_args()

    try:
        import torch
        from diffusers import AutoPipelineForImage2Image
        from PIL import Image
    except Exception as exc:
        print(
            json.dumps(
                {
                    "error": (
                        "Missing Python dependencies for Diffusers generation. "
                        "Install torch, diffusers, transformers, accelerate, safetensors, and pillow."
                    ),
                    "details": str(exc),
                }
            ),
            file=sys.stderr,
        )
        return 1

    device = resolve_device(args.device)
    dtype = torch.float16 if device == "cuda" else torch.float32
    seed = random.randint(1, 2**31 - 1)
    generator = torch.Generator(
        device=device if device != "mps" else "cpu"
    ).manual_seed(seed)

    input_image = Image.open(args.input).convert("RGB")
    input_image = input_image.resize((args.width, args.height))

    try:
        pipe = AutoPipelineForImage2Image.from_pretrained(
            args.model,
            torch_dtype=dtype,
        )
        pipe = pipe.to(device)
        pipe.set_progress_bar_config(disable=True)

        if hasattr(pipe, "safety_checker"):
            pipe.safety_checker = None

        if hasattr(pipe, "enable_attention_slicing"):
            pipe.enable_attention_slicing()
        if hasattr(pipe, "vae") and hasattr(pipe.vae, "enable_slicing"):
            pipe.vae.enable_slicing()

        result = pipe(
            prompt=args.prompt,
            image=input_image,
            num_inference_steps=args.steps,
            guidance_scale=args.guidance_scale,
            strength=args.strength,
            generator=generator,
        )
    except Exception as exc:
        print(
            json.dumps(
                {
                    "error": "Diffusers image generation failed.",
                    "details": str(exc),
                }
            ),
            file=sys.stderr,
        )
        return 1

    output_image = result.images[0]

    extrema = output_image.convert("RGB").getextrema()
    flat_extrema = [channel for pair in extrema for channel in pair]
    dynamic_range = max(flat_extrema) - min(flat_extrema)

    if dynamic_range < 8:
        print(
            json.dumps(
                {
                    "error": "Diffusers generated a near-blank image.",
                    "details": "The output image had almost no visible variation. This usually means the current local device/dtype combination is unstable.",
                    "device": device,
                }
            ),
            file=sys.stderr,
        )
        return 1

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_image.save(output_path)
    print(json.dumps({"output_path": str(output_path), "seed": seed}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
