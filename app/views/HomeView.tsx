"use client";

import { useEffect, useState, useRef } from "react";
import { createFFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
declare global {
  interface Window {
    webkitSpeechRecognition: any;
  }
}

interface UploadedAudio {
  name: string;
  status: "Pendiente" | "Procesando" | "Completado" | "Error al procesar";
  transcriptLink?: string;
  audioLink?: string;
}

// 📌 Inicializar FFmpeg solo en el cliente
const ffmpeg = typeof window !== "undefined" ? createFFmpeg({ log: true }) : null;

export default function MicrophoneComponent() {
  const [isRecording, setIsRecording] = useState(false);
  const [uploadedAudios, setUploadedAudios] = useState<UploadedAudio[]>([]);
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // 📌 Cargar FFmpeg solo cuando el componente se monta
  useEffect(() => {
    if (ffmpeg && !ffmpeg.isLoaded()) {
      console.log("🔄 Cargando FFmpeg...");
      ffmpeg.load();
    }
  }, []);

  const startRecording = async () => {
    setIsRecording(true);
    setProcessingMessage("🎙️ Grabando audio...");

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

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
      const fileName = `Grabación-${Date.now()}.wav`;

      const newAudio: UploadedAudio = {
        name: fileName,
        status: "Pendiente",
      };

      setUploadedAudios((prev) => [...prev, newAudio]);
      setProcessingMessage(null);
      await uploadAudio(audioBlob, fileName);
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
    setIsRecording(false);
  };

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

  // 📌 Función para convertir archivos de audio a WAV antes de enviarlos a Whisper
  const convertAudioToWav = async (file: File): Promise<File> => {
    if (!ffmpeg || !ffmpeg.isLoaded()) {
      console.error("❌ FFmpeg no está cargado.");
      return file; // Si FFmpeg no está cargado, enviar el archivo sin convertir
    }

    console.log("🎵 Convirtiendo archivo a WAV:", file.name);

    const inputName = file.name;
    const outputName = "converted-audio.wav";

    ffmpeg.FS("writeFile", inputName, await fetchFile(file));
    await ffmpeg.run("-i", inputName, "-ar", "16000", "-ac", "1", "-b:a", "192k", outputName);

    const data = ffmpeg.FS("readFile", outputName);

    return new File([data.buffer], outputName, { type: "audio/wav" });
  };

  const uploadAudio = async (audioFile: File | Blob, fileName: string) => {
    setUploadedAudios((prev) =>
      prev.map((audio) =>
        audio.name === fileName ? { ...audio, status: "Procesando" } : audio
      )
    );
  
    setProcessingMessage("⏳ Procesando audio...");
  
    try {
      // 📌 1️⃣ Obtener URL firmada desde tu backend
      const urlResponse = await fetch("/api/transcribe");
      const { uploadUrl, fileIdDrive } = await urlResponse.json();
  
      if (!uploadUrl) {
        throw new Error("No se pudo obtener la URL de subida.");
      }
  
      // 📌 2️⃣ Subir el archivo directamente a Google Drive
      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "audio/wav" },
        body: audioFile,
      });
  
      if (!response.ok) {
        throw new Error("Error al subir el archivo.");
      }
  
      console.log("✅ Audio subido a Drive:", fileIdDrive);
      setUploadedAudios((prev) =>
        prev.map((audio) =>
          audio.name === fileName
            ? {
                ...audio,
                status: "Completado",
                audioLink: `https://drive.google.com/file/d/${fileIdDrive}/view`,
              }
            : audio
        )
      );
    } catch (error) {
      console.error("🚨 Error al subir audio:", error);
      setUploadedAudios((prev) =>
        prev.map((audio) =>
          audio.name === fileName ? { ...audio, status: "Error al procesar" } : audio
        )
      );
    } finally {
      setProcessingMessage(null);
    }
  };
  

  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full py-20 bg-[#70D7D9]">
      <div className="bg-white rounded-xl w-full max-w-2xl shadow-lg flex flex-col">
        {/* Grabación de audio */}
        <div className="w-full h-24 rounded-t-xl flex justify-center items-center bg-[#47CACC]">
          <img className="w-40 h-fit" src="https://www.procencia.com/wp-content/uploads/2024/12/procencia.png" alt="Logo de Procencia" />
        </div>
        <div className="px-8 py-12 flex-grow">
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
                  🗣️
                </button>
              )}
            </div>
            {isRecording && <p className="text-red-500 mt-2">🔴 Grabando...</p>}
          </div>
  
          {/* Subida de archivos */}
          <div className="mt-8 text-center flex flex-col justify-center items-center">
            <p className="text-xl font-medium text-gray-700 mb-4">📂 Sube audios desde tu dispositivo</p>
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
                  <li key={index} className="p-4 bg-gray-50 rounded-xl border flex flex-col sm:flex-row justify-between items-center">
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
                        className="mt-2 sm:mt-0 px-4 py-2 bg-[#47CACC] text-white rounded-md shadow-md hover:bg-[#3aa8a9] transition-all"
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