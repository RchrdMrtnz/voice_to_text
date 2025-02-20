import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { OpenAI } from "openai";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import util from "util";
import { v4 as uuidv4 } from "uuid";

const execPromise = util.promisify(exec);

// 🔹 Configuración de OpenAI Whisper
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// 🔹 Configuración de Google Drive API
const KEYFILE_PATH = path.join(process.cwd(), "credentials.json");
const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

const auth = new google.auth.GoogleAuth({
  keyFile: KEYFILE_PATH,
  scopes: SCOPES,
});

const drive = google.drive({ version: "v3", auth });
const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID!; // ID de la carpeta en Drive

// 🔹 Directorio de subida
const UPLOAD_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("file") as File[];

    if (!files.length) {
      return NextResponse.json({ error: "No se encontraron archivos" }, { status: 400 });
    }

    let results = [];

    for (const file of files) {
      console.log(`📂 Procesando archivo: ${file.name}`);

      // Generar un ID único para cada archivo
      const fileId = uuidv4();
      const originalExtension = path.extname(file.name);
      const originalPath = path.join(UPLOAD_DIR, `${fileId}${originalExtension}`);
      const buffer = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(originalPath, buffer);

      // 🔹 Convertir a formato compatible con Whisper si es necesario
      const convertedPath = await ensureWavFormat(originalPath, fileId);

      // 🔹 Subir el audio a Google Drive
      const audioDriveLink = await uploadToDrive(convertedPath, `audio-${fileId}.wav`, "audio/wav");

      console.log("📡 Enviando audio a OpenAI Whisper para transcripción...");
      const response = await openai.audio.transcriptions.create({
        model: "whisper-1",
        file: fs.createReadStream(convertedPath),
        timestamp_granularities: ["segment"],
      });

      if (!response.text) {
        console.error("❌ OpenAI Whisper no devolvió texto.");
        return NextResponse.json({ error: "No se pudo obtener la transcripción." }, { status: 500 });
      }

      // 🔹 Guardar transcripción en .txt con el ID del audio
      const txtPath = path.join(UPLOAD_DIR, `transcripcion-${fileId}.txt`);
      saveTranscriptionAsTxt(response.segments, response.text, txtPath);

      // 🔹 Subir la transcripción a Google Drive
      const txtDriveLink = await uploadToDrive(txtPath, `transcripcion-${fileId}.txt`, "text/plain");

      results.push({
        fileName: file.name,
        fileId,
        text: response.text,
        audioDriveLink,
        txtDriveLink,
      });

      console.log(`✅ Procesamiento completado para ${file.name}`);
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("🚨 Error en la transcripción:", error);
    return NextResponse.json({ error: "Error en la transcripción" }, { status: 500 });
  }
}

// 🔹 Función para convertir cualquier audio a WAV con un ID único
async function ensureWavFormat(inputPath: string, fileId: string): Promise<string> {
  const ext = path.extname(inputPath).toLowerCase();
  if (ext === ".wav") return inputPath;

  const outputPath = path.join(UPLOAD_DIR, `audio-${fileId}.wav`);

  try {
    console.log(`🛠️ Convirtiendo ${inputPath} → ${outputPath}`);
    await execPromise(`ffmpeg -y -i "${inputPath}" -acodec pcm_s16le -ar 16000 "${outputPath}"`);
    console.log(`✅ Conversión completada: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error("🚨 Error convirtiendo el archivo a WAV:", error);
    throw new Error("Error al convertir el audio a WAV.");
  }
}

// 🔹 Guardar transcripción como TXT con timestamps
function saveTranscriptionAsTxt(segments: any[], text: string, filePath: string) {
  let transcriptText = "";

  if (segments && Array.isArray(segments)) {
    segments.forEach((segment) => {
      transcriptText += `[${formatTimestamp(segment.start)} - ${formatTimestamp(segment.end)}] ${segment.text}\n`;
    });
  } else {
    transcriptText = text;
  }

  fs.writeFileSync(filePath, transcriptText);
}

// 🔹 Subir archivos a Google Drive
async function uploadToDrive(filePath: string, fileName: string, mimeType: string) {
  try {
    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType,
        parents: [DRIVE_FOLDER_ID],
      },
      media: {
        mimeType,
        body: fs.createReadStream(filePath),
      },
    });

    return `https://drive.google.com/file/d/${response.data.id}/view`;
  } catch (error) {
    console.error("🚨 Error subiendo archivo a Google Drive:", error);
    throw new Error("Error al subir archivo a Google Drive.");
  }
}

// 🔹 Formatear timestamps a HH:MM:SS
function formatTimestamp(seconds: number): string {
  const date = new Date(0);
  date.setSeconds(seconds);
  return date.toISOString().substr(11, 8);
}
