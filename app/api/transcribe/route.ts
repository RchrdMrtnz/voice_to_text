import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";
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

export async function GET(req: NextRequest) {
  try {
    const fileId = uuidv4();
    const fileName = `audio-${fileId}.wav`;

    const fileMetadata = {
      name: fileName,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID!],
    };

    const file = await drive.files.create({
      requestBody: fileMetadata,
      media: { mimeType: "audio/wav", body: "" },
    });

    const fileIdDrive = file.data.id;

    // Generar URL para subir el archivo directamente desde el frontend
    const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileIdDrive}?uploadType=resumable`;

    return NextResponse.json({ uploadUrl, fileIdDrive });
  } catch (error) {
    console.error("🚨 Error generando URL firmada:", error);
    return NextResponse.json({ error: "Error generando URL" }, { status: 500 });
  }
}
