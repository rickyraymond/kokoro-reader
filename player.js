// player.js
import './ort-setup.js';   
import { KokoroTTS } from 'kokoro-js';

let audioElement = null;
let audioBlobUrl = null;
let sourceTabId = null;

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

// ortEnv.wasm.wasmPaths = {
//     'ort-wasm.wasm': chrome.runtime.getURL('runtime/ort-wasm.wasm'),
//     'ort-wasm-simd.wasm': chrome.runtime.getURL('runtime/ort-wasm-simd.wasm'),
//     'ort-wasm-threaded.wasm': chrome.runtime.getURL('runtime/ort-wasm-threaded.wasm'),
//     'ort-wasm-simd-threaded.wasm': chrome.runtime.getURL('runtime/ort-wasm-simd-threaded.wasm')
// };
// ortEnv.wasm.proxy = false;      //  ← THIS disables the .jsep import
// ortEnv.wasm.numThreads = 1;     //  1 = “single-thread”
// ort.setWasmPaths(chrome.runtime.getURL('runtime/'));
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

function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

document.addEventListener('DOMContentLoaded', async () => {
    const status = document.getElementById("status");
    const progress = document.getElementById("progress");
    const volume = document.getElementById("volume");
    const speed = document.getElementById("speed");
    const timeDisplay = document.getElementById("time");

    const {
        currentText,
        voice,
        dtype,
        device,
        cachedAudio,
        cachedText,
        sourceTabId: storedTabId,
    } = await chrome.storage.local.get([
        "currentText",
        "voice",
        "dtype",
        "device",
        "cachedAudio",
        "cachedText",
        "sourceTabId",
    ]);

    sourceTabId = storedTabId;

    if (!currentText) {
        status.textContent = "No text found.";
        return;
    }

    let wavBytes;
    if (cachedAudio && cachedText === currentText) {
        status.textContent = "Loading cached audio...";
        wavBytes = base64ToArrayBuffer(cachedAudio);
    } else {
        status.textContent = "Generating audio...";
        try {
            wavBytes = await generateSpeech(
                currentText,
                voice || "af_heart",
                dtype || "q8",
                device || "wasm"
            );
            chrome.storage.local.set({
                cachedAudio: arrayBufferToBase64(wavBytes),
                cachedText: currentText,
            });
        } catch (err) {
            console.error(err);
            status.textContent = "Error generating audio.";
            return;
        }
    }

    const wavBlob = new Blob([wavBytes], { type: 'audio/wav' });
    audioBlobUrl = URL.createObjectURL(wavBlob);
    audioElement = new Audio(audioBlobUrl);
    audioElement.volume = volume.value;
    audioElement.playbackRate = speed.value;

    audioElement.addEventListener('loadedmetadata', () => {
        progress.max = audioElement.duration;
        timeDisplay.textContent = `0:00/${formatTime(audioElement.duration)}`;
        status.textContent = "Ready.";
    });
    audioElement.addEventListener('timeupdate', () => {
        progress.value = audioElement.currentTime;
        timeDisplay.textContent = `${formatTime(audioElement.currentTime)}/${formatTime(audioElement.duration)}`;
    });
    progress.addEventListener('input', () => {
        if (audioElement) {
            audioElement.currentTime = progress.value;
            timeDisplay.textContent = `${formatTime(audioElement.currentTime)}/${formatTime(audioElement.duration)}`;
        }
    });
    volume.addEventListener('input', () => {
        if (audioElement) audioElement.volume = volume.value;
    });
    speed.addEventListener('input', () => {
        if (audioElement) audioElement.playbackRate = speed.value;
    });
});

// Play/Pause handlers
document.getElementById("play").onclick = () => {
    if (audioElement) audioElement.play();
};
document.getElementById("pause").onclick = () => {
    if (audioElement) audioElement.pause();
};
document.getElementById("restart").onclick = () => {
    if (audioElement) {
        audioElement.currentTime = 0;
        audioElement.play();
    }
};
document.getElementById("reread").onclick = async () => {
    if (!sourceTabId) return;
    const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: sourceTabId },
        func: () => {
            const sel = window.getSelection().toString().trim();
            return sel || document.body.innerText || document.title;
        }
    });
    if (result) {
        await chrome.storage.local.set({ currentText: result, cachedAudio: null, cachedText: null });
        window.location.reload();
    }
};
// Save handler: triggers download of WAV
document.getElementById("save").onclick = () => {
    if (audioBlobUrl) {
        const a = document.createElement('a');
        a.href = audioBlobUrl;
        a.download = 'speech.wav';
        a.click();
    }
};
