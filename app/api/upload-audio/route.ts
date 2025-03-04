// app/api/upload-audio/route.ts
import { NextRequest, NextResponse } from "next/server";
import { google, drive_v3 } from "googleapis";
import { v4 as uuidv4 } from "uuid";

// Configuración de autenticación de Google
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});

const drive = google.drive({ version: "v3", auth });

const ALLOWED_MIME_TYPES = [
  'audio/mpeg', // MP3
  'audio/wav',  // WAV
  'audio/mp4',  // M4A
  'audio/ogg',  // OGG
  'audio/flac'  // FLAC
];

export async function POST(req: NextRequest) {
  try {
    const { fileName, fileType } = await req.json();
    
    // 1. Validar parámetros
    if (!fileName || !fileType) {
      return NextResponse.json(
        { error: "Se requieren nombre y tipo de archivo" },
        { status: 400 }
      );
    }

    // 2. Validar tipo MIME
    if (!ALLOWED_MIME_TYPES.includes(fileType)) {
      return NextResponse.json(
        { error: "Tipo de archivo no permitido" },
        { status: 400 }
      );
    }

    // 3. Configurar metadatos
    const fileMetadata: drive_v3.Schema$File = {
      name: `audio-${uuidv4()}-${fileName}`,
      parents: [process.env.DRIVE_FOLDER_ID!]
    };

    // 4. Crear sesión de subida resumible
    const res = await drive.files.create(
      {
        requestBody: fileMetadata,
        media: {
          mimeType: fileType,
          body: "", // Necesario pero se ignora
        },
        fields: "id",
      },
      {
        params: { uploadType: "resumable" },
        headers: {
          "X-Upload-Content-Type": fileType,
          "Content-Type": "application/json; charset=UTF-8",
        },
      }
    );

    // 5. Obtener URL de subida desde headers
    const uploadUrl = res.headers.location;
    const fileId = res.data.id;

    if (!uploadUrl || !fileId) {
      console.error("Respuesta de Drive:", res);
      throw new Error("Fallo al obtener URL de subida");
    }

    // 6. Configurar respuesta CORS
    const response = NextResponse.json({
      success: true,
      uploadUrl,
      fileId,
      fileName: fileMetadata.name,
    });

    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "POST");

    return response;

  } catch (error) {
    console.error("Error detallado:", error);
    const response = NextResponse.json(
      {
        error: "Error al crear sesión de subida",
        details: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
    response.headers.set("Access-Control-Allow-Origin", "*");
    return response;
  }
}