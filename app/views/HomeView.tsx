"use client";

import { useState, useRef, useEffect } from "react";
import axios from "axios";
import toast from 'react-hot-toast';

interface UploadedAudio {
  name: string;
  status: "Pendiente" | "Procesando" | "Completado" | "Error al procesar";
  transcriptLink?: string;
  audioLink?: string;
}

export default function MicrophoneComponent() {
  const [isRecording, setIsRecording] = useState(false);
  const [uploadedAudios, setUploadedAudios] = useState<UploadedAudio[]>([]);
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);
  const [showExitModal, setShowExitModal] = useState(false);
  const [exitAction, setExitAction] = useState<(() => void) | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // URL del backend
  const backendUrl = "/api";

  useEffect(() => {
    // Detectar intento de salir en móviles y escritorio
    const handleExitAttempt = (event: Event) => {
      event.preventDefault();
      setShowExitModal(true);
      return false;
    };

    // Detectar cuando el usuario cambia de pestaña o minimiza la app
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        setShowExitModal(true);
      }
    };

    // Detectar intento de cerrar la página en móviles y escritorio
    window.addEventListener("pagehide", handleExitAttempt);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", handleExitAttempt);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const handleExit = () => {
    if (exitAction) {
      exitAction(); // Ejecuta la acción de salida
      setShowExitModal(false);
    }
  };

  const cancelExit = () => setShowExitModal(false);

  // Función para iniciar la grabación
  const startRecording = async () => {
    setIsRecording(true);
    setProcessingMessage("🎙️ Grabando audio...");
    setRecordingDuration(0);
    toast.success("Grabación iniciada");
  
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
  
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
  
      mediaRecorder.onstop = async () => {
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
        }
      
        // Cerrar el stream de audio
        stream.getTracks().forEach((track) => track.stop());
      
        // Verificar si hay datos grabados
        if (audioChunksRef.current.length === 0) {
          console.error("No se grabó ningún audio.");
          toast.error("No se grabó ningún audio. Intenta de nuevo.");
          return;
        }
      
        // Crear el Blob y el archivo
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        console.log("Blob grabado:", audioBlob);
      
        const fileName = `Record-${Date.now()}.webm`;
        const audioFile = new File([audioBlob], fileName, { type: "audio/webm" });
        console.log("Archivo creado:", audioFile);
      
        // Agregar el archivo a la lista de audios subidos con estado "Pendiente"
        const newAudio: UploadedAudio = {
          name: fileName,
          status: "Pendiente",
        };
        setUploadedAudios((prev) => [...prev, newAudio]);
      
        // Subir el archivo
        await uploadAudio(audioFile, fileName);
  
        // Cerrar el stream de audio
        stream.getTracks().forEach((track) => track.stop());
  
        // Verificar si hay datos grabados
        if (audioChunksRef.current.length === 0) {
          console.error("No se grabó ningún audio.");
          toast.error("No se grabó ningún audio. Intenta de nuevo.");
          return;
        }
        // Subir el archivo
        await uploadAudio(audioFile, fileName);
      };
  
      mediaRecorder.start(); // Iniciar la grabación sin chunks
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error("Error al iniciar la grabación:", error);
      toast.error("Error al iniciar la grabación. Intenta de nuevo.");
      setIsRecording(false);
    }
  };
  
  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    toast.success("Grabación detenida");
  };

  // Función para manejar la subida de archivos
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const files = Array.from(event.target.files);
      files.forEach(async (file) => {
        const newAudio: UploadedAudio = {
          name: file.name,
          status: "Pendiente",
        };

        setUploadedAudios((prev) => [...prev, newAudio]);
        await uploadAudio(file, file.name);
      });
    }
  };

  const uploadAudio = async (audioFile: File, fileName: string) => {
    const formData = new FormData();
    formData.append("file", audioFile);
  
    try {
      console.log("📤 Subiendo archivo...");
      setProcessingMessage("Subiendo archivo...");
  
      // Subir el archivo al backend
      const uploadResponse = await fetch(`${backendUrl}/upload`, {
        method: "POST",
        body: formData,
      });
  
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
      setProcessingMessage("Transcribiendo audio...");
  
      const transcribeResponse = await fetch(
        `${backendUrl}/transcribe/${fileNameKey}?segment_duration=${segmentDuration}`,
        {
          method: "POST",
        }
      );
  
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
      setProcessingMessage(null);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full py-20 bg-[#70D7D9]">
      {/* MODAL DE CONFIRMACIÓN */}
      {showExitModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-10">
          <div className="bg-white px-8 py-14 rounded-xl shadow-xl text-center max-w-md w-full flex flex-col items-center">
            <h2 className="text-2xl font-bold text-red-600 mb-4">⚠️ Advertencia</h2>
            <p className="text-gray-700 text-lg leading-relaxed mb-4">
              Tienes procesos activos en este momento.  
              Si sales ahora, <b>perderás todo tu progreso</b>.  
              <br /><br />
              ¿Seguro que quieres salir de la página?
            </p>
            <div className="mt-6 flex justify-around sm:flex-row w-full gap-4">
              <button 
                onClick={() => { setShowExitModal(false); window.location.reload(); }} 
                className="bg-red-500 hover:bg-red-600 text-white font-semibold px-6 py-3 rounded w-full sm:w-auto transition-all">
                Salir 😟
              </button>
              <button 
                onClick={() => setShowExitModal(false)} 
                className="bg-green-500 hover:bg-green-600 text-white font-semibold px-6 py-3 rounded w-full sm:w-auto transition-all">
                Continuar el proceso
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="bg-white rounded-xl w-full max-w-3xl shadow-lg flex flex-col">
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
            <p className="text-xl font-extrabold text-gray-700 mb-8">🎤 Graba un audio</p>
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
                  🗣️
                </button>
              )}
            </div>
            {isRecording && (
              <p className="text-red-500 mt-2">
                🔴 Grabando... {recordingDuration}s
              </p>
            )}
          </div>

          <div className="mt-8 text-center flex flex-col justify-center items-center">
            <div className="relative">
              {/* Texto "- o -" con estilo y líneas usando pseudoelementos */}
              <div className="relative inline-flex items-center justify-center w-16 h-16  text-2xl font-extrabold text-gray-700  transition-transform duration-200 before:absolute before:top-1/2 before:left-[-33%] before:w-6/12 before:h-px before:bg-black before:transform before:-translate-y-1/2 after:absolute after:top-1/2 after:right-[-33%] after:w-6/12 after:h-px after:bg-black after:transform after:-translate-y-1/2">
                O 
              </div>
            </div>
          </div>
          {/* Subida de archivos */}
          <div className="mt-8 text-center flex flex-col justify-center items-center">
            <p className="text-xl font-extrabold text-gray-700 mb-8">📂 Sube audios desde tu dispositivo</p>
            <label className="flex flex-col items-center justify-center w-80 h-32 border-2 border-dashed border-[#47CACC] rounded-lg cursor-pointer hover:bg-gray-50 transition-all p-4">
              <span className="text-4xl text-[#47CACC]">📤</span>
              <span className="text-gray-600 text-sm mt-3">Haz clic aquí o arrastra tus archivos</span>
              <input type="file" multiple accept="audio/*" className="hidden" onChange={handleFileChange} />
            </label>
          </div>

          {/* Notificación de procesamiento */}
          {processingMessage && (
            <div className="mt-6 p-3 bg-yellow-100 border border-yellow-300 rounded text-yellow-800 text-center">
              {processingMessage}
            </div>
          )}

          {/* Lista de audios subidos */}
          {uploadedAudios.length > 0 && (
            <div className="mt-8">
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}