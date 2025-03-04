import { NextRequest, NextResponse } from "next/server";
import { google, drive_v3 } from "googleapis";

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});

const drive = google.drive({ version: "v3", auth });

const ALLOWED_MIME_TYPES = [
  'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/ogg', 'audio/flac',
  'audio/mp3', 'audio/x-m4a' // Tipos adicionales comunes
];

export async function POST(req: NextRequest) {
  try {
    const { fileName, fileType } = await req.json();

    // Validación mejorada
    if (!fileName?.trim() || !fileType?.trim()) {
      return NextResponse.json(
        { error: "Nombre y tipo de archivo son requeridos" },
        { status: 400 }
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(fileType)) {
      return NextResponse.json(
        { error: `Tipo de archivo no permitido: ${fileType}` },
        { status: 400 }
      );
    }

    // Crear sesión de subida
    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [process.env.DRIVE_FOLDER_ID!],
      },
      media: { mimeType: fileType },
      fields: 'id'
    }, {
      params: { uploadType: 'resumable' },
      headers: {
        'X-Upload-Content-Type': fileType,
        'Content-Type': 'application/json; charset=UTF-8'
      }
    });

    // Obtener URL desde headers
    const uploadUrl = res.headers.location;
    const fileId = res.data.id;

    if (!uploadUrl || !fileId) {
      console.error("Error en respuesta de Google:", {
        status: res.status,
        headers: res.headers,
        data: res.data
      });
      throw new Error("Google Drive no devolvió la URL de subida");
    }

    return NextResponse.json({ uploadUrl, fileId });

  } catch (error) {
    console.error("Error completo:", error);
    return NextResponse.json(
      {
        error: "Error técnico al configurar la subida",
        details: error instanceof Error ? error.message : "Contacte al soporte"
      },
      { status: 500 }
    );
  }
}