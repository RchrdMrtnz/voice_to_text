import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { Readable } from "stream";
import { v4 as uuidv4 } from "uuid";

let privateKey = process.env.GOOGLE_PRIVATE_KEY;
if (!privateKey) throw new Error("GOOGLE_PRIVATE_KEY no configurada.");
privateKey = privateKey.replace(/\\n/g, "\n");

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL!,
    private_key: privateKey,
  },
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});

const drive = google.drive({ version: "v3", auth });

export async function POST(req: NextRequest) {
  try {
    console.log("📥 Recibiendo archivo en backend...");

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No se encontró archivo" }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    const allowedExtensions = ["mp3", "wav", "m4a", "ogg", "flac"];
    if (!allowedExtensions.includes(ext!)) {
      return NextResponse.json({ error: `Formato no permitido (${ext})` }, { status: 400 });
    }

    console.log(`📂 Procesando archivo: ${file.name} (${file.type})`);

    // Convertir el archivo en `Buffer`
    const buffer = Buffer.from(await file.arrayBuffer());

    // Convertir `Buffer` a `ReadableStream`
    const readableStream = new Readable();
    readableStream.push(buffer);
    readableStream.push(null);

    // 📌 Subir el archivo a Google Drive
    console.log("📤 Subiendo archivo a Google Drive...");
    const fileId = uuidv4();
    const audioDriveLink = await uploadToDrive(readableStream, `audio-${fileId}.${ext}`, file.type);

    console.log("✅ Archivo subido a Drive:", audioDriveLink);

    return NextResponse.json({ audioDriveLink });
  } catch (error) {
    console.error("🚨 Error en la subida:", error);
    return NextResponse.json(
      {
        error: "Error en la subida",
        details: error instanceof Error ? error.message : "Error desconocido"
      },
      { status: 500 }
    );
  }    
}

// 📌 Función para subir archivos a Google Drive
async function uploadToDrive(fileStream: Readable, fileName: string, mimeType: string) {
  console.log(`📤 Subiendo archivo a Google Drive: ${fileName}`);

  if (!process.env.GOOGLE_DRIVE_FOLDER_ID) {
    console.error("❌ GOOGLE_DRIVE_FOLDER_ID no está definido.");
    throw new Error("GOOGLE_DRIVE_FOLDER_ID no configurado.");
  }

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      mimeType,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
    },
    media: {
      mimeType,
      body: fileStream, // ✅ Usamos `ReadableStream`
    },
  });

  console.log(`✅ Archivo subido a Drive con ID: ${response.data.id}`);
  return `https://drive.google.com/file/d/${response.data.id}/view`;
}
