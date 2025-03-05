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
  try {
    const { fileName, fileType } = await req.json();

    // Crear sesión de subida resumible
    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [process.env.DRIVE_FOLDER_ID!],
      },
      media: { mimeType: fileType },
    }, {
      params: { uploadType: 'resumable' },
      headers: {
        'X-Upload-Content-Type': fileType,
        'Content-Type': 'application/json; charset=UTF-8'
      }
    });

    // Obtener URL de subida desde headers
    const uploadUrl = res.headers['location'];
    
    if (!uploadUrl) {
      console.error('Headers de respuesta:', res.headers);
      throw new Error("No se recibió URL de subida de Google Drive");
    }

    return NextResponse.json({ uploadUrl });

  } catch (error) {
    console.error("Error en API:", error);
    return NextResponse.json(
      { error: "Error al generar URL de subida" },
      { status: 500 }
    );
  }
}