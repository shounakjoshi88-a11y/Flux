import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import * as https from "https";

const TTS_DIR = path.join(__dirname, "tts");
const VOICE_NAME = "en_US-lessac-medium";
const MODEL_FILE = path.join(TTS_DIR, `${VOICE_NAME}.onnx`);
const CONFIG_FILE = path.join(TTS_DIR, `${VOICE_NAME}.onnx.json`);

const MODEL_URL = `https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/${VOICE_NAME}.onnx`;
const CONFIG_URL = `https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/${VOICE_NAME}.onnx.json`;

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(res.headers.location!, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`Download failed: ${res.statusCode}`));
      }
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(); });
    }).on("error", (err) => {
      file.close();
      try { fs.unlinkSync(dest); } catch {}
      reject(err);
    });
  });
}

export async function ensureModel(): Promise<void> {
  if (!fs.existsSync(TTS_DIR)) {
    fs.mkdirSync(TTS_DIR, { recursive: true });
  }
  if (!fs.existsSync(MODEL_FILE)) {
    console.log("[TTS] Downloading Piper voice model...");
    await downloadFile(MODEL_URL, MODEL_FILE);
  }
  if (!fs.existsSync(CONFIG_FILE)) {
    console.log("[TTS] Downloading Piper voice config...");
    await downloadFile(CONFIG_URL, CONFIG_FILE);
  }
}

export function findPiperBinary(): string | null {
  const candidates: string[] = [];
  if (process.platform === "win32") {
    candidates.push(path.join(TTS_DIR, "piper.exe"));
    candidates.push(path.join(__dirname, "piper.exe"));
  } else {
    candidates.push(path.join(TTS_DIR, "piper"));
    candidates.push(path.join(__dirname, "piper"));
    candidates.push("/usr/local/bin/piper");
    candidates.push("/usr/bin/piper");
  }
  const envPath = process.env.PATH?.split(path.delimiter) || [];
  for (const dir of envPath) {
    const bin = process.platform === "win32"
      ? path.join(dir, "piper.exe")
      : path.join(dir, "piper");
    candidates.push(bin);
  }
  return candidates.find((c) => fs.existsSync(c)) || null;
}

export async function synthesizeToWav(text: string, piperPath: string): Promise<Buffer> {
  await ensureModel();
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const proc = spawn(piperPath, [
      "--model", MODEL_FILE,
      "--config", CONFIG_FILE,
      "--output-raw",
    ], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));

    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on("error", (err) => reject(new Error(`Failed to spawn piper: ${err.message}. Download from https://github.com/rhasspy/piper/releases`)));

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`piper exited with code ${code}: ${stderr}`));
      }
      const rawPcm = Buffer.concat(chunks);
      const sampleRate = 22050;
      const numChannels = 1;
      const bitsPerSample = 16;
      const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
      const dataSize = rawPcm.length;
      const header = Buffer.alloc(44);
      header.write("RIFF", 0);
      header.writeUInt32LE(36 + dataSize, 4);
      header.write("WAVE", 8);
      header.write("fmt ", 12);
      header.writeUInt32LE(16, 16);
      header.writeUInt16LE(1, 20);
      header.writeUInt16LE(numChannels, 22);
      header.writeUInt32LE(sampleRate, 24);
      header.writeUInt32LE(byteRate, 28);
      header.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
      header.writeUInt16LE(bitsPerSample, 34);
      header.write("data", 36);
      header.writeUInt32LE(dataSize, 40);
      resolve(Buffer.concat([header, rawPcm]));
    });

    proc.stdin.write(text);
    proc.stdin.end();
  });
}
