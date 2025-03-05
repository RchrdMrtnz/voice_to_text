// app/api/upload-audio/route.ts
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
    const { fileName, fileSize, fileType } = await req.json();

    // Crear sesión de subida resumible
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
        'X-Upload-Content-Length': fileSize,
        'Content-Type': 'application/json; charset=UTF-8'
      }
    });

    return NextResponse.json({
      uploadUrl: res.headers.location,
      fileId: res.data.id
    });

  } catch (error) {
    return NextResponse.json(
      { error: "Error al generar URL de subida" },
      { status: 500 }
    );
  }
}