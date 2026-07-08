"""
Lightweight TTS HTTP server using edge-tts.

Accepts text via POST /synthesize and returns WAV audio.
"""

import os
import io
import json
import asyncio
import logging
import tempfile
import edge_tts
from flask import Flask, request, send_file, jsonify

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("tts-service")

app = Flask(__name__)

DEFAULT_VOICE = os.environ.get("TTS_VOICE", "en-US-JennyNeural")


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "voice": DEFAULT_VOICE})


@app.route("/synthesize", methods=["POST"])
def synthesize():
    try:
        data = request.get_json()

        if not data or "text" not in data:
            return jsonify({"error": "text field is required"}), 400

        text = data["text"].strip()
        if not text:
            return jsonify({"error": "text cannot be empty"}), 400

        voice = data.get("voice", DEFAULT_VOICE)
        rate = data.get("rate", "+0%")
        pitch = data.get("pitch", "+0Hz")

        async def _synth():
            communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
                tmp_path = tmp.name
            await communicate.save(tmp_path)
            return tmp_path

        audio_path = asyncio.run(_synth())

        logger.info("Synthesized: %s -> %s", text[:60], audio_path)

        return send_file(
            audio_path,
            mimetype="audio/mpeg",
            as_attachment=True,
            download_name="speech.mp3",
        )

    except Exception as e:
        logger.error("TTS failed: %s", e)
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8766))
    logger.info("Starting TTS service on port %d", port)
    app.run(host="0.0.0.0", port=port)
