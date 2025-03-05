import { NextRequest, NextResponse } from "next/server";
import { google, drive_v3 } from "googleapis";
import formidable from "formidable";
import fs from "fs";
import path from "path";
import { promisify } from "util";

// 🚀 Configuración de Next.js para evitar errores de tamaño de archivo
export const runtime = "nodejs";
export const maxDuration = 60; // 60s de ejecución
export const maxContentLengthBytes = 50 * 1024 * 1024; // 50MB de límite de archivo

// 🛠 Convertimos `fs.rename` a una promesa para manejar archivos correctamente
const renameAsync = promisify(fs.rename);

// ✅ Validación de variables de entorno
const clientEmail = process.env.GOOGLE_CLIENT_EMAIL as string;
const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n") as string;
const driveFolderId = process.env.DRIVE_FOLDER_ID as string;

if (!clientEmail || !privateKey || !driveFolderId) {
  throw new Error("❌ Faltan credenciales de Google Drive en las variables de entorno.");
}

// 🔐 Autenticación con Google Drive
const auth = new google.auth.GoogleAuth({
  credentials: { client_email: clientEmail, private_key: privateKey },
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});

const drive: drive_v3.Drive = google.drive({ version: "v3", auth });

// 📝 Configuración de `formidable` para manejar archivos correctamente
const form = formidable({
  multiples: false,
  keepExtensions: true, // Mantiene la extensión original del archivo
  uploadDir: "/tmp", // Directorio temporal para almacenar el archivo antes de subirlo
});

async function parseForm(req: NextRequest): Promise<{ fields: any; files: formidable.Files }> {
  return new Promise((resolve, reject) => {
    form.parse(req as any, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

// 🚀 API para manejar la subida de archivos
export async function POST(req: NextRequest) {
  console.log("📌 Recibiendo archivo en el backend...");

  try {
    // 📝 Procesamos el archivo enviado
    const { files } = await parseForm(req);

    if (!files.file) {
      return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });
    }

    // 📌 Manejo del archivo recibido
    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    console.log("📌 Archivo recibido:", file.originalFilename);

    // 📂 Movemos el archivo a un lugar seguro antes de subirlo
    const tempFilePath = file.filepath;
    const newFilePath = path.join("/tmp", file.newFilename);
    await renameAsync(tempFilePath, newFilePath);

    // 🏗️ Configuración del archivo para Google Drive
    const fileMetadata: drive_v3.Schema$File = {
      name: file.originalFilename!,
      parents: [driveFolderId],
    };

    const media = {
      mimeType: file.mimetype!,
      body: fs.createReadStream(newFilePath),
    };

    // 🚀 Subimos el archivo a Google Drive
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
