"use client";

import { useEffect, useState, useRef } from "react";

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


export default function MicrophoneComponent() {
  const [isRecording, setIsRecording] = useState(false);
  const [uploadedAudios, setUploadedAudios] = useState<UploadedAudio[]>([]);
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

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

  const uploadAudio = async (audioBlob: Blob, fileName: string) => {
    setUploadedAudios((prev) =>
      prev.map((audio) =>
        audio.name === fileName ? { ...audio, status: "Procesando" } : audio
      )
    );
  
    setProcessingMessage("⏳ Procesando audio...");
  
    const formData = new FormData();
  
    const file = new File([audioBlob], fileName, { type: "audio/wav" });
    formData.append("file", file);
  
    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });
  
      const data = await response.json();
      console.log("API Response:", data);
  
      if (!data.text) {
        console.error("Error: La API no devolvió resultados válidos");
        setUploadedAudios((prev) =>
          prev.map((audio) =>
            audio.name === fileName ? { ...audio, status: "Error al procesar" } : audio
          )
        );
        return;
      }
  
      setUploadedAudios((prev) =>
        prev.map((audio) =>
          audio.name === fileName
            ? {
                ...audio,
                status: "Completado",
                transcriptLink: data.txtDriveLink || "",
                audioLink: data.audioDriveLink || "",
              }
            : audio
        )
      );
    } catch (error) {
      console.error("Error al subir audio:", error);
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
    <div className="flex flex-col items-center justify-center min-h-screen w-full bg-gradient-to-b from-blue-100 to-white p-6">
      <div className="bg-white px-8 py-12 rounded-lg shadow-lg w-full max-w-2xl">
        {/* Grabación de audio */}
        <div className="text-center">
          <p className="text-xl font-medium text-gray-700 mb-4">🎤 Graba un audio</p>
          <div className="flex justify-center">
            {isRecording ? (
              <button
                onClick={stopRecording}
                className="p-6 rounded-full bg-red-500 text-white text-3xl shadow-lg animate-pulse hover:bg-red-600 transition-all"
              >
                ⏹
              </button>
            ) : (
              <button
                onClick={startRecording}
                className="p-6 rounded-full bg-blue-500 text-white text-3xl shadow-lg hover:bg-blue-600 transition-all"
              >
                🎙️
              </button>
            )}
          </div>
          {isRecording && <p className="text-red-500 mt-2">🔴 Grabando...</p>}
        </div>

        {/* Subida de archivos */}
        <div className="mt-8 text-center">
          <p className="text-xl font-medium text-gray-700 mb-4">📂 Sube audios desde tu dispositivo</p>
          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-all p-4">
            <span className="text-4xl">📤</span>
            <span className="text-gray-700 text-sm mt-2">Haz clic aquí o arrastra tus archivos</span>
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
            <h3 className="text-lg font-semibold text-gray-700 mb-4">📁 Archivos Subidos:</h3>
            <ul className="space-y-3">
              {uploadedAudios.map((audio, index) => (
                <li key={index} className="p-4 bg-gray-50 rounded-lg border flex flex-col sm:flex-row justify-between items-center">
                  <div className="flex items-center">
                    <span className="text-gray-700">{audio.name}</span>
                      <span
                        className={`ml-3 px-3 py-1 rounded-full text-sm font-medium ${
                          audio.status === "Pendiente"
                            ? "bg-gray-200 text-gray-700"
                            : audio.status === "Procesando"
                            ? "bg-yellow-200 text-yellow-800"
                            : audio.status === "Completado"
                            ? "bg-green-200 text-green-800"
                            : "bg-red-200 text-red-800" // Manejo del estado "Error al procesar"
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
                      className="mt-2 sm:mt-0 px-4 py-2 bg-green-500 text-white rounded-md shadow-md hover:bg-green-600 transition-all"
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
  );
}