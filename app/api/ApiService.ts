import { Dispatch, SetStateAction } from 'react';

// Configuración de rutas basada en next.config.js
const API_PREFIX = '/api'; // Para rutas que NO usan /api/ en el backend
const BACKEND_API_PREFIX = '/backend-api'; // Para rutas que SÍ usan /api/ en el backend

interface UploadedAudio {
  name: string;
  status: "Pendiente" | "Procesando" | "Completado" | "Error al procesar";
  transcriptLink?: string;
  audioLink?: string;
}

interface S3File {
  Key: string;
  URL: string;
  Size: number;
  LastModified: string;
  ContentType: string;
}

// Helper para rutas normales (sin /api/ en el backend)
const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
  const response = await fetch(`${API_PREFIX}/${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`🚨 Error en ${endpoint}:`, errorText);
    throw new Error(`Error en ${endpoint}: ${response.statusText}`);
  }

  return response;
};

// Helper para rutas que requieren /api/ en el backend
const backendApiRequest = async (endpoint: string, options: RequestInit = {}) => {
  const response = await fetch(`${BACKEND_API_PREFIX}/${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`🚨 Error en ${endpoint}:`, errorText);
    throw new Error(`Error en ${endpoint}: ${response.statusText}`);
  }

  return response;
};

// Función para verificar el estado de la transcripción
const checkTranscriptionStatus = async (
  taskId: string,
  setUploadedAudios: Dispatch<SetStateAction<UploadedAudio[]>>,
  fileName: string,
  setProcessingMessage: Dispatch<SetStateAction<string | null>>
) => {
  try {
    const response = await apiRequest(`transcription_status/${taskId}`);
    const statusData = await response.json();

    if (statusData.state === "PROGRESS") {
      setProcessingMessage(statusData.status || "Procesando transcripción...");
    } else if (statusData.state === "SUCCESS" && statusData.result?.message === "Transcripción completada y subida a S3") {
      setProcessingMessage("Transcripción completada");
      setUploadedAudios((prev) =>
        prev.map((audio) =>
          audio.name === fileName
            ? {
                ...audio,
                status: "Completado",
                transcriptLink: statusData.result.transcription_file_url,
              }
            : audio
        )
      );
      return true;
    } else if (statusData.state === "FAILED") {
      setProcessingMessage("Error en la transcripción");
      setUploadedAudios((prev) =>
        prev.map((audio) =>
          audio.name === fileName ? { ...audio, status: "Error al procesar" } : audio
        )
      );
      return true;
    }

    setTimeout(
      () => checkTranscriptionStatus(taskId, setUploadedAudios, fileName, setProcessingMessage),
      5000
    );
    return false;
  } catch (error) {
    console.error("🚨 Error al verificar el estado de la transcripción:", error);
    setProcessingMessage("Error al verificar el estado de la transcripción");
    setUploadedAudios((prev) =>
      prev.map((audio) =>
        audio.name === fileName ? { ...audio, status: "Error al procesar" } : audio
      )
    );
    return true;
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
  const timeout = 900000;
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    setProcessingMessage("Subiendo archivo...");

    const uploadResponse = await apiRequest("upload", {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const uploadData = await uploadResponse.json();
    setProcessingMessage("Archivo subido con éxito");

    setUploadedAudios((prev) =>
      prev.map((audio) =>
        audio.name === fileName ? { ...audio, status: "Procesando" } : audio
      )
    );

    const updatedFiles = await getFilesFromS3();
    const groupedFiles = groupFiles(updatedFiles);
    setGroupedFiles(groupedFiles);

    const fileNameKey = uploadData.file_info.Key.split("/").pop();
    console.log("🔍 Iniciando transcripción...");

    const transcribeResponse = await apiRequest(`transcribe/${fileNameKey}?segment_duration=60`, {
      method: "POST",
      signal: controller.signal,
    });

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

export const getFilesFromS3 = async (): Promise<S3File[]> => {
  try {
    const response = await apiRequest("files");
    const data = await response.json();

    if (data.files && Array.isArray(data.files)) {
      const filteredFiles = data.files.filter((file: any) => {
        const fileName = file.Key.split("/").pop() || "";
        return !fileName.endsWith(".svg");
      });

      return filteredFiles.map((file: any) => ({
        Key: file.Key,
        URL: file.URL,
        Size: file.Size,
        LastModified: file.LastModified,
        ContentType: file.ContentType,
      }));
    }
    return [];
  } catch (error) {
    console.error("🚨 Error al obtener los archivos de S3:", error);
    throw error;
  }
};

const groupFiles = (files: S3File[]) => {
  return files.reduce((acc, file) => {
    const fileName = file.Key.split("/").pop() || "";
    const fileId = fileName.split("_")[0];

    if (!acc[fileId]) {
      acc[fileId] = { audio: null, transcript: null };
    }

    const audioExtensions = [".wav", ".mp3", ".ogg", ".flac", ".aac", ".m4a", ".webm", ".opus"];
    if (audioExtensions.some(ext => fileName.endsWith(ext))) {
      acc[fileId].audio = file;
    } else if (fileName.endsWith(".txt")) {
      acc[fileId].transcript = file;
    }

    return acc;
  }, {} as Record<string, { audio: S3File | null; transcript: S3File | null }>);
};

export const generateSummary = async (s3Key: string) => {
  try {
    // Usamos backendApiRequest porque esta ruta requiere /api/ en el backend
    const response = await backendApiRequest(`resumen/?s3_key=${encodeURIComponent(s3Key)}`);
    return await response.json();
  } catch (error) {
    console.error("🚨 Error al generar el resumen:", error);
    throw error;
  }
};