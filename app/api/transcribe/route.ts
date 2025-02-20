import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { OpenAI } from "openai";
import { Readable } from "stream";
import { v4 as uuidv4 } from "uuid";

// 📌 Inicializar OpenAI y Google Auth
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

let privateKey = process.env.GOOGLE_PRIVATE_KEY;
if (!privateKey) {
    console.error("❌ GOOGLE_PRIVATE_KEY no está definida correctamente.");
    throw new Error("GOOGLE_PRIVATE_KEY no configurada correctamente.");
}
privateKey = privateKey.replace(/\\n/g, "\n");

console.log("🔑 Clave privada cargada correctamente:", privateKey.startsWith("-----BEGIN PRIVATE KEY-----"));

console.log("GOOGLE_DRIVE_FOLDER_ID:", process.env.GOOGLE_DRIVE_FOLDER_ID);
console.log("GOOGLE_CLIENT_EMAIL:", process.env.GOOGLE_CLIENT_EMAIL);
console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY);
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL!,
    private_key: privateKey,
  },
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});

const drive = google.drive({ version: "v3", auth });

// 📌 Extensiones de audio permitidas
const ALLOWED_EXTENSIONS = [".mp3", ".wav", ".m4a", ".ogg", ".flac"];



export async function POST(req: NextRequest) {
  try {
    console.log("📥 Recibiendo archivo...");
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      console.error("❌ No se encontró archivo.");
      return NextResponse.json({ error: "No se encontró archivo" }, { status: 400 });
    }

    

    // 📌 Obtener extensión del archivo
    const ext = file.name ? `.${file.name.split(".").pop()?.toLowerCase()}` : `.${file.type.split("/").pop()?.toLowerCase()}`;
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      console.error("❌ Formato de archivo no compatible:", ext);
      return NextResponse.json({ error: `Formato de archivo no compatible (${ext})` }, { status: 400 });
    }
    console.log("📂 Nombre del archivo recibido:", file.name);
    console.log("📂 Tipo de archivo recibido:", file.type);
        
    console.log(`📂 Procesando archivo: ${file.name} (${file.type})`);

    // 📌 Convertimos el archivo en `Buffer`
    const buffer = Buffer.from(await file.arrayBuffer());

    // 📌 Convertimos `Buffer` en un `ReadableStream`
    const readableStream = new Readable();
    readableStream.push(buffer);
    readableStream.push(null);
    console.log("ReadableStream created:", readableStream);

    // 📌 Subir audio a Google Drive
    console.log("📤 Subiendo audio a Google Drive...");
    const fileId = uuidv4();
    const audioDriveLink = await uploadToDrive(readableStream, `audio-${fileId}${ext}`, file.type);

    // 📌 Convertimos `Buffer` a `File` para Whisper
    const fileBlob = new Blob([buffer], { type: file.type });
    const fileToSend = new File([fileBlob], file.name, { type: file.type, lastModified: Date.now() });

    console.log("📡 Enviando a OpenAI Whisper...");
    const whisperResponse = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: fileToSend,
    });

    if (!whisperResponse.text) {
      console.error("❌ OpenAI Whisper no devolvió texto.");
      return NextResponse.json({ error: "No se pudo obtener la transcripción." }, { status: 500 });
    }

    console.log("✅ Transcripción completada");

    // 📌 Convertimos transcripción en `Buffer` para Google Drive
    const txtBuffer = Buffer.from(whisperResponse.text, "utf-8");
    const txtReadableStream = new Readable();
    txtReadableStream.push(txtBuffer);
    txtReadableStream.push(null);

    // 📌 Subir transcripción a Google Drive
    console.log("📤 Subiendo transcripción...");
    const txtDriveLink = await uploadToDrive(txtReadableStream, `transcripcion-${fileId}.txt`, "text/plain");

    return NextResponse.json({
      fileName: file.name,
      fileId,
      text: whisperResponse.text,
      audioDriveLink,
      txtDriveLink,
    });
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

// 📌 Subir archivos a Google Drive con `ReadableStream`
async function uploadToDrive(fileStream: Readable, fileName: string, mimeType: string) {
  console.log(`📤 Subiendo archivo a Google Drive: ${fileName}`);

  if (!process.env.DRIVE_FOLDER_ID) {
    console.error("❌ DRIVE_FOLDER_ID no definido.");
    throw new Error("DRIVE_FOLDER_ID no configurado.");
  }

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      mimeType,
      parents: [process.env.DRIVE_FOLDER_ID],
    },
    media: {
      mimeType,
      body: fileStream, // ✅ Usamos `ReadableStream`
    },
  });

  console.log(`✅ Archivo subido a Drive: ${response.data.id}`);
  return `https://drive.google.com/file/d/${response.data.id}/view`;
}
