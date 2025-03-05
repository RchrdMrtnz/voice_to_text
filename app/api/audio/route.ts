import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});

const drive = google.drive({ version: "v3", auth });

export async function POST(req: NextRequest) {
  console.log("📌 Recibiendo solicitud en /api/upload-file");

  try {
    const { fileName, fileType } = await req.json();

    if (!fileName || !fileType) {
      console.error("⚠️ Faltan parámetros:", { fileName, fileType });
      return NextResponse.json(
        { error: "Se requieren 'fileName' y 'fileType'" },
        { status: 400 }
      );
    }

    console.log(`📌 Creando metadatos en Google Drive para: ${fileName} (${fileType})`);

    // 1️⃣ Crear el archivo en Google Drive sin contenido
    const fileMetadata = {
      name: fileName,
      mimeType: fileType,
      parents: [process.env.DRIVE_FOLDER_ID!],
    };

    const file = await drive.files.create({
      requestBody: fileMetadata,
      fields: "id",
    });

    if (!file.data.id) {
      throw new Error("No se pudo obtener el ID del archivo subido.");
    }

    console.log("✅ Archivo creado en Drive con ID:", file.data.id);

    // 2️⃣ Pre-generar la URL de subida con el ID
    const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${file.data.id}?uploadType=resumable`;

    console.log("✅ URL de subida generada:", uploadUrl);

    return NextResponse.json({
      fileId: file.data.id,
      uploadUrl,
    });
  } catch (error) {
    console.error("❌ Error en la API upload-file:", error);

    return NextResponse.json(
      {
        error: "Error al generar URL de subida",
        details: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}
