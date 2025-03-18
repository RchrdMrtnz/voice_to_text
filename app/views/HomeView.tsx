"use client";

import { useState, useRef, useEffect, MutableRefObject  } from "react";
import { uploadAudio, getFilesFromS3 } from '../api/ApiService';
import toast from 'react-hot-toast';
import ExitModal from './ExitModal'; // Importa el componente ExitModal
import RecordRTC from 'recordrtc';

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

export default function MicrophoneComponent() {
  const [isClient, setIsClient] = useState(false);
  const mediaRecorderRef = useRef<RecordRTC | null>(null); 
  const [isRecording, setIsRecording] = useState(false);
  const [uploadedAudios, setUploadedAudios] = useState<UploadedAudio[]>([]);
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);
  const [showExitModal, setShowExitModal] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [s3Files, setS3Files] = useState<S3File[]>([]);
  const [groupedFiles, setGroupedFiles] = useState<
    Record<string, { audio: S3File | null; transcript: S3File | null }>
  >({});

  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  // Obtener los archivos de S3 al cargar la página
  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const files = await getFilesFromS3();
        setS3Files(files);
        const grouped = groupFiles(files);
        setGroupedFiles(grouped);
      } catch (error) {
        console.error("🚨 Error al obtener los archivos de S3:", error);
        toast.error("Error al obtener los archivos de S3. Intenta de nuevo.");
      }
    };
  
    fetchFiles();
  }, []);

  // Manejar eventos de salida
  useEffect(() => {
    const handleExitAttempt = (event: Event) => {
      event.preventDefault();
      setShowExitModal(true);
      return false;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        setShowExitModal(true);
      }
    };

    window.addEventListener("pagehide", handleExitAttempt);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", handleExitAttempt);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Función para iniciar la grabación
  useEffect(() => {
    setIsClient(typeof window !== "undefined");
  }, []);

  const startRecording = async () => {
    if (!isClient) return; // Evita ejecutar código en el servidor

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new RecordRTC(stream, {
        type: "audio",
        mimeType: "audio/wav",
        recorderType: RecordRTC.StereoAudioRecorder,
      });

      recorder.startRecording();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);

      // Iniciar temporizador de grabación
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error("Error al grabar:", error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stopRecording(() => {
        const audioBlob = mediaRecorderRef.current?.getBlob();
        if (audioBlob) {
          const audioURL = URL.createObjectURL(audioBlob);
          console.log("Audio disponible en:", audioURL);
        }
      });
    }

    setIsRecording(false);
    clearInterval(recordingTimerRef.current!);
    setRecordingDuration(0);
  };

  if (!isClient) return null; // No renderizar nada en el servidor

  // Función para manejar la subida de archivos
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const files = Array.from(event.target.files);
  
      files.forEach(async (file) => {
        const uniqueId = Date.now();
        const uniqueFileName = `${uniqueId}_${file.name}`;
  
        // Agregar el archivo a la lista de audios subidos con estado "Pendiente"
        setUploadedAudios((prev) => [
          ...prev,
          { name: uniqueFileName, status: "Pendiente" },
        ]);
  
        try {
          // Subir el archivo
          await uploadAudio(
            file,
            uniqueFileName,
            setUploadedAudios,
            setProcessingMessage,
            setGroupedFiles // Pasar setGroupedFiles como parámetro
          );
        } catch (error) {
          console.error("Error al subir el archivo:", error);
          toast.error("Error al subir el archivo. Intenta de nuevo.");
  
          // Actualizar el estado del archivo a "Error al procesar"
          setUploadedAudios((prev) =>
            prev.map((audio) =>
              audio.name === uniqueFileName
                ? { ...audio, status: "Error al procesar" }
                : audio
            )
          );
        }
      });
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full py-20 bg-[#70D7D9]">
      {/* Modal de confirmación */}
      <ExitModal
        show={showExitModal}
        onClose={() => setShowExitModal(false)}
        onConfirm={() => {
          setShowExitModal(false);
          window.location.reload();
        }}
      />

      {/* Contenedor principal */}
      <main className="bg-white rounded-xl w-full max-w-3xl shadow-lg flex flex-col">
        {/* Header con logo */}
        <header className="w-full h-24 rounded-t-xl flex justify-center items-center bg-[#47CACC]">
          <img
            className="w-40 h-full object-contain"
            src="https://www.procencia.com/wp-content/uploads/2024/12/procencia.png"
            alt="Logo de Procencia"
          />
        </header>

        {/* Contenido principal */}
        <section className="px-8 py-12 flex-grow">
          {/* Grabación de audio */}
          <article className="text-center">
            <h1 className="text-xl font-extrabold text-gray-700 mb-8">🎤 Graba un audio</h1>
            <div className="flex justify-center">
              {isRecording ? (
                <button
                  onClick={stopRecording}
                  className="p-6 rounded-full bg-red-500 text-white text-3xl shadow-md animate-pulse hover:bg-red-600 transition-all"
                  aria-label="Detener grabación"
                >
                  ⏹️
                </button>
              ) : (
                <button
                  onClick={startRecording}
                  className="p-6 rounded-full bg-[#47CACC] text-white shadow-md hover:bg-[#3aa8a9] transition-all"
                  aria-label="Iniciar grabación"
                >
                  <img
                    src="https://test-api-bot.s3.us-east-1.amazonaws.com/microphone-solid+(1).svg"
                    className="w-6 aspect-square"
                    alt="Icono de micrófono"
                  />
                </button>
              )}
            </div>
            {isRecording && (
              <p className="text-red-500 mt-2" aria-live="polite">
                🔴 Grabando... {recordingDuration}s
              </p>
            )}
          </article>

          {/* Separador visual */}
          <div className="mt-8 text-center flex flex-col justify-center items-center">
            <div className="relative">
              <div className="relative inline-flex items-center justify-center w-16 h-16 text-2xl font-extrabold text-gray-700 transition-transform duration-200 before:absolute before:top-1/2 before:left-[-33%] before:w-6/12 before:h-px before:bg-black before:transform before:-translate-y-1/2 after:absolute after:top-1/2 after:right-[-33%] after:w-6/12 after:h-px after:bg-black after:transform after:-translate-y-1/2">
                O
              </div>
            </div>
          </div>

          {/* Subida de archivos */}
          <article className="mt-8 text-center flex flex-col justify-center items-center">
            <h2 className="text-xl font-extrabold text-gray-700 mb-8">📂 Sube audios desde tu dispositivo</h2>
            <label className="flex flex-col items-center justify-center w-80 h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 transition-all p-4">
              <span className="text-4xl text-[#47CACC]">📤</span>
              <span className="text-gray-600 text-sm mt-3">Haz clic aquí o arrastra tus archivos</span>
              <input
                type="file"
                multiple
                accept="audio/*"
                className="hidden"
                onChange={handleFileChange}
                aria-label="Subir archivos de audio"
              />
            </label>
          </article>

          {/* Notificación de procesamiento */}
          {processingMessage && (
            <div
              role="alert"
              className="mt-6 p-3 bg-yellow-100 border border-yellow-300 rounded text-yellow-800 text-center"
            >
              {processingMessage}
            </div>
          )}

          {/* Lista de audios subidos */}
          {uploadedAudios.length > 0 && (
            <article className="mt-8">
              <h3 className="text-lg font-semibold text-gray-700 mb-4 pb-2 border-b">📁 Archivos Subidos</h3>
              <ul className="space-y-3">
                {uploadedAudios.map((audio, index) => (
                  <li
                    key={index}
                    className="p-4 bg-gray-50 rounded-xl border flex flex-col sm:flex-row justify-between items-center"
                  >
                    <div className="flex items-center">
                      <span className="text-gray-500 mr-3">{index + 1}.</span>
                      <span className="text-xl mr-3">🎵</span>
                      <span className="text-gray-700">{audio.name}</span>
                      <span
                        className={`ml-3 px-3 py-1 rounded-full text-sm font-medium ${
                          audio.status === "Pendiente"
                            ? "bg-gray-200 text-gray-700"
                            : audio.status === "Procesando"
                            ? "bg-yellow-200 text-yellow-800"
                            : audio.status === "Completado"
                            ? "bg-green-200 text-green-800"
                            : "bg-red-200 text-red-800"
                        }`}
                      >
                        {audio.status}
                      </span>
                    </div>

                    {/* Botón para descargar transcripción */}
                    {audio.status === "Completado" && audio.transcriptLink && (
                      <a
                        href={audio.transcriptLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 sm:mt-0 px-4 py-2 bg-[#47CACC] text-white rounded-full shadow-md hover:bg-[#3aa8a9] transition-all"
                      >
                        📥 Descargar TXT
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </article>
          )}

          {/* Archivos totales en S3 */}
          {Object.entries(groupedFiles).length > 0 && (
            <article className="mt-8">
              <h3 className="text-lg font-semibold text-gray-700 mb-4 pb-2 border-b">📁 Archivos del Usuario</h3>
              <ul className="space-y-3">
              {Object.entries(groupedFiles).map(([fileId, files], index) => (
                  <li
                    key={index}
                    className="p-4 bg-gray-50 rounded-xl border flex flex-col sm:flex-row justify-between items-start sm:items-center"
                  >
                    <div className="flex flex-col">
                      <span className="text-gray-700 font-medium">
                        {files.audio ? files.audio.Key.split("/").pop() : files.transcript?.Key.split("/").pop()}
                      </span>
                      {files.audio && (
                        <span className="text-sm text-gray-500">
                          Tamaño: {(files.audio.Size / 1024).toFixed(2)} KB
                        </span>
                      )}
                      {files.audio && (
                        <span className="text-sm text-gray-500">
                          Última modificación: {new Date(files.audio.LastModified).toLocaleString()}
                        </span>
                      )}
                    </div>

                    {/* Botones de descarga */}
                    <div className="mt-2 sm:mt-0 flex flex-wrap gap-2">
                      {files.audio && (
                        <a
                          href={files.audio.URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-2 bg-[#3fb1b3] text-white rounded-full shadow-md hover:bg-[#3aa8a9] transition-all flex items-center"
                        >
                          🎧 Audio
                        </a>
                      )}

                      {files.transcript && (
                        <a
                          href={files.transcript.URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-2 bg-[#3fb1b3] text-white rounded-full shadow-md hover:bg-[#3aa8a9] transition-all flex items-center"
                        >
                          📄 Transcripción
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          )}
        </section>
      </main>
    </div>
  );
}