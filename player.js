// player.js
import './ort-setup.js';
import { pipeline } from '@huggingface/transformers';

const DEFAULT_MODEL_ID = 'onnx-community/MeloTTS-English';
const DEFAULT_SPEAKER = 'EN-Default';

function floatTo16BitPCM(float32Array) {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32Array.length; i++) {
        let s = Math.max(-1, Math.min(1, float32Array[i]));
        view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Uint8Array(buffer);
}

function buildWavFile(samples, sampleRate) {
    const data = floatTo16BitPCM(samples);
    const buffer = new ArrayBuffer(44 + data.length);
    const view = new DataView(buffer);
    // RIFF identifier
    view.setUint32(0, 0x52494646, false);
    // file length minus first 8 bytes
    view.setUint32(4, 36 + data.length, true);
    // RIFF type 'WAVE'
    view.setUint32(8, 0x57415645, false);
    // format chunk identifier 'fmt '
    view.setUint32(12, 0x666d7420, false);
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format (raw)
    view.setUint16(20, 1, true);
    // channel count
    view.setUint16(22, 1, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate (sample rate * block align)
    view.setUint32(28, sampleRate * 2, true);
    // block align (channel count * bytes per sample)
    view.setUint16(32, 2, true);
    // bits per sample
    view.setUint16(34, 16, true);
    // data chunk identifier 'data'
    view.setUint32(36, 0x64617461, false);
    // data chunk length
    view.setUint32(40, data.length, true);
    new Uint8Array(buffer, 44).set(data);
    return new Uint8Array(buffer);
}

let audioElement = null;
let audioBlobUrl = null;

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

async function generateSpeech(text, modelId, speaker, dtype, device) {
    const tts = await pipeline('text-to-speech', modelId, { dtype, device });
    const result = await tts(text, { speaker_id: speaker });
    const samples = result.audio instanceof Float32Array ? result.audio : new Float32Array(result.audio.data ?? result.audio);
    return buildWavFile(samples, result.sampling_rate ?? 24000);
}

document.addEventListener('DOMContentLoaded', async () => {
    const status = document.getElementById("status");
    // Load text and settings
    const { currentText, voice, modelId, dtype, device } = await chrome.storage.local.get(
        ["currentText", "voice", "modelId", "dtype", "device"]
    );
    if (!currentText) {
        status.textContent = "No text found.";
        return;
    }
    status.textContent = "Generating audio...";
    // Generate speech audio (WAV data)
    const wavBytes = await generateSpeech(
        currentText,
        modelId || DEFAULT_MODEL_ID,
        voice || DEFAULT_SPEAKER,
        dtype || "q8",
        device || "wasm"
    );
    const wavBlob = new Blob([wavBytes], { type: 'audio/wav' });
    audioBlobUrl = URL.createObjectURL(wavBlob);
    audioElement = new Audio(audioBlobUrl);
    status.textContent = "Ready.";
});

// Play/Pause handlers
document.getElementById("play").onclick = () => {
    if (audioElement) audioElement.play();
};
document.getElementById("pause").onclick = () => {
    if (audioElement) audioElement.pause();
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
