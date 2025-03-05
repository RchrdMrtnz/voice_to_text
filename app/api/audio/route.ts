import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/drive"],
});

const drive = google.drive({ version: "v3", auth });

export async function POST(req: NextRequest) {
  console.log("📌 Nueva solicitud recibida en /api/upload-audio");

  try {
    const body = await req.json();
    console.log("📌 Datos recibidos en API:", body);

    const { fileName, fileType } = body;

    if (!fileName || !fileType) {
      console.error("⚠️ Faltan parámetros obligatorios:", { fileName, fileType });
      return NextResponse.json(
        { error: "Se requieren 'fileName' y 'fileType'" },
        { status: 400 }
      );
    }

    console.log(`📌 Intentando crear archivo en Google Drive: ${fileName} (${fileType})`);

    // Crear el archivo en Google Drive sin contenido (solo metadata)
    const fileMetadata = {
      name: fileName,
      parents: [process.env.DRIVE_FOLDER_ID!],
      mimeType: fileType,
    };

    const fileResponse = await drive.files.create({
      requestBody: fileMetadata,
      fields: "id",
    });

    console.log("📌 Respuesta de Google Drive:", fileResponse.data);

    if (!fileResponse.data.id) {
      console.error("⚠️ No se recibió ID del archivo. Respuesta:", fileResponse.data);
      throw new Error("No se pudo crear el archivo en Google Drive");
    }

    const fileId = fileResponse.data.id;

    // Construir manualmente la URL de subida resumible
    const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=resumable`;

    console.log("✅ URL de subida obtenida correctamente:", uploadUrl);

    return NextResponse.json({ uploadUrl });
  } catch (error) {
    console.error("❌ Error en API upload-audio:", error);

    return NextResponse.json(
      {
        error: "Error al generar URL de subida",
        details: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}
