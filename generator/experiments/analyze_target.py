#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import urllib.request
from contextlib import ExitStack
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python import vision
from PIL import Image, ImageDraw

FACE_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
    "face_landmarker/float16/1/face_landmarker.task"
)
SEGMENTER_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/image_segmenter/"
    "selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite"
)

LEFT_EYE_INDICES = [33, 133, 159, 145]
RIGHT_EYE_INDICES = [362, 263, 386, 374]
MOUTH_INDICES = [13, 14, 78, 308]
NOSE_INDICES = [1, 4, 5]


def main() -> None:
    args = parse_args()
    source_path = args.target.resolve()
    output_path = args.out.resolve()
    cache_dir = args.cache_dir.resolve()
    cache_dir.mkdir(parents=True, exist_ok=True)

    face_model_path = ensure_model(
        cache_dir / "face_landmarker.task",
        FACE_MODEL_URL,
    )
    segmenter_model_path = ensure_model(
        cache_dir / "selfie_multiclass_256x256.tflite",
        SEGMENTER_MODEL_URL,
    )

    with Image.open(source_path) as pil_source:
        rgba = pil_source.convert("RGBA")
        image_width, image_height = rgba.size
        alpha_mask = np.asarray(rgba, dtype=np.uint8)[..., 3].astype(np.float32) / 255.0

    mp_image = mp.Image.create_from_file(str(source_path))

    with ExitStack() as stack:
        landmarker = stack.enter_context(
            vision.FaceLandmarker.create_from_options(
                vision.FaceLandmarkerOptions(
                    base_options=BaseOptions(model_asset_path=str(face_model_path)),
                    num_faces=1,
                    output_face_blendshapes=False,
                    output_facial_transformation_matrixes=False,
                )
            )
        )
        segmenter = stack.enter_context(
            vision.ImageSegmenter.create_from_options(
                vision.ImageSegmenterOptions(
                    base_options=BaseOptions(model_asset_path=str(segmenter_model_path)),
                    output_category_mask=True,
                    output_confidence_masks=False,
                )
            )
        )

        face_result = landmarker.detect(mp_image)
        segment_result = segmenter.segment(mp_image)

    category_mask = segment_result.category_mask.numpy_view().squeeze()
    subject_mask = np.maximum((category_mask != 0).astype(np.float32), alpha_mask)

    face_entries = build_face_entries(face_result)
    cells = build_grid_cells(
        args.cols,
        args.rows,
        image_width,
        image_height,
        subject_mask,
        face_entries[0] if face_entries else None,
    )

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceImage": str(source_path),
        "cols": args.cols,
        "rows": args.rows,
        "imageWidth": image_width,
        "imageHeight": image_height,
        "faceCount": len(face_entries),
        "faces": face_entries,
        "cells": cells,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    if args.debug_preview:
        debug_path = args.debug_preview.resolve()
        debug_path.parent.mkdir(parents=True, exist_ok=True)
        render_debug_preview(
            source_path,
            debug_path,
            face_entries,
            cells,
            args.cols,
            args.rows,
        )

    print(f"Wrote target analysis to {output_path}")
    print(f"Faces detected: {len(face_entries)}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Analyze a target portrait with MediaPipe and export per-cell "
            "subject/face weights for the mosaic generator."
        )
    )
    parser.add_argument("--target", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--cols", type=positive_int, required=True)
    parser.add_argument("--rows", type=positive_int, required=True)
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=Path(__file__).resolve().parent.parent / ".cache" / "models",
    )
    parser.add_argument("--debug-preview", type=Path)
    return parser.parse_args()


def positive_int(raw: str) -> int:
    value = int(raw)
    if value <= 0:
        raise argparse.ArgumentTypeError("value must be positive")
    return value


def ensure_model(path: Path, url: str) -> Path:
    if path.exists():
        return path

    path.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url) as response:
        path.write_bytes(response.read())
    return path


def build_face_entries(result: vision.FaceLandmarkerResult) -> list[dict[str, Any]]:
    faces: list[dict[str, Any]] = []

    for landmarks in result.face_landmarks:
        xs = [point.x for point in landmarks]
        ys = [point.y for point in landmarks]
        left_eye = average_point(landmarks, LEFT_EYE_INDICES)
        right_eye = average_point(landmarks, RIGHT_EYE_INDICES)
        nose_tip = average_point(landmarks, NOSE_INDICES)
        mouth_center = average_point(landmarks, MOUTH_INDICES)

        faces.append(
            {
                "bbox": {
                    "x": round(min(xs), 6),
                    "y": round(min(ys), 6),
                    "width": round(max(xs) - min(xs), 6),
                    "height": round(max(ys) - min(ys), 6),
                },
                "leftEye": point_to_json(left_eye),
                "rightEye": point_to_json(right_eye),
                "noseTip": point_to_json(nose_tip),
                "mouthCenter": point_to_json(mouth_center),
            }
        )

    return faces


def average_point(landmarks: Any, indices: list[int]) -> tuple[float, float]:
    valid = [landmarks[index] for index in indices if index < len(landmarks)]
    if not valid:
        return (0.5, 0.5)

    return (
        float(sum(point.x for point in valid) / len(valid)),
        float(sum(point.y for point in valid) / len(valid)),
    )


def point_to_json(point: tuple[float, float]) -> dict[str, float]:
    return {"x": round(point[0], 6), "y": round(point[1], 6)}


def build_grid_cells(
    cols: int,
    rows: int,
    image_width: int,
    image_height: int,
    subject_mask: np.ndarray,
    face: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    cells: list[dict[str, Any]] = []
    face_center = (0.5, 0.28)
    face_sigma = (0.18, 0.22)
    left_eye = (0.44, 0.24)
    right_eye = (0.56, 0.24)
    nose_tip = (0.5, 0.3)
    mouth_center = (0.5, 0.38)

    if face is not None:
        bbox = face["bbox"]
        face_center = (
            bbox["x"] + bbox["width"] * 0.5,
            bbox["y"] + bbox["height"] * 0.5,
        )
        face_sigma = (
            max(bbox["width"] * 0.52, 0.06),
            max(bbox["height"] * 0.62, 0.07),
        )
        left_eye = (face["leftEye"]["x"], face["leftEye"]["y"])
        right_eye = (face["rightEye"]["x"], face["rightEye"]["y"])
        nose_tip = (face["noseTip"]["x"], face["noseTip"]["y"])
        mouth_center = (face["mouthCenter"]["x"], face["mouthCenter"]["y"])

    feature_sigma = (
        max(face_sigma[0] * 0.18, 0.03),
        max(face_sigma[1] * 0.18, 0.035),
    )
    nose_sigma = (
        max(face_sigma[0] * 0.16, 0.028),
        max(face_sigma[1] * 0.18, 0.032),
    )
    mouth_sigma = (
        max(face_sigma[0] * 0.24, 0.035),
        max(face_sigma[1] * 0.16, 0.03),
    )

    for row in range(rows):
        y0 = math.floor(row * image_height / rows)
        y1 = max(y0 + 1, math.floor((row + 1) * image_height / rows))

        for col in range(cols):
            x0 = math.floor(col * image_width / cols)
            x1 = max(x0 + 1, math.floor((col + 1) * image_width / cols))
            patch = subject_mask[y0:y1, x0:x1]
            subject_coverage = float(np.mean(patch)) if patch.size else 0.0

            cx = (col + 0.5) / cols
            cy = (row + 0.5) / rows
            face_weight = gaussian(cx, cy, face_center[0], face_center[1], *face_sigma)
            eye_weight = max(
                gaussian(cx, cy, left_eye[0], left_eye[1], *feature_sigma),
                gaussian(cx, cy, right_eye[0], right_eye[1], *feature_sigma),
            )
            feature_weight = max(
                eye_weight,
                gaussian(cx, cy, nose_tip[0], nose_tip[1], *nose_sigma),
                gaussian(cx, cy, mouth_center[0], mouth_center[1], *mouth_sigma),
            )

            cells.append(
                {
                    "index": row * cols + col,
                    "subjectCoverage": round(subject_coverage, 4),
                    "faceWeight": round(face_weight, 4),
                    "eyeWeight": round(eye_weight, 4),
                    "featureWeight": round(feature_weight, 4),
                }
            )

    return cells


def gaussian(
    x: float,
    y: float,
    center_x: float,
    center_y: float,
    sigma_x: float,
    sigma_y: float,
) -> float:
    sigma_x = max(sigma_x, 1e-4)
    sigma_y = max(sigma_y, 1e-4)
    dx = (x - center_x) / sigma_x
    dy = (y - center_y) / sigma_y
    return float(math.exp(-0.5 * (dx * dx + dy * dy)))


def render_debug_preview(
    source_path: Path,
    output_path: Path,
    faces: list[dict[str, Any]],
    cells: list[dict[str, Any]],
    cols: int,
    rows: int,
) -> None:
    with Image.open(source_path) as source:
        image = source.convert("RGBA")

    draw = ImageDraw.Draw(image, "RGBA")

    if faces:
        bbox = faces[0]["bbox"]
        width, height = image.size
        rect = (
            bbox["x"] * width,
            bbox["y"] * height,
            (bbox["x"] + bbox["width"]) * width,
            (bbox["y"] + bbox["height"]) * height,
        )
        draw.rectangle(rect, outline=(255, 80, 80, 220), width=4)

    width, height = image.size
    for cell in cells:
        col = cell["index"] % cols
        row = cell["index"] // cols
        x0 = col * width / cols
        y0 = row * height / rows
        x1 = (col + 1) * width / cols
        y1 = (row + 1) * height / rows
        heat = max(
            cell["subjectCoverage"] * 0.45,
            cell["faceWeight"] * 0.3,
            cell["featureWeight"] * 0.25,
        )
        alpha = int(max(0.0, min(1.0, heat)) * 130)
        draw.rectangle((x0, y0, x1, y1), fill=(255, 64, 64, alpha))

    image.save(output_path)


if __name__ == "__main__":
    main()
