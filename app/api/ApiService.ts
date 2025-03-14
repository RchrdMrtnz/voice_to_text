// apiService.ts
import toast from 'react-hot-toast';
import { Dispatch, SetStateAction } from 'react'; // Importa los tipos necesarios

const backendUrl = "api/";

interface UploadedAudio {
  name: string;
  status: "Pendiente" | "Procesando" | "Completado" | "Error al procesar";
  transcriptLink?: string;
  audioLink?: string;
}

export const uploadAudio = async (
  audioFile: File,
  fileName: string,
  setUploadedAudios: Dispatch<SetStateAction<UploadedAudio[]>>,
  setProcessingMessage: Dispatch<SetStateAction<string | null>> // Añade este parámetro
) => {
  const formData = new FormData();
  formData.append("file", audioFile);

  // Configurar el timeout de 10 minutos (600,000 ms)
  const controller = new AbortController();
  const timeout = 900000; // 10 minutos en milisegundos
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    console.log("📤 Subiendo archivo...");
    setProcessingMessage("Subiendo archivo..."); // Usa setProcessingMessage

    // Subir el archivo al backend
    const uploadResponse = await fetch(`${backendUrl}/upload`, {
      method: "POST",
      body: formData,
      signal: controller.signal, // Asociar el AbortController
    });

    clearTimeout(timeoutId); // Limpiar el timeout si la solicitud tiene éxito

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error("🚨 Error en la respuesta del servidor:", errorText);
      throw new Error(`Error al subir el archivo: ${uploadResponse.statusText}`);
    }

    const uploadData = await uploadResponse.json();
    console.log("✅ Archivo subido con éxito:", uploadData);

    if (!uploadData.message || uploadData.message !== "Archivo subido con éxito") {
      throw new Error("No se pudo subir el archivo.");
    }

    // Actualizar el estado a "Procesando"
    setUploadedAudios((prev) =>
      prev.map((audio) =>
        audio.name === fileName ? { ...audio, status: "Procesando" } : audio
      )
    );

    await new Promise((resolve) => setTimeout(resolve, 500)); // Pequeño retraso para mostrar "Procesando"

    // Iniciar la transcripción
    const segmentDuration = 60;
    const fileNameKey = uploadData.file_info.Key.split("/").pop();

    console.log("🔍 Iniciando transcripción...");
    setProcessingMessage("Transcribiendo audio..."); // Usa setProcessingMessage

    const transcribeResponse = await fetch(
      `${backendUrl}/transcribe/${fileNameKey}?segment_duration=${segmentDuration}`,
      {
        method: "POST",
        signal: controller.signal, // Asociar el AbortController
      }
    );

    clearTimeout(timeoutId); // Limpiar el timeout si la solicitud tiene éxito

    if (!transcribeResponse.ok) {
      const errorText = await transcribeResponse.text();
      console.error("🚨 Error en la respuesta de transcripción:", errorText);
      throw new Error(`Error al obtener la transcripción: ${transcribeResponse.statusText}`);
    }

    const transcribeData = await transcribeResponse.json();
    console.log("✅ Transcripción completada:", transcribeData);

    if (!transcribeData.file_details || !transcribeData.file_details.transcription_file_url) {
      throw new Error("No se pudo obtener el enlace del archivo de transcripción.");
    }

    // Actualizar el estado a "Completado"
    setUploadedAudios((prev) =>
      prev.map((audio) =>
        audio.name === fileName
          ? {
              ...audio,
              status: "Completado",
              audioLink: transcribeData.file_details.audio_url,
              transcriptLink: transcribeData.file_details.transcription_file_url,
            }
          : audio
      )
    );

    toast.success("Audio subido y transcrito correctamente");
  } catch (error) {
    console.error("🚨 Error al subir audio o obtener la transcripción:", error);
    setUploadedAudios((prev) =>
      prev.map((audio) =>
        audio.name === fileName ? { ...audio, status: "Error al procesar" } : audio
      )
    );
    toast.error("Error al procesar el audio");
  } finally {
    setProcessingMessage(null); // Usa setProcessingMessage
  }
};