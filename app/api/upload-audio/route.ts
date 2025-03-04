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
    const requestData = await req.json();
    
    // Validación de parámetros
    if (!requestData.fileName || !requestData.fileType) {
      return NextResponse.json(
        { error: "Nombre de archivo y tipo requeridos" },
        { status: 400 }
      );
    }

    // Validar tipo MIME
    if (!ALLOWED_MIME_TYPES.includes(requestData.fileType)) {
      return NextResponse.json(
        { error: "Tipo de archivo no permitido" },
        { status: 400 }
      );
    }

    // Configuración de metadatos del archivo
    const fileMetadata: drive_v3.Schema$File = {
      name: `audio-${uuidv4()}-${requestData.fileName}`,
      parents: [process.env.DRIVE_FOLDER_ID!]
    };

    // Crear sesión de subida resumible
    const res = await drive.files.create({
      requestBody: fileMetadata,
      media: {
        mimeType: requestData.fileType,
      },
      fields: 'id'
    }, {
      params: { uploadType: 'resumable' },
      headers: {
        'X-Upload-Content-Type': requestData.fileType,
        'Content-Type': 'application/json; charset=UTF-8'
      }
    });

    // Obtener URL de subida desde headers
    const uploadUrl = res.headers.location;
    const fileId = res.data.id;

    if (!uploadUrl || !fileId) {
      throw new Error("No se pudo crear la sesión de subida");
    }

    // Configurar respuesta con CORS
    const response = NextResponse.json({
      uploadUrl,
      fileId,
      fileName: fileMetadata.name,
      message: "Sesión de subida creada correctamente"
    });

    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'POST');
    
    return response;

  } catch (error) {
    console.error("🚨 Error en la API:", error);
    const response = NextResponse.json(
      {
        error: "Error en el servidor",
        details: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
    response.headers.set('Access-Control-Allow-Origin', '*');
    return response;
  }
}