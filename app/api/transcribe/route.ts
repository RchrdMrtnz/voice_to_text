import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { OpenAI } from "openai";
import { v4 as uuidv4 } from "uuid";
import mime from "mime-types";

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

// 📌 Extensiones de audio compatibles con Whisper
const ALLOWED_EXTENSIONS = [".mp3", ".wav", ".m4a", ".ogg", ".flac"];

export async function POST(req: NextRequest) {
  try {
    console.log("📥 Recibiendo archivo en API...");
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      console.log("❌ No se encontró archivo en la solicitud.");
      return NextResponse.json({ error: "No se encontró archivo" }, { status: 400 });
    }

    const fileId = uuidv4();
    const ext = file.name ? `.${file.name.split(".").pop()}` : "";
    
    // 📌 Verificamos si la extensión es compatible
    if (!ALLOWED_EXTENSIONS.includes(ext.toLowerCase())) {
      console.error("❌ Formato no compatible:", ext);
      return NextResponse.json({ error: "Formato de archivo no compatible" }, { status: 400 });
    }

    console.log(`📂 Procesando archivo: ${file.name} (${file.type})`);

    // 📌 Convertimos el archivo en un objeto `File`
    const buffer = Buffer.from(await file.arrayBuffer());

    // 📌 Subir el audio directamente a Google Drive
    const audioDriveLink = await uploadToDrive(buffer, `audio-${fileId}${ext}`, file.type);

    console.log("📡 Enviando audio a OpenAI Whisper para transcripción...");
    const fileBlob = new Blob([buffer], { type: file.type });
    const fileToSend = new File([fileBlob], file.name, { type: file.type, lastModified: Date.now() });
    
    const whisperResponse = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: fileToSend, // ✅ Ahora enviamos un `File` válido
    });
    
    if (!whisperResponse.text) {
      console.error("❌ OpenAI Whisper no devolvió texto.");
      return NextResponse.json({ error: "No se pudo obtener la transcripción." }, { status: 500 });
    }

    console.log(`✅ Transcripción completada para ${file.name}`);

    // 📌 Guardar la transcripción en Google Drive
    const txtBuffer = Buffer.from(whisperResponse.text, "utf-8");
    const txtDriveLink = await uploadToDrive(txtBuffer, `transcripcion-${fileId}.txt`, "text/plain");

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

// 📌 Subir archivos directamente a Google Drive sin escribir en `/tmp/`
async function uploadToDrive(fileBuffer: Buffer, fileName: string, mimeType: string) {
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
      body: fileBuffer,
    },
  });

  console.log(`✅ Archivo subido a Drive: ${response.data.id}`);
  return `https://drive.google.com/file/d/${response.data.id}/view`;
}
