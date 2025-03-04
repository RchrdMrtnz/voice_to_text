// app/api/upload-audio/route.ts
import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { Readable } from "stream";
import { v4 as uuidv4 } from "uuid";

// Inicializamos Google Auth
let privateKey = process.env.GOOGLE_PRIVATE_KEY;
if (!privateKey) {
  console.error("❌ GOOGLE_PRIVATE_KEY no está definida.");
  throw new Error("GOOGLE_PRIVATE_KEY no configurada correctamente.");
}
privateKey = privateKey.replace(/\\n/g, "\n");

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL!,
    private_key: privateKey,
  },
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});

const drive = google.drive({ version: "v3", auth });

const ALLOWED_EXTENSIONS = [".mp3", ".wav", ".m4a", ".ogg", ".flac"];

export async function POST(req: NextRequest) {
  try {
    console.log("📥 [upload-audio] Recibiendo archivo...");
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      console.error("❌ No se encontró archivo.");
      return NextResponse.json({ error: "No se encontró archivo" }, { status: 400 });
    }

    // Verificamos la extensión del archivo
    const ext = file.name 
      ? `.${file.name.split(".").pop()?.toLowerCase()}` 
      : `.${file.type.split("/").pop()?.toLowerCase()}`;

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      console.error("❌ Formato de archivo no compatible:", ext);
      return NextResponse.json(
        { error: `Formato de archivo no compatible (${ext})` },
        { status: 400 }
      );
    }

    // Convertimos File -> Buffer -> ReadableStream
    const buffer = Buffer.from(await file.arrayBuffer());
    const readableStream = new Readable();
    readableStream.push(buffer);
    readableStream.push(null);

    // Subimos a Drive
    console.log("📤 Subiendo audio a Google Drive...");
    const fileId = uuidv4();
    const response = await drive.files.create({
      requestBody: {
        name: `audio-${fileId}${ext}`,
        mimeType: file.type,
        parents: [process.env.DRIVE_FOLDER_ID!],
      },
      media: {
        mimeType: file.type,
        body: readableStream,
      },
    });

    console.log(`✅ Audio subido a Drive con ID: ${response.data.id}`);
    const audioDriveLink = `https://drive.google.com/file/d/${response.data.id}/view`;

    // Devolvemos el enlace en la respuesta
    return NextResponse.json({
      fileName: file.name,
      fileId,
      audioDriveLink,
      message: "Audio subido correctamente a Drive",
    });
  } catch (error) {
    console.error("🚨 Error subiendo audio a Drive:", error);
    return NextResponse.json(
      {
        error: "Error subiendo audio a Drive",
        details: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}
