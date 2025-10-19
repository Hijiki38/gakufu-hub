# import json, traceback

# def handler(event, context):
#     try:
#         return {
#             "statusCode": 200,
#             "headers": {
#                 "content-type": "application/json",
#                 "access-control-allow-origin": "*",
#             },
#             "body": json.dumps({"ok": True, "requestId": getattr(context, "aws_request_id", None)}),
#         }
#     except Exception as e:
#         print("ERROR:", repr(e))
#         print(traceback.format_exc())
#         return {
#             "statusCode": 500,
#             "headers": {"content-type": "application/json", "access-control-allow-origin": "*"},
#             "body": json.dumps({"ok": False, "error": str(e)}),
#         }
# #

import base64
import json
import os
from datetime import datetime, timezone
from io import BytesIO
from typing import Any, Dict, List, Optional, Tuple

import boto3
from botocore.exceptions import BotoCoreError, ClientError
import fitz  # PyMuPDF
from PIL import Image, ImageChops


BUCKET_NAME = os.getenv("BUCKET_NAME")
S3_CLIENT = boto3.client("s3")


def _parse_event(raw_event: Any) -> Dict[str, Any]:
    """Normalize the raw Lambda payload to a plain dict."""
    if isinstance(raw_event, (bytes, bytearray)):
        raw_event = raw_event.decode("utf-8")

    if isinstance(raw_event, str):
        raw_event = json.loads(raw_event)

    if not isinstance(raw_event, dict):
        raise ValueError("Event payload must be a JSON object")

    return raw_event.get("input", {})


def _isoformat(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def _fetch_object(key: str) -> Tuple[Dict[str, Any], bytes]:
    response = S3_CLIENT.get_object(Bucket=BUCKET_NAME, Key=key)
    body_bytes = response["Body"].read()

    metadata = {
        "key": key,
        "contentType": response.get("ContentType"),
        "ETag": response.get("ETag"),
        "lastModified": _isoformat(response.get("LastModified")),
        "size": response.get("ContentLength", len(body_bytes)),
        "base64": base64.b64encode(body_bytes).decode("utf-8"),
    }

    return metadata, body_bytes


def _list_repo_objects(repo: str, suffix: str = ".pdf") -> list[Dict[str, Any]]:
    prefix = repo if repo.startswith("data/") else f"data/{repo}/"
    paginator = S3_CLIENT.get_paginator("list_objects_v2")

    items: list[Dict[str, Any]] = []
    for page in paginator.paginate(Bucket=BUCKET_NAME, Prefix=prefix):
        for obj in page.get("Contents", []):
            key = obj.get("Key")
            if not key:
                continue
            # Skip previously generated diff artefacts
            if "/diff/" in key:
                continue
            if not suffix or key.endswith(suffix):
                items.append(obj)

    items.sort(key=lambda x: x.get("LastModified"), reverse=True)
    return items


def _resolve_previous_key(repo: str, current_key: str) -> Optional[str]:
    for obj in _list_repo_objects(repo):
        key = obj.get("Key")
        if key and key != current_key:
            return key
    return None


def _render_pdf_pages(pdf_bytes: bytes) -> List[Image.Image]:
    """Render each PDF page to a PIL image."""
    images: List[Image.Image] = []
    with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
        for page in doc:
            pix = page.get_pixmap()
            mode = "RGBA" if pix.alpha else "RGB"
            img = Image.frombytes(mode, (pix.width, pix.height), pix.samples)
            images.append(img.convert("RGB"))
    return images


def _compute_diff_overlays(base_pages: List[Image.Image], new_pages: List[Image.Image]) -> List[Image.Image]:
    overlays: List[Image.Image] = []
    for base_page, new_page in zip(base_pages, new_pages):
        base_rgb = base_page.convert("RGB")
        new_rgb = new_page.convert("RGB")

        if base_rgb.size != new_rgb.size:
            new_rgb = new_rgb.resize(base_rgb.size)

        base_gray = base_rgb.convert("L")
        new_gray = new_rgb.convert("L")
        diff = ImageChops.difference(base_gray, new_gray)
        mask = diff.point(lambda x: 255 if x > 20 else 0)

        r_channel, g_channel, b_channel = base_rgb.split()
        new_r = r_channel.point(lambda x: 255)  # Highlight differences in red
        new_g = g_channel.point(lambda x: 0)
        new_b = b_channel.point(lambda x: 0)
        new_r.paste(r_channel, mask=ImageChops.invert(mask))
        new_g.paste(g_channel, mask=ImageChops.invert(mask))
        new_b.paste(b_channel, mask=ImageChops.invert(mask))

        overlay = Image.merge("RGB", (new_r, new_g, new_b))
        overlays.append(overlay)

    return overlays


def _diffs_to_pdf_bytes(diffs: List[Image.Image]) -> bytes:
    if not diffs:
        raise ValueError("No diff images available")

    buffer = BytesIO()
    first, *rest = diffs
    first.save(buffer, format="PDF", save_all=bool(rest), append_images=rest)
    return buffer.getvalue()


def handler(event, context):
    try:
        if not BUCKET_NAME:
            raise RuntimeError("BUCKET_NAME environment variable is not set")

        payload = _parse_event(event)
        repo = payload.get("repo")
        current_key = payload.get("key")

        if not repo:
            raise ValueError("'repo' is required")
        if not current_key:
            raise ValueError("'key' is required")

        new_key = current_key if current_key.startswith("data/") else f"data/{repo}/{current_key}"
        new_score_meta, new_bytes = _fetch_object(new_key)

        previous_key = _resolve_previous_key(repo, new_key)
        if not previous_key:
            raise ValueError("No previous score available for comparison")

        previous_score_meta, previous_bytes = _fetch_object(previous_key)

        new_pages = _render_pdf_pages(new_bytes)
        old_pages = _render_pdf_pages(previous_bytes)

        if len(new_pages) != len(old_pages):
            raise ValueError("Page count mismatch between scores")

        overlays = _compute_diff_overlays(old_pages, new_pages)
        diff_pdf_bytes = _diffs_to_pdf_bytes(overlays)

        base_dir, filename = os.path.split(new_key)
        name, _ext = os.path.splitext(filename)
        diff_filename = f"{name}_diff.pdf"
        diff_dir = f"{base_dir}/diff" if base_dir else "diff"
        diff_key = f"{diff_dir}/{diff_filename}"

        S3_CLIENT.put_object(
            Bucket=BUCKET_NAME,
            Key=diff_key,
            Body=diff_pdf_bytes,
            ContentType="application/pdf",
        )

        return {
            "ok": True,
            "repo": repo,
            "newScore": new_score_meta,
            "previousScore": previous_score_meta,
            "diff": {
                "key": diff_key,
                "size": len(diff_pdf_bytes),
                "pageCount": len(overlays),
            },
        }

    except (ClientError, BotoCoreError) as aws_error:
        message = getattr(aws_error, "response", {}).get("Error", {}).get("Message", str(aws_error))
        key = getattr(aws_error, "response", {}).get("Error", {}).get("Key")
        return {"ok": False, "error": message, "key": key}
    except Exception as exc:  # noqa: BLE001 - surface unexpected errors to the caller
        key = getattr(exc, "key", None)
        return {"ok": False, "error": str(exc), "key": key}
