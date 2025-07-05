// settings.js
import './ort-setup.js';

import { KokoroTTS } from 'kokoro-js';


// Load saved settings and initialize UI
async function initSettings() {
    const result = await chrome.storage.local.get(["device", "dtype", "voice"]);
    const device = result.device || "wasm";
    const dtype = result.dtype || "q8";
    document.getElementById("device-select").value = device;
    document.getElementById("dtype-select").value = dtype;

    // Load a model instance (to get voices). We reuse dtype & device just for listing voices.
    const model_id = "onnx-community/Kokoro-82M-v1.0-ONNX";
    const tts = await KokoroTTS.from_pretrained(model_id, { dtype, device });
    const voices = tts.voices; 

    // Populate voice dropdown
    const select = document.getElementById("voice-select");
    select.innerHTML = "";  // clear loading message
    console.log("voices: ", voices);
    console.log( Object.entries(voices));
    for (const [id, meta] of Object.entries(voices)) {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = meta.name ?? id;
        if (id === result.voice) opt.selected = true;
        select.appendChild(opt);
    }
}

// Save a setting when changed
function addSettingListener(id, key) {
    const el = document.getElementById(id);
    el.addEventListener('change', () => {
        const obj = {};
        obj[key] = el.value;
        chrome.storage.local.set(obj);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await initSettings();
    addSettingListener("device-select", "device");
    addSettingListener("dtype-select", "dtype");
    addSettingListener("voice-select", "voice");
});
