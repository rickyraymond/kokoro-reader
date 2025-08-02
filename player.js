// player.js
import './ort-setup.js';   
import { KokoroTTS } from 'kokoro-js';

let audioElement = null;
let audioBlobUrl = null;
let sourceTabId = null;

// streaming state
let chunks = [];
let playedOffset = 0;
let currentChunkIndex = 0;
let audioCtx = null;
let ttsInstance = null;

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

function splitIntoChunks(text) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks = [];
    let buffer = [];
    for (const s of sentences) {
        buffer.push(s.trim());
        if (buffer.length >= 3) {
            chunks.push(buffer.join(' '));
            buffer = [];
        }
    }
    if (buffer.length) chunks.push(buffer.join(' '));
    return chunks;
}

async function generateChunk(index, voice) {
    const c = chunks[index];
    const audio = await ttsInstance.generate(c.text, { voice });
    const wavBytes = audio.toWav();
    c.wavBytes = wavBytes;
    const buffer = await audioCtx.decodeAudioData(wavBytes.slice(0));
    c.duration = buffer.duration;
    c.url = URL.createObjectURL(new Blob([wavBytes], { type: 'audio/wav' }));
    c.generated = true;
}

function concatWavs(wavs) {
    if (!wavs.length) return new ArrayBuffer();
    const header = new Uint8Array(wavs[0].slice(0, 44));
    const dataParts = wavs.map(w => new Uint8Array(w.slice(44)));
    const totalData = dataParts.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(44 + totalData);
    result.set(header, 0);
    let offset = 44;
    for (const part of dataParts) {
        result.set(part, offset);
        offset += part.length;
    }
    const view = new DataView(result.buffer);
    view.setUint32(4, 36 + totalData, true);
    view.setUint32(40, totalData, true);
    return result.buffer;
}

function playChunk(index, offset) {
    currentChunkIndex = index;
    audioElement.src = chunks[index].url;
    audioElement.currentTime = offset;
    audioElement.play();
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

    audioElement = new Audio();
    audioElement.volume = volume.value;
    audioElement.playbackRate = speed.value;

    audioElement.addEventListener('timeupdate', () => {
        const current = playedOffset + audioElement.currentTime;
        progress.value = current;
        timeDisplay.textContent = `${formatTime(current)}/${formatTime(progress.max)}`;
    });

    audioElement.addEventListener('ended', () => {
        playedOffset += chunks[currentChunkIndex].duration;
        if (currentChunkIndex + 1 < chunks.length) {
            playChunk(currentChunkIndex + 1, 0);
        }
    });

    progress.addEventListener('input', async () => {
        const target = parseFloat(progress.value);
        let sum = 0, idx = 0;
        while (idx < chunks.length && sum + chunks[idx].duration <= target) {
            sum += chunks[idx].duration;
            idx++;
        }
        if (idx >= chunks.length || !chunks[idx].generated) return;
        playedOffset = sum;
        playChunk(idx, target - sum);
    });
    volume.addEventListener('input', () => {
        if (audioElement) audioElement.volume = volume.value;
    });
    speed.addEventListener('input', () => {
        if (audioElement) audioElement.playbackRate = speed.value;
    });

    if (!currentText) {
        status.textContent = "No text found.";
        return;
    }

    if (cachedAudio && cachedText === currentText) {
        status.textContent = "Loading cached audio...";
        const wavBytes = base64ToArrayBuffer(cachedAudio);
        const wavBlob = new Blob([wavBytes], { type: 'audio/wav' });
        audioBlobUrl = URL.createObjectURL(wavBlob);
        audioElement.src = audioBlobUrl;
        audioElement.addEventListener('loadedmetadata', () => {
            progress.max = audioElement.duration;
            timeDisplay.textContent = `0:00/${formatTime(audioElement.duration)}`;
            status.textContent = "Ready.";
        }, { once: true });
        return;
    }

    status.textContent = "Generating audio...";
    try {
        audioCtx = new AudioContext();
        ttsInstance = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: dtype || "q8", device: device || "wasm" });
        const texts = splitIntoChunks(currentText);
        chunks = texts.map(t => ({ text: t, url: null, duration: 0, wavBytes: null, generated: false }));

        await generateChunk(0, voice || "af_heart");
        progress.max = chunks[0].duration;
        timeDisplay.textContent = `0:00/${formatTime(progress.max)}`;
        playChunk(0, 0);

        for (let i = 1; i < chunks.length; i++) {
            await generateChunk(i, voice || "af_heart");
            progress.max += chunks[i].duration;
            timeDisplay.textContent = `${formatTime(playedOffset + audioElement.currentTime)}/${formatTime(progress.max)}`;
        }

        const merged = concatWavs(chunks.map(c => c.wavBytes));
        audioBlobUrl = URL.createObjectURL(new Blob([merged], { type: 'audio/wav' }));
        chrome.storage.local.set({
            cachedAudio: arrayBufferToBase64(merged),
            cachedText: currentText,
        });
        status.textContent = "Ready.";
    } catch (err) {
        console.error(err);
        status.textContent = "Error generating audio.";
    }
});

// Play/Pause handlers
document.getElementById("play").onclick = () => {
    if (audioElement) audioElement.play();
};
document.getElementById("pause").onclick = () => {
    if (audioElement) audioElement.pause();
};
document.getElementById("restart").onclick = () => {
    if (audioElement && chunks.length) {
        playedOffset = 0;
        playChunk(0, 0);
    }
};
document.getElementById("newspeech").onclick = async () => {
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
