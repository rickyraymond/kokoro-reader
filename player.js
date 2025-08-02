// player.js
import './ort-setup.js';
import { KokoroTTS } from 'kokoro-js';

let audioBlobUrl = null;
let audioElement = null;

// Pause if asked (background sends "pauseAll")
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "pauseAll" && audioElement) {
        audioElement.pause();
    }
});

async function generateSpeech(text, voice, dtype, device) {
    const model_id = "onnx-community/Kokoro-82M-v1.0-ONNX";
    const tts = await KokoroTTS.from_pretrained(model_id, { dtype, device });
    const audio = await tts.generate(text, { voice });
    // Get raw WAV bytes
    return audio.toWav();
}

async function getCache() {
    if (chrome.storage.session) {
        return chrome.storage.session.get(["lastAudio"]);
    }
    return chrome.storage.local.get(["lastAudio"]);
}

async function setCache(obj) {
    if (chrome.storage.session) {
        return chrome.storage.session.set({ lastAudio: obj });
    }
    return chrome.storage.local.set({ lastAudio: obj });
}

document.addEventListener('DOMContentLoaded', async () => {
    const status = document.getElementById("status");
    audioElement = document.getElementById("audio");
    const { currentText, voice, dtype, device } = await chrome.storage.local.get(
        ["currentText", "voice", "dtype", "device"]
    );
    if (!currentText) {
        status.textContent = "No text found.";
        return;
    }
    const v = voice || "af_heart";
    const d = dtype || "q8";
    const dev = device || "wasm";
    try {
        let wavBytes = null;
        const { lastAudio } = await getCache();
        if (lastAudio && lastAudio.text === currentText && lastAudio.voice === v && lastAudio.dtype === d && lastAudio.device === dev) {
            const bytes = Uint8Array.from(atob(lastAudio.audio), c => c.charCodeAt(0));
            wavBytes = bytes.buffer;
        } else {
            status.textContent = "Generating audio...";
            wavBytes = await generateSpeech(currentText, v, d, dev);
            const b64 = btoa(String.fromCharCode(...new Uint8Array(wavBytes)));
            await setCache({ text: currentText, voice: v, dtype: d, device: dev, audio: b64 });
        }
        const wavBlob = new Blob([wavBytes], { type: 'audio/wav' });
        audioBlobUrl = URL.createObjectURL(wavBlob);
        audioElement.src = audioBlobUrl;
        status.textContent = "Ready.";
    } catch (e) {
        console.error(e);
        status.textContent = "Error generating audio.";
    }

    document.getElementById("restart").onclick = () => {
        audioElement.currentTime = 0;
        audioElement.play();
    };
    const volume = document.getElementById("volume");
    volume.addEventListener('input', () => {
        audioElement.volume = parseFloat(volume.value);
    });
    const speed = document.getElementById("speed");
    speed.addEventListener('change', () => {
        audioElement.playbackRate = parseFloat(speed.value);
    });
    document.getElementById("save").onclick = () => {
        if (audioBlobUrl) {
            const a = document.createElement('a');
            a.href = audioBlobUrl;
            a.download = 'speech.wav';
            a.click();
        }
    };
});
