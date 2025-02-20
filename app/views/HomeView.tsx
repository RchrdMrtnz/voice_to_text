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

// 📌 Inicializar FFmpeg (solo en cliente)
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

    let convertedFile = audioFile instanceof File ? audioFile : new File([audioFile], fileName, { type: "audio/wav" });

    // 📌 Convertir a WAV si el archivo no es MP3 o WAV
    if (!["audio/wav", "audio/mp3"].includes(convertedFile.type)) {
      convertedFile = await convertAudioToWav(convertedFile);
    }

    const formData = new FormData();
    formData.append("file", convertedFile);

    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      console.log("API Response:", data);

      if (!data.text) {
        console.error("Error: La API no devolvió resultados válidos");
        return;
      }

      setUploadedAudios((prev) =>
        prev.map((audio) =>
          audio.name === convertedFile.name
            ? { ...audio, status: "Completado", transcriptLink: data.txtDriveLink, audioLink: data.audioDriveLink }
            : audio
        )
      );
    } catch (error) {
      console.error("Error al subir audio:", error);
    } finally {
      setProcessingMessage(null);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full bg-gradient-to-b from-blue-100 to-white p-6">
      <div className="bg-white px-8 py-12 rounded-lg shadow-lg w-full max-w-2xl">
        <div className="text-center">
          <p className="text-xl font-medium text-gray-700 mb-4">🎤 Graba un audio</p>
          <div className="flex justify-center">
            {isRecording ? (
              <button onClick={stopRecording} className="p-6 rounded-full bg-red-500 text-white text-3xl shadow-lg animate-pulse hover:bg-red-600 transition-all">
                ⏹
              </button>
            ) : (
              <button onClick={startRecording} className="p-6 rounded-full bg-blue-500 text-white text-3xl shadow-lg hover:bg-blue-600 transition-all">
                🎙️
              </button>
            )}
          </div>
          {isRecording && <p className="text-red-500 mt-2">🔴 Grabando...</p>}
        </div>

        {/* Subida de archivos */}
        <div className="mt-8 text-center">
          <p className="text-xl font-medium text-gray-700 mb-4">📂 Sube audios desde tu dispositivo</p>
          
          {/* Botón para abrir el selector de archivos */}
          <button
            onClick={() => document.getElementById("fileInput")?.click()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg shadow-md hover:bg-blue-600 transition-all"
          >
            📤 Seleccionar Archivo
          </button>

          {/* Input oculto para seleccionar archivos */}
          <input
            id="fileInput"
            type="file"
            multiple
            accept="audio/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>


        {processingMessage && (
          <div className="mt-6 p-3 bg-yellow-100 border border-yellow-300 rounded text-yellow-800 text-center">
            {processingMessage}
          </div>
        )}
      </div>
    </div>
  );
}
