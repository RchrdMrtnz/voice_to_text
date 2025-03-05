import { NextRequest, NextResponse } from "next/server";
import { google, drive_v3 } from "googleapis";
import formidable from "formidable";
import fs from "fs"; 

export const runtime = 'nodejs'; // ✅ Nueva configuración para Next.js 13+

const clientEmail = process.env.GOOGLE_CLIENT_EMAIL as string;
const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n") as string;
const driveFolderId = process.env.DRIVE_FOLDER_ID as string;

if (!clientEmail || !privateKey || !driveFolderId) {
  throw new Error("❌ Faltan credenciales de Google Drive en las variables de entorno.");
}

const auth = new google.auth.GoogleAuth({
  credentials: { client_email: clientEmail, private_key: privateKey },
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});

const drive: drive_v3.Drive = google.drive({ version: "v3", auth });

async function parseForm(req: NextRequest): Promise<{ fields: any; files: formidable.Files }> {
  const form = formidable({ multiples: false });

  return new Promise((resolve, reject) => {
    form.parse(req as any, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

export async function POST(req: NextRequest) {
  console.log("📌 Recibiendo archivo en el backend...");

  try {
    const { files } = await parseForm(req);

    if (!files.file) {
      return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });
    }

    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    console.log("📌 Archivo recibido:", file.originalFilename);

    const fileMetadata: drive_v3.Schema$File = {
      name: file.originalFilename!,
      parents: [driveFolderId],
    };

    const media = {
      mimeType: file.mimetype!,
      body: fs.createReadStream(file.filepath),
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: "id, webViewLink",
    });

    if (!response.data.id) {
      throw new Error("No se pudo obtener el ID del archivo subido.");
    }

    console.log("✅ Archivo subido a Google Drive:", response.data);

    return NextResponse.json({
      fileId: response.data.id,
      fileUrl: response.data.webViewLink,
    });
  } catch (error) {
    console.error("❌ Error en la subida de archivo:", error);
    return NextResponse.json(
      { error: "Error al subir el archivo a Google Drive", details: (error as Error).message },
      { status: 500 }
    );
  }
}
