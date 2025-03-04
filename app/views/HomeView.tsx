"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createFFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

// React-Toastify para notificaciones:
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

declare global {
  interface Window {
    webkitSpeechRecognition: any;
  }
}

interface UploadedAudio {
  name: string;
  status: "Pendiente" | "Iniciando" | "Subiendo" | "Completado" | "Error al subir";
  audioDriveLink?: string;
  originalFile?: File;
  transcription?: string;
  progress?: number;          // Nuevo campo
  uploadUrl?: string;         // Nuevo campo
  fileId?: string;            // Nuevo campo
}

// Inicializar FFmpeg solo en el cliente
const ffmpeg = typeof window !== "undefined" ? createFFmpeg({ log: true }) : null;

// Función auxiliar para formatear un número de segundos a mm:ss
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Componente principal
export default function MicrophoneComponent() {
  const [isRecording, setIsRecording] = useState(false);
  const [uploadedAudios, setUploadedAudios] = useState<UploadedAudio[]>([]);
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);

  // Para mostrar la duración de la grabación
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // 1) Cargar FFmpeg si está disponible
  useEffect(() => {
    if (ffmpeg && !ffmpeg.isLoaded()) {
      ffmpeg.load().then(() => console.log("FFmpeg cargado."));
    }
  }, []);

  // 2) Mostrar una NOTIFICACIÓN con botones si el usuario "abandona" la pestaña
  //    mientras está grabando o subiendo.
  useEffect(() => {
    const handleVisibilityChange = () => {
      const haySubidasPendientes = uploadedAudios.some(
        (audio) => audio.status === "Pendiente" || audio.status === "Subiendo"
      );

      // Si el documento se ha vuelto "invisible" (tab oculta o minimizada)
      // y tenemos algo en curso (grabando o subiendo), mostramos la notificación.
      if (document.hidden && (isRecording || haySubidasPendientes)) {
        showExitNotification();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isRecording, uploadedAudios]);

  // ---------------------------------
  //  FUNCIÓN para mostrar la notificación con 2 botones
  // ---------------------------------
  const showExitNotification = () => {
    // Para evitar múltiples notificaciones, podemos hacer algo
    // como toast.isActive(...) si quieres. Simplificamos aquí:
    toast.warn(
      ({ closeToast }) => (
        <div>
          <p className="mb-3">
            ⚠️ Hay una grabación o una subida en curso.
            <br />
            ¿Deseas salir y cancelar todo?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                // Opción 1: Continuar => solo cierra el Toast
                closeToast && closeToast();
              }}
              className="px-4 py-2 bg-green-600 text-white rounded"
            >
              Continuar
            </button>
            <button
              onClick={() => {
                // Opción 2: "Cerrar" => Forzamos a detener grabaciones
                handleForceClose();
                closeToast && closeToast();
              }}
              className="px-4 py-2 bg-red-600 text-white rounded"
            >
              Cerrar
            </button>
          </div>
        </div>
      ),
      {
        // que NO se cierre automáticamente
        autoClose: false,
        closeButton: false,
        // posición, etc.
        position: "top-center",
      }
    );
  };

  // ¿Qué hacemos si deciden "Cerrar" en la notificación?
  // Por ejemplo, podemos forzar a detener la grabación
  // y cancelar subidas pendientes (si quieres).
  const handleForceClose = () => {
    if (isRecording) {
      stopRecording(); // Forzamos a parar
    }

    // Si hay audios "Pendiente" o "Subiendo",
    // podrías marcarlos "Error al subir" o algo así:
    let changed = false;
    const updated = uploadedAudios.map((audio) => {
      if (audio.status === "Pendiente" || audio.status === "Subiendo") {
        changed = true;
        return { ...audio, status: "Error al subir" as const };
      }
      return audio;
    });    
    // (Opcional) Podrías redirigir a otra URL, cerrar la ventana, etc.
    // window.location.href = "https://www.google.com";
  };

  // ---------------------------------
  //  GRABACIÓN DE AUDIO
  // ---------------------------------
  const startRecording = async () => {
    setIsRecording(true);
    setProcessingMessage("Grabando");
    setRecordingSeconds(0); // Reiniciamos la cuenta

    // Iniciar el intervalo para sumar 1 segundo cada vez
    intervalRef.current = setInterval(() => {
      setRecordingSeconds((prev) => prev + 1);
    }, 1000);

    recognitionRef.current = new window.webkitSpeechRecognition();
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.start();

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;
    audioChunksRef.current = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
      const fileName = `Grabación-${Date.now()}.wav`;

      // Agregamos a la lista con status "Pendiente"
      setUploadedAudios((prev) => [
        ...prev,
        {
          name: fileName,
          status: "Pendiente",
          originalFile: blobToFile(audioBlob, fileName),
        },
      ]);

      setProcessingMessage(null);
      setIsRecording(false);
    };

    mediaRecorder.start();
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
  };

  // Convierte Blob a File
  const blobToFile = (theBlob: Blob, fileName: string): File => {
    return new File([theBlob], fileName, { type: theBlob.type, lastModified: Date.now() });
  };

  // ---------------------------------
  //   SUBIR AUDIOS (SELECCIONADOS)
  // ---------------------------------
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const files = Array.from(event.target.files);
      files.forEach((file) => {
        setUploadedAudios((prev) => [
          ...prev,
          {
            name: file.name,
            status: "Pendiente",
            originalFile: file,
          },
        ]);
      });
    }
  };

// ---------------------------------
//   SUBIR A DRIVE (con reintentos)
// ---------------------------------
const uploadAudioToDrive = async (fileItem: UploadedAudio) => {
  if (!fileItem.originalFile) return;

  try {
    let fileToUpload = fileItem.originalFile;
    
    // 1. Convertir a formato compatible si es necesario
    if (ffmpeg && ffmpeg.isLoaded() && !["audio/wav", "audio/mp3"].includes(fileToUpload.type)) {
      setProcessingMessage("Convirtiendo audio...");
      fileToUpload = await convertAudioToWav(fileToUpload);
    }

    // 2. Iniciar sesión de subida
    setUploadedAudios(prev => prev.map(audio => 
      audio.name === fileItem.name ? {
        ...audio,
        status: "Iniciando",
        progress: 0,
        uploadUrl: "",
        fileId: ""
      } : audio
    ));

    // 3. Obtener URL de subida desde nuestra API
    const initResponse = await fetch("/api/upload-audio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: fileToUpload.name,
        fileType: fileToUpload.type
      })
    });

    if (!initResponse.ok) {
      const errorData = await initResponse.json();
      throw new Error(errorData.error || "Error al iniciar subida");
    }

    const { uploadUrl, fileId } = await initResponse.json();

    // 4. Configurar estado para subida
    setUploadedAudios(prev => prev.map(audio => 
      audio.name === fileItem.name ? {
        ...audio,
        status: "Subiendo",
        uploadUrl,
        fileId
      } : audio
    ));

    // 5. Subir en chunks
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
    const fileSize = fileToUpload.size;
    let uploaded = 0;
    
    while (uploaded < fileSize) {
      const chunk = fileToUpload.slice(uploaded, uploaded + CHUNK_SIZE);
      const chunkEnd = uploaded + chunk.size - 1;
      
      let attempts = 0;
      while (attempts < 3) {
        try {
          const res = await fetch(uploadUrl, {
            method: "PUT",
            headers: {
              "Content-Length": chunk.size.toString(),
              "Content-Range": `bytes ${uploaded}-${chunkEnd}/${fileSize}`
            },
            body: chunk
          });

          if (res.status === 308) {
            const rangeHeader = res.headers.get("Range");
            if (rangeHeader) {
              uploaded = parseInt(rangeHeader.split("-")[1]) + 1;
            }
            continue;
          }

          if (!res.ok) throw new Error(`HTTP ${res.status}`);

          uploaded += chunk.size;
          const progress = Math.round((uploaded / fileSize) * 100);
          
          setUploadedAudios(prev => prev.map(audio => 
            audio.name === fileItem.name ? {
              ...audio,
              progress
            } : audio
          ));
          
          break;
        } catch (error) {
          attempts++;
          console.error(`Intento ${attempts} fallido:`, error);
          if (attempts >= 3) throw error;
          await new Promise(resolve => setTimeout(resolve, 2000 * attempts));
        }
      }
      
      if (attempts >= 3) throw new Error("Demasiados intentos fallidos");
    }

    // 6. Finalizar subida
    setUploadedAudios(prev => prev.map(audio => 
      audio.name === fileItem.name ? {
        ...audio,
        status: "Completado",
        progress: 100,
        audioDriveLink: `https://drive.google.com/file/d/${fileId}/view`
      } : audio
    ));

  } catch (error) {
    console.error("Error en subida:", error);
    setUploadedAudios(prev => prev.map(audio => 
      audio.name === fileItem.name ? {
        ...audio,
        status: "Error al subir",
        progress: 0
      } : audio
    ));
  } finally {
    setProcessingMessage(null);
  }
};
  // ---------------------------------
  //   CONVERTIR A WAV (opcional)
  // ---------------------------------
  const convertAudioToWav = async (file: File): Promise<File> => {
    if (!ffmpeg || !ffmpeg.isLoaded()) {
      console.warn("FFmpeg no está cargado. Se subirá sin convertir.");
      return file;
    }
  
    console.log("Convirtiendo a WAV:", file.name);
  
    const inputName = file.name;
    const outputName = "converted-audio.wav";
  
    // Escribimos el archivo de entrada en el sistema de FFmpeg
    ffmpeg.FS("writeFile", inputName, await fetchFile(file));
  
    // Ejecutamos el comando de conversión
    await ffmpeg.run("-i", inputName, "-ar", "16000", "-ac", "1", "-b:a", "192k", outputName);
  
    // Leemos el archivo convertido (Uint8Array)
    const data = ffmpeg.FS("readFile", outputName);
  
    // Convertimos SharedArrayBuffer a ArrayBuffer normal
    const arrayBuffer = data.buffer.slice(0);
  
    // Retornamos un File a partir de ese ArrayBuffer
    return new File([data], outputName, { type: "audio/wav" });  };

  // ---------------------------------
  //   TRANSCRIBIR (opcional)
  // ---------------------------------
  const transcribeAudio = async (fileItem: UploadedAudio) => {
    if (!fileItem.originalFile) return;

    setProcessingMessage("Transcribiendo audio...");

    try {
      const formData = new FormData();
      formData.append("file", fileItem.originalFile);

      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Error desconocido en la transcripción");
      }

      // Guardamos la transcripción
      setUploadedAudios((prev) =>
        prev.map((audio) =>
          audio.name === fileItem.name ? { ...audio, transcription: data.text } : audio
        )
      );
    } catch (error) {
      console.error("Error al transcribir:", error);
    } finally {
      setProcessingMessage(null);
    }
  };

  // ---------------------------------
  //   RENDER
  // ---------------------------------
  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full py-20 bg-[#70D7D9]">
      {/* Contenedor del Toast: importante para mostrar notificaciones */}
      <ToastContainer />

      <div className="bg-white rounded-xl w-full max-w-2xl shadow-lg flex flex-col">
        {/* Encabezado */}
        <div className="w-full h-24 rounded-t-xl flex justify-center items-center bg-[#47CACC]">
          <img
            className="w-40 h-fit"
            src="https://www.procencia.com/wp-content/uploads/2024/12/procencia.png"
            alt="Logo de Procencia"
          />
        </div>

        <div className="px-8 py-12 flex-grow">
          {/* Grabación de audio */}
          <div className="text-center">
            <p className="text-xl font-medium text-gray-700 mb-4">🎤 Graba un audio</p>
            <div className="flex justify-center">
              {isRecording ? (
                <button
                  onClick={stopRecording}
                  className="p-6 rounded-full bg-red-500 text-white text-3xl shadow-md animate-pulse hover:bg-red-600 transition-all"
                >
                  ⏹️
                </button>
              ) : (
                <button
                  onClick={startRecording}
                  className="p-6 rounded-full bg-[#47CACC] text-white text-3xl shadow-md hover:bg-[#3aa8a9] transition-all"
                >
                  🎤
                </button>
              )}
            </div>

            {/* Mostramos los segundos grabados si se está grabando */}
            {isRecording && (
              <p className="text-red-500 mt-2">
                🔴 Grabando... ({formatTime(recordingSeconds)})
              </p>
            )}
          </div>

          {/* Subida de archivos */}
          <div className="mt-8 text-center flex flex-col justify-center items-center">
            <p className="text-xl font-medium text-gray-700 mb-4">📂 Sube audios desde tu dispositivo</p>
            <label className="flex flex-col items-center justify-center w-80 h-32 border-2 border-dashed border-[#47CACC] rounded-lg cursor-pointer hover:bg-gray-50 transition-all p-4">
              <span className="text-4xl text-[#47CACC]">📤</span>
              <span className="text-gray-600 text-sm mt-3">
                Haz clic aquí o arrastra tus archivos
              </span>
              <input
                type="file"
                multiple
                accept="audio/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
          </div>

          {/* Notificación de procesamiento */}
          {processingMessage && (
            <div className="mt-6 p-3 bg-yellow-100 border border-yellow-300 rounded text-yellow-800 text-center">
              {processingMessage}
            </div>
          )}

          {/* Lista de audios */}
          {uploadedAudios.length > 0 && (
            <div className="mt-8">
              <h3 className="text-lg font-semibold text-gray-700 mb-4 pb-2 border-b">
                📁 Archivos
              </h3>
              <ul className="space-y-3">
                {uploadedAudios.map((audio, index) => (
                  <li
                    key={index}
                    className="p-4 bg-gray-50 rounded-xl border flex flex-col sm:flex-row justify-between items-center"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4 w-full">
                      <div className="flex items-center">
                        <span className="text-gray-500 mr-3">{index + 1}.</span>
                        <span className="text-xl mr-3">🎵</span>
                        <span className="text-gray-700 font-semibold">{audio.name}</span>
                      </div>

                      <div>
                        <span
                          className={`inline-block mt-2 sm:mt-0 px-3 py-1 rounded-full text-sm font-medium ${
                            audio.status === "Pendiente"
                              ? "bg-gray-200 text-gray-700"
                              : audio.status === "Subiendo"
                              ? "bg-yellow-200 text-yellow-800"
                              : audio.status === "Completado"
                              ? "bg-green-200 text-green-800"
                              : "bg-red-200 text-red-800"
                          }`}
                        >
                          {audio.status}
                        </span>
                      </div>
                    </div>

                    {/* Botón Subir a Drive si está "Pendiente" */}
                    {audio.status === "Pendiente" && audio.originalFile && (
                      <button
                        onClick={() => uploadAudioToDrive(audio)}
                        className="mt-2 sm:mt-0 px-4 py-2 bg-[#47CACC] text-white rounded-full shadow-md hover:bg-[#3aa8a9] transition-all"
                      >
                        Subir archivo
                      </button>
                    )}

                    {/* Link al audio en Drive */}
                    {audio.status === "Completado" && audio.audioDriveLink && (
                      <a
                        href={audio.audioDriveLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 sm:mt-0 px-4 py-2 bg-blue-600 text-white rounded-full shadow-md hover:bg-blue-700 transition-all"
                      >
                        Ver archivo
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
