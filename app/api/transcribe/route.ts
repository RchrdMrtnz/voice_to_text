import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { OpenAI } from "openai";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import util from "util";
import { v4 as uuidv4 } from "uuid";
import ffmpeg from "ffmpeg-static";  // 📌 Usamos ffmpeg-static para Vercel

const execPromise = util.promisify(exec);

// 📌 Verifica que las variables de entorno están disponibles
console.log("🔍 Variables de entorno:");
console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "✅ Definida" : "❌ No definida");
console.log("GOOGLE_CLIENT_EMAIL:", process.env.GOOGLE_CLIENT_EMAIL ? "✅ Definida" : "❌ No definida");
console.log("GOOGLE_PRIVATE_KEY:", process.env.GOOGLE_PRIVATE_KEY ? "✅ Definida" : "❌ No definida");
console.log("DRIVE_FOLDER_ID:", process.env.DRIVE_FOLDER_ID ? "✅ Definida" : "❌ No definida");

// 📌 Inicializar OpenAI y Google Auth
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL!,
    private_key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});

const drive = google.drive({ version: "v3", auth });

// 📌 Usamos `/tmp/` porque Vercel no permite escribir en otro lado
const UPLOAD_DIR = "/tmp/uploads";
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log(`✅ Carpeta creada en: ${UPLOAD_DIR}`);
} else {
  console.log(`📂 Carpeta de uploads ya existe: ${UPLOAD_DIR}`);
}

export async function POST(req: NextRequest) {
  try {
    console.log("📥 Recibiendo archivo en API...");
    const formData = await req.formData();
    const files = formData.getAll("file") as File[];

    if (!files.length) {
      console.log("❌ No se encontraron archivos en la solicitud.");
      return NextResponse.json({ error: "No se encontraron archivos" }, { status: 400 });
    }

    let results = [];

    for (const file of files) {
      console.log(`📂 Procesando archivo: ${file.name}`);

      // 🔹 Generar un ID único
      const fileId = uuidv4();

      // 🔹 Guardar el archivo original en `/tmp/`
      const originalPath = path.join(UPLOAD_DIR, `${fileId}${path.extname(file.name)}`);
      const buffer = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(originalPath, buffer);
      console.log(`✅ Archivo guardado en: ${originalPath}`);

      // 🔹 Convertir a formato compatible si es necesario
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

      // 🔹 Guardar transcripción en `/tmp/`
      const txtPath = path.join(UPLOAD_DIR, `transcripcion-${fileId}.txt`);
      fs.writeFileSync(txtPath, response.text);
      console.log(`✅ Transcripción guardada en: ${txtPath}`);

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

    return NextResponse.json(
      { 
        error: "Error en la transcripción", 
        details: error instanceof Error ? error.message : "Error desconocido" 
      },
      { status: 500 }
    );
  }
}

// 🔹 Convertir audio a WAV si es necesario (Usando ffmpeg-static)
async function ensureWavFormat(inputPath: string, fileId: string): Promise<string> {
  const ext = path.extname(inputPath).toLowerCase();
  if (ext === ".wav") return inputPath;

  const outputPath = path.join(UPLOAD_DIR, `audio-${fileId}.wav`);

  try {
    if (!ffmpeg) {
      throw new Error("ffmpeg-static no se pudo cargar.");
    }

    console.log(`🛠️ Convirtiendo ${inputPath} → ${outputPath}`);
    await execPromise(`${ffmpeg} -y -i "${inputPath}" -acodec pcm_s16le -ar 16000 "${outputPath}"`);
    console.log(`✅ Conversión completada: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error("🚨 Error convirtiendo el archivo a WAV:", error);
    throw new Error("Error al convertir el audio a WAV.");
  }
}

// 🔹 Subir archivos a Google Drive
async function uploadToDrive(filePath: string, fileName: string, mimeType: string) {
  console.log(`📤 Subiendo archivo a Google Drive: ${fileName}`);

  if (!process.env.DRIVE_FOLDER_ID) {
    console.error("❌ Error: DRIVE_FOLDER_ID no está definido.");
    throw new Error("DRIVE_FOLDER_ID no está configurado.");
  }

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      mimeType,
      parents: [process.env.DRIVE_FOLDER_ID],
    },
    media: {
      mimeType,
      body: fs.createReadStream(filePath),
    },
  });

  console.log(`✅ Archivo subido a Drive: ${response.data.id}`);
  return `https://drive.google.com/file/d/${response.data.id}/view`;
}
