// audioStreamService.ts (solución para el error de importación)

// Modificación 1: Eliminar la importación que causa el error
// import { checkTranscriptionStatus } from './ApiService';

import { Dispatch, SetStateAction } from 'react';

const backendUrl = "/api";

interface RecordingResult {
  session_id: string;
  final_audio_key: string;
  message: string;
}

// Definir la interfaz para los audios subidos
interface UploadedAudio {
  name: string;
  status: "Pendiente" | "Procesando" | "Completado" | "Error al procesar";
  transcriptLink?: string;
  audioLink?: string;
  summary?: string;
  summaryUrl?: string;
}

interface TaskStatus {
  task_id: string;
  status: string;
  result: RecordingResult | null;
}

// Modificación 2: Implementar checkTranscriptionStatus aquí mismo
/**
 * Verifica el estado de la transcripción periódicamente
 * @param taskId - ID de la tarea de transcripción
 * @param setUploadedAudios - Función para actualizar la lista de audios subidos
 * @param fileName - Nombre del archivo que se está transcribiendo
 * @param setProcessingMessage - Función para actualizar el mensaje de procesamiento
 * @returns - Promesa que se resuelve cuando la transcripción está completa
 */
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
      
      // Limpiar el mensaje de procesamiento después de 3 segundos
      setTimeout(() => setProcessingMessage(null), 3000);
      
      return true; // Indica que la transcripción está completa
    } else if (statusData.state === "FAILED") {
      setProcessingMessage("Error en la transcripción"); // Mensaje de error
      setUploadedAudios((prev) =>
        prev.map((audio) =>
          audio.name === fileName ? { ...audio, status: "Error al procesar" } : audio
        )
      );
      
      // Limpiar el mensaje de error después de 3 segundos
      setTimeout(() => setProcessingMessage(null), 3000);
      
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
    
    // Limpiar el mensaje de error después de 3 segundos
    setTimeout(() => setProcessingMessage(null), 3000);
    
    return true; // Indica que hubo un error
  }
};

/**
 * Sube un fragmento de audio al servidor
 * @param blob - El blob del fragmento de audio
 * @param sessionId - ID de la sesión de grabación
 * @param chunkNumber - Número del fragmento
 * @returns - Promesa con la respuesta del servidor
 */
export const uploadAudioChunk = async (
  blob: Blob,
  sessionId: string,
  chunkNumber: number
): Promise<any> => {
  try {
    // Crear un File a partir del Blob para mayor compatibilidad
    const file = new File([blob], `chunk-${chunkNumber}.webm`, {
      type: blob.type || 'audio/webm'
    });
    
    const formData = new FormData();
    formData.append("file", file);
    
    const response = await fetch(`${backendUrl}/upload-chunk?session_id=${sessionId}&chunk_number=${chunkNumber}`, {
      method: "POST",
      body: formData,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error en la respuesta del servidor:", errorText);
      throw new Error(`Error al subir fragmento ${chunkNumber}: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error al subir fragmento ${chunkNumber}:`, error);
    throw error;
  }
};

/**
 * Finaliza una grabación y combina todos los fragmentos
 * @param sessionId - ID de la sesión de grabación
 * @returns - Promesa con el ID de la tarea de procesamiento
 */
export const finalizeRecording = async (sessionId: string): Promise<string> => {
  try {
    const response = await fetch(`${backendUrl}/finish-recording?session_id=${sessionId}`, {
      method: "POST",
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error en la respuesta del servidor:", errorText);
      throw new Error(`Error al finalizar la grabación: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.task_id;
  } catch (error) {
    console.error("Error al finalizar la grabación:", error);
    throw error;
  }
};

/**
 * Verifica el estado de una tarea de procesamiento
 * @param taskId - ID de la tarea a verificar
 * @returns - Promesa con el estado de la tarea
 */
export const checkTaskStatus = async (taskId: string): Promise<TaskStatus> => {
  try {
    const response = await fetch(`${backendUrl}/task-status/${taskId}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error en la respuesta del servidor:", errorText);
      throw new Error(`Error al verificar el estado de la tarea: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error al verificar el estado de la tarea:", error);
    throw error;
  }
};

/**
 * Espera a que una tarea de procesamiento termine y actualiza el estado
 * @param taskId - ID de la tarea a esperar
 * @param setProcessingMessage - Función para actualizar mensajes de procesamiento
 * @returns - Promesa con el resultado final de la tarea
 */
export const waitForTaskCompletion = async (
  taskId: string,
  setProcessingMessage: Dispatch<SetStateAction<string | null>>
): Promise<RecordingResult | null> => {
  let attempts = 0;
  const maxAttempts = 60; // Máximo 2 minutos (con 2 segundos entre intentos)
  
  while (attempts < maxAttempts) {
    attempts++;
    
    try {
      // Esperar 2 segundos entre verificaciones
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const status = await checkTaskStatus(taskId);
      
      if (status.status === "SUCCESS" && status.result) {
        setProcessingMessage("Grabación completada");
        return status.result;
      } else if (status.status === "FAILURE") {
        setProcessingMessage("Error al procesar la grabación");
        throw new Error("La tarea falló en el servidor");
      } else if (status.status === "PROGRESS") {
        // Actualizar mensaje de progreso si está disponible
        const message = status.result?.message || "Procesando...";
        setProcessingMessage(`Procesando grabación: ${message}`);
      }
    } catch (error) {
      console.error(`Error al verificar estado (intento ${attempts}):`, error);
      // Continuar intentando a pesar del error
    }
  }
  
  setProcessingMessage("Tiempo de espera agotado");
  throw new Error("Tiempo de espera agotado al procesar la grabación");
};

/**
 * Procesa una grabación completa desde la subida hasta la combinación
 * @param recordingResult - El resultado de la grabación
 * @param setUploadedAudios - Función para actualizar audios subidos
 * @param setProcessingMessage - Función para actualizar mensajes de procesamiento
 * @param updateFilesList - Función para actualizar la lista de archivos
 */
export const processCompletedRecording = async (
  recordingResult: RecordingResult,
  setUploadedAudios: Dispatch<SetStateAction<UploadedAudio[]>>,
  setProcessingMessage: Dispatch<SetStateAction<string | null>>,
  updateFilesList: () => Promise<void>
) => {
  try {
    // Crear un nombre para el archivo basado en el ID de sesión
    const fileName = `${recordingResult.session_id}_recording.mp3`;
    
    // Actualizar lista de audios subidos
    setUploadedAudios((prevAudios) => [
      ...prevAudios, 
      { 
        name: fileName, 
        status: "Completado",
        audioLink: recordingResult.final_audio_key,
      }
    ]);
    
    // Actualizar lista de archivos
    await updateFilesList();
    
    setProcessingMessage("Grabación completada y disponible");
    
    // Limpiar mensaje después de 3 segundos
    setTimeout(() => setProcessingMessage(null), 3000);
  } catch (error) {
    console.error("Error al procesar la grabación completada:", error);
    setProcessingMessage("Error al finalizar el procesamiento");
    
    // Limpiar mensaje después de 3 segundos
    setTimeout(() => setProcessingMessage(null), 3000);
  }
};


/**
 * Procesa una grabación de streaming completa - VERSIÓN CORREGIDA SIN DUPLICACIÓN
 * @param sessionId - ID de la sesión de grabación
 * @param finalAudioKey - Clave del archivo de audio final
 * @param setUploadedAudios - Función para actualizar la lista de audios
 * @param setProcessingMessage - Función para actualizar mensajes de procesamiento
 * @param updateFilesList - Función para actualizar la lista de archivos
 */
export const processStreamingRecording = async (
  sessionId: string,
  finalAudioKey: string,
  setUploadedAudios: Dispatch<SetStateAction<UploadedAudio[]>>,
  setProcessingMessage: Dispatch<SetStateAction<string | null>>,
  updateFilesList: () => Promise<void>
) => {
  console.log("🎬 processStreamingRecording iniciado:", { sessionId, finalAudioKey });
  
  // Crear un nombre para el archivo basado en el ID de sesión
  const fileName = `${sessionId}_recording.mp3`;
  
  try {
    setProcessingMessage("Finalizando grabación...");
    
    // ✅ VERIFICAR: Solo agregar si no existe ya en la lista
    setUploadedAudios(prev => {
      const exists = prev.some(audio => audio.name === fileName);
      if (exists) {
        console.log("📋 Archivo ya existe en la lista, actualizando estado...");
        return prev.map(audio => 
          audio.name === fileName 
            ? { ...audio, status: "Completado", audioLink: finalAudioKey }
            : audio
        );
      } else {
        console.log("📋 Agregando nuevo archivo a la lista...");
        return [...prev, { 
          name: fileName, 
          status: "Completado",
          audioLink: finalAudioKey
        }];
      }
    });
    
    // Actualizar lista de archivos para mostrar el audio final
    console.log("📁 Actualizando lista de archivos...");
    await updateFilesList();
    
    setProcessingMessage("Grabación completada");
    
    // ✅ NUEVO: Verificar si ya existe transcripción antes de iniciar nueva
    console.log("🔍 Verificando si ya existe transcripción...");
    
    // Esperar un poco para que el backend termine de procesar
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Volver a actualizar la lista para capturar archivos generados por el backend
    await updateFilesList();
    
    // ✅ OPCIONAL: Solo transcribir si no existe transcripción
    // Esto requiere verificar en S3 si ya existe el archivo de transcripción
    const shouldTranscribe = await checkIfTranscriptionNeeded(finalAudioKey);
    
    if (shouldTranscribe) {
      console.log("📝 Iniciando transcripción manual...");
      await startManualTranscription(finalAudioKey, fileName, setUploadedAudios, setProcessingMessage);
    } else {
      console.log("✅ Transcripción ya existe, saltando...");
      // Buscar la transcripción existente y actualizar el estado
      await findExistingTranscription(fileName, setUploadedAudios);
    }
    
    // Actualizar lista final
    await updateFilesList();
    
    // Limpiar mensaje después de 3 segundos
    setTimeout(() => setProcessingMessage(null), 3000);
    
  } catch (error) {
    console.error("🚨 Error al procesar la grabación:", error);
    setUploadedAudios(prev => 
      prev.map(audio => 
        audio.name === fileName ? { ...audio, status: "Error al procesar" } : audio
      )
    );
    setProcessingMessage("Error al procesar la grabación");
    setTimeout(() => setProcessingMessage(null), 3000);
  }
};

/**
 * Verifica si es necesario hacer transcripción manual
 * @param finalAudioKey - Clave del archivo de audio
 * @returns - true si necesita transcripción, false si ya existe
 */
const checkIfTranscriptionNeeded = async (finalAudioKey: string): Promise<boolean> => {
  try {
    // Extraer el nombre base del archivo
    const audioFileName = finalAudioKey.split("/").pop();
    if (!audioFileName) return true;
    
    // Construir posible nombre de transcripción
    const baseNameWithoutExt = audioFileName.replace(/\.[^/.]+$/, "");
    
    // Verificar si existe transcripción en S3
    const response = await fetch(`${backendUrl}/files`);
    if (!response.ok) return true;
    
    const data = await response.json();
    if (!data.files || !Array.isArray(data.files)) return true;
    
    // Buscar archivo de transcripción existente
    const transcriptionExists = data.files.some((file: any) => {
      const fileName = file.Key.split("/").pop() || "";
      return fileName.includes(baseNameWithoutExt) && fileName.endsWith('.txt');
    });
    
    console.log(`🔍 Transcripción ${transcriptionExists ? 'encontrada' : 'no encontrada'} para ${audioFileName}`);
    return !transcriptionExists;
    
  } catch (error) {
    console.error("Error verificando transcripción:", error);
    return true; // En caso de error, intentar transcribir
  }
};

/**
 * Inicia transcripción manual
 */
const startManualTranscription = async (
  finalAudioKey: string,
  fileName: string,
  setUploadedAudios: Dispatch<SetStateAction<UploadedAudio[]>>,
  setProcessingMessage: Dispatch<SetStateAction<string | null>>
) => {
  try {
    // Actualizar estado a procesando transcripción
    setUploadedAudios(prev => 
      prev.map(audio => 
        audio.name === fileName ? { ...audio, status: "Procesando" } : audio
      )
    );
    
    // Extraer solo el nombre del archivo sin la ruta
    const fileNameKey = finalAudioKey.split("/").pop();
    if (!fileNameKey) {
      throw new Error("No se pudo determinar el nombre del archivo");
    }
    
    // Iniciar la transcripción
    const transcribeResponse = await fetch(
      `${backendUrl}/transcribe/${fileNameKey}?segment_duration=60`,
      { method: "POST" }
    );
    
    if (!transcribeResponse.ok) {
      throw new Error(`Error al obtener la transcripción: ${transcribeResponse.statusText}`);
    }
    
    const transcribeData = await transcribeResponse.json();
    setProcessingMessage("Procesando transcripción...");
    
    // Verificar el estado de la transcripción
    const taskId = transcribeData.task_id;
    await checkTranscriptionStatus(taskId, setUploadedAudios, fileName, setProcessingMessage);
    
  } catch (error) {
    console.error("Error en transcripción manual:", error);
    throw error;
  }
};

/**
 * Busca transcripción existente y actualiza el estado
 */
const findExistingTranscription = async (
  fileName: string,
  setUploadedAudios: Dispatch<SetStateAction<UploadedAudio[]>>
) => {
  try {
    // Obtener lista de archivos actualizada
    const response = await fetch(`${backendUrl}/files`);
    if (!response.ok) return;
    
    const data = await response.json();
    if (!data.files || !Array.isArray(data.files)) return;
    
    // Extraer el ID base del nombre del archivo
    const baseId = fileName.replace('_recording.mp3', '');
    
    // Buscar transcripción correspondiente
    const transcriptionFile = data.files.find((file: any) => {
      const key = file.Key.split("/").pop() || "";
      return key.includes(baseId) && key.endsWith('.txt');
    });
    
    if (transcriptionFile) {
      console.log("✅ Encontrada transcripción existente:", transcriptionFile.Key);
      setUploadedAudios(prev => 
        prev.map(audio => 
          audio.name === fileName 
            ? { 
                ...audio, 
                status: "Completado",
                transcriptLink: transcriptionFile.URL
              }
            : audio
        )
      );
    }
    
  } catch (error) {
    console.error("Error buscando transcripción existente:", error);
  }
};