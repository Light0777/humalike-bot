"""
Lightweight STT HTTP server using faster-whisper (base model).

Accepts WAV audio via POST /transcribe and returns JSON with the transcription.
"""

import os
import io
import json
import tempfile
import wave
import logging
from flask import Flask, request, jsonify

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("stt-service")

app = Flask(__name__)

MODEL_SIZE = os.environ.get("WHISPER_MODEL", "base")

model = None


def load_model():
    global model
    if model is not None:
        return
    logger.info("Loading faster-whisper %s model...", MODEL_SIZE)
    from faster_whisper import WhisperModel

    model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")
    logger.info("Model loaded")


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model": MODEL_SIZE})


@app.route("/transcribe", methods=["POST"])
def transcribe():
    load_model()

    if "audio" not in request.files:
        return jsonify({"error": "No audio file provided"}), 400

    audio_file = request.files["audio"]
    audio_data = audio_file.read()

    if len(audio_data) < 44:
        return jsonify({"error": "Audio too small"}), 400

    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(audio_data)
            tmp_path = tmp.name

        segments, info = model.transcribe(
            tmp_path,
            beam_size=5,
            language="en",
            vad_filter=True,
            vad_parameters=dict(
                min_silence_duration_ms=500,
                threshold=0.5,
            ),
        )

        text = " ".join(seg.text for seg in segments)
        duration = info.duration

        os.unlink(tmp_path)

        logger.info("Transcribed %s: %s", audio_file.filename, text[:80])

        return jsonify({
            "text": text.strip(),
            "duration": duration,
            "language": info.language,
        })

    except Exception as e:
        logger.error("Transcription failed: %s", e)
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    load_model()
    port = int(os.environ.get("PORT", 8765))
    logger.info("Starting STT service on port %d", port)
    app.run(host="0.0.0.0", port=port)
