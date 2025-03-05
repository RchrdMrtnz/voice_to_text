import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { Readable } from "stream";

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});

const drive = google.drive({ version: "v3", auth });

const ALLOWED_MIME_TYPES = [
  'audio/mpeg', 'audio/wav', 'audio/mp4', 
  'audio/ogg', 'audio/flac', 'audio/x-m4a'
];

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
    }

    // Validar tipo MIME
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Formato no soportado: ${file.type}` }, 
        { status: 400 }
      );
    }

    // Convertir a stream
    const buffer = Buffer.from(await file.arrayBuffer());
    const readableStream = new Readable();
    readableStream.push(buffer);
    readableStream.push(null);

    // Subir a Drive
    const response = await drive.files.create({
      requestBody: {
        name: file.name,
        mimeType: file.type,
        parents: [process.env.DRIVE_FOLDER_ID!],
      },
      media: {
        mimeType: file.type,
        body: readableStream,
      },
    });

    return NextResponse.json({
      audioDriveLink: `https://drive.google.com/file/d/${response.data.id}/view`,
      fileName: file.name
    });

  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: "Error al subir el archivo" },
      { status: 500 }
    );
  }
}