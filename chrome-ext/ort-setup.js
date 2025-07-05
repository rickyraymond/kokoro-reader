import { env as ortEnv } from 'onnxruntime-web';

ortEnv.wasm.wasmPaths = chrome.runtime.getURL('runtime/');

ortEnv.wasm.proxy = false;
ortEnv.wasm.numThreads = 1;