// apiService.ts
import { Dispatch, SetStateAction } from 'react'; // Importa los tipos necesarios

const backendUrl = "api/";

interface UploadedAudio {
  name: string;
  status: "Pendiente" | "Procesando" | "Completado" | "Error al procesar";
  transcriptLink?: string;
  audioLink?: string;
}

// Función para verificar el estado de la transcripción
const checkTranscriptionStatus = async (
  taskId: string,
  setUploadedAudios: Dispatch<SetStateAction<UploadedAudio[]>>,
  fileName: string,
  setProcessingMessage: Dispatch<SetStateAction<string | null>>
) => {
  try {
    const response = await fetch(`${backendUrl}/transcription_status/${taskId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("🚨 Error al verificar el estado de la transcripción:", errorText);
      throw new Error(`Error al verificar el estado: ${response.statusText}`);
    }

    const statusData = await response.json();

    // Actualizar el mensaje de procesamiento según el estado
    if (statusData.state === "PROGRESS") {
      setProcessingMessage(statusData.status || "Procesando transcripción..."); // Mostrar el mensaje de progreso
    } else if (statusData.state === "SUCCESS" && statusData.result?.message === "Transcripción completada y subida a S3") {
      setProcessingMessage("Transcripción completada"); // Mensaje de éxito

      // Actualizar el estado del archivo a "Completado"
      setUploadedAudios((prev) =>
        prev.map((audio) =>
          audio.name === fileName
            ? {
                ...audio,
                status: "Completado", // Cambiar el estado a "Completado"
                transcriptLink: statusData.result.transcription_file_url,
              }
            : audio
        )
      );
      return true; // Indica que la transcripción está completa
    } else if (statusData.state === "FAILED") {
      setProcessingMessage("Error en la transcripción"); // Mensaje de error
      setUploadedAudios((prev) =>
        prev.map((audio) =>
          audio.name === fileName ? { ...audio, status: "Error al procesar" } : audio
        )
      );
      return true; // Indica que la transcripción falló
    }

    // Si la transcripción aún está en proceso, volver a verificar después de 5 segundos
    setTimeout(
      () => checkTranscriptionStatus(taskId, setUploadedAudios, fileName, setProcessingMessage),
      5000
    );
    return false; // Indica que la transcripción aún está en proceso
  } catch (error) {
    console.error("🚨 Error al verificar el estado de la transcripción:", error);
    setProcessingMessage("Error al verificar el estado de la transcripción"); // Mensaje de error
    setUploadedAudios((prev) =>
      prev.map((audio) =>
        audio.name === fileName ? { ...audio, status: "Error al procesar" } : audio
      )
    );
    return true; // Indica que hubo un error
  }
};

export const uploadAudio = async (
  audioFile: File,
  fileName: string,
  setUploadedAudios: Dispatch<SetStateAction<UploadedAudio[]>>,
  setProcessingMessage: Dispatch<SetStateAction<string | null>>,
  setGroupedFiles: Dispatch<SetStateAction<Record<string, { audio: S3File | null; transcript: S3File | null }>>>
) => {
  const formData = new FormData();
  formData.append("file", audioFile, fileName);

  const controller = new AbortController();
  const timeout = 900000; // 10 minutos en milisegundos
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    setProcessingMessage("Subiendo archivo...");

    const uploadResponse = await fetch(`${backendUrl}/upload`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error("🚨 Error en la respuesta del servidor:", errorText);
      throw new Error(`Error al subir el archivo: ${uploadResponse.statusText}`);
    }

    const uploadData = await uploadResponse.json();
    setProcessingMessage("Archivo subido con éxito");

    // Actualizar el estado del archivo a "Procesando"
    setUploadedAudios((prev) =>
      prev.map((audio) =>
        audio.name === fileName ? { ...audio, status: "Procesando" } : audio
      )
    );

    // Obtener la lista actualizada de archivos de S3
    const updatedFiles = await getFilesFromS3();
    const groupedFiles = groupFiles(updatedFiles); // Agrupar los archivos
    setGroupedFiles(groupedFiles); // Actualizar el estado de groupedFiles

    // Procesar la transcripción
    const fileNameKey = uploadData.file_info.Key.split("/").pop();
    console.log("🔍 Iniciando transcripción...");

    const transcribeResponse = await fetch(
      `${backendUrl}/transcribe/${fileNameKey}?segment_duration=60`,
      { method: "POST", signal: controller.signal }
    );

    if (!transcribeResponse.ok) {
      throw new Error(`Error al obtener la transcripción: ${transcribeResponse.statusText}`);
    }

    const transcribeData = await transcribeResponse.json();
    setProcessingMessage("Convirtiendo audio a MP3...");

    const taskId = transcribeData.task_id;
    await checkTranscriptionStatus(taskId, setUploadedAudios, fileName, setProcessingMessage);
  } catch (error) {
    console.error("🚨 Error al subir audio o obtener la transcripción:", error);
    setUploadedAudios((prev) =>
      prev.map((audio) =>
        audio.name === fileName ? { ...audio, status: "Error al procesar" } : audio
      )
    );
    setProcessingMessage("Error al procesar el audio");
  } finally {
    setProcessingMessage(null);
  }
};

// Definir la interfaz para S3File
interface S3File {
  Key: string;
  URL: string;
  Size: number;
  LastModified: string;
  ContentType: string;
}

export const getFilesFromS3 = async (): Promise<S3File[]> => {
  try {
    const response = await fetch(`${backendUrl}/files`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("🚨 Error al obtener los archivos de S3:", errorText);
      throw new Error(`Error al obtener los archivos: ${response.statusText}`);
    }

    const data = await response.json();

    // Verificar si la respuesta contiene un array de archivos
    if (data.files && Array.isArray(data.files)) {
      // Filtrar los archivos para excluir los de tipo SVG
      const filteredFiles = data.files.filter((file: any) => {
        const fileName = file.Key.split("/").pop() || ""; // Obtener el nombre del archivo
        return !fileName.endsWith(".svg"); // Excluir archivos con extensión .svg
      });

      return filteredFiles.map((file: any) => ({
        Key: file.Key,
        URL: file.URL,
        Size: file.Size,
        LastModified: file.LastModified,
        ContentType: file.ContentType,
      }));
    } else {
      // Si no hay archivos, devolver un array vacío
      console.log("No se encontraron archivos en S3.");
      return [];
    }
  } catch (error) {
    console.error("🚨 Error al obtener los archivos de S3:", error);
    throw error;
  }
};

// Función para agrupar archivos de S3
const groupFiles = (files: S3File[]) => {
  return files.reduce((acc, file) => {
    const fileName = file.Key.split("/").pop() || "";
    const fileId = fileName.split("_")[0]; // Extraer el ID común

    if (!acc[fileId]) {
      acc[fileId] = { audio: null, transcript: null };
    }

    // Identificar si es un archivo de audio (extensiones de audio comunes)
    const audioExtensions = [".wav", ".mp3", ".ogg", ".flac", ".aac", ".m4a", ".webm", ".opus"];
    if (audioExtensions.some(ext => fileName.endsWith(ext))) {
      acc[fileId].audio = file;
    }
    // Identificar si es un archivo de transcripción (extensión .txt)
    else if (fileName.endsWith(".txt")) {
      acc[fileId].transcript = file;
    }

    return acc;
  }, {} as Record<string, { audio: S3File | null; transcript: S3File | null }>);
};