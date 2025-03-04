"use client";

import { useEffect, useState, useRef } from "react";
import { createFFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import Image from "next/image";

declare global {
  interface Window {
    webkitSpeechRecognition: any;
  }
}

interface UploadedAudio {
  name: string;
  status: "Pendiente" | "Subiendo" | "Completado" | "Error al subir";
  audioDriveLink?: string;
  originalFile?: File;
  transcription?: string;
}

// Inicializar FFmpeg solo en el cliente
const ffmpeg = typeof window !== "undefined" ? createFFmpeg({ log: true }) : null;

export default function MicrophoneComponent() {
  const [isRecording, setIsRecording] = useState(false);
  const [uploadedAudios, setUploadedAudios] = useState<UploadedAudio[]>([]);
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // 1) Cargar FFmpeg si está disponible
  useEffect(() => {
    if (ffmpeg && !ffmpeg.isLoaded()) {
      ffmpeg.load().then(() => console.log("FFmpeg cargado."));
    }
  }, []);

  // 2) Interceptar recarga/cierre de la pestaña si hay subidas pendientes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const haySubidasPendientes = uploadedAudios.some(
        (audio) => audio.status === "Pendiente" || audio.status === "Subiendo"
      );
      if (haySubidasPendientes) {
        e.preventDefault();
        e.returnValue =
          "Tienes subidas pendientes. Si sales ahora, se perderá el progreso y no se completará la subida.";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [uploadedAudios]);

  // ---------------------------------
  //  GRABACIÓN DE AUDIO
  // ---------------------------------
  const startRecording = async () => {
    setIsRecording(true);
    setProcessingMessage("Grabando audio...");

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

    // Si necesitas convertir a WAV, aquí lo harías:
    let fileToUpload = fileItem.originalFile;
    if (ffmpeg && ffmpeg.isLoaded() && !["audio/wav", "audio/mp3"].includes(fileToUpload.type)) {
      fileToUpload = await convertAudioToWav(fileToUpload);
    }

    // Cambiamos status a "Subiendo"
    setUploadedAudios((prev) =>
      prev.map((audio) =>
        audio.name === fileItem.name ? { ...audio, status: "Subiendo" } : audio
      )
    );

    setProcessingMessage("Subiendo audio a Drive...");

    // Reintentar indefinidamente
    let attempts = 0;
    while (true) {
      try {
        attempts++;

        const formData = new FormData();
        formData.append("file", fileToUpload);

        const res = await fetch("/api/upload-audio", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || "Error desconocido al subir");
        }

        const data = await res.json();

        // Subida exitosa
        setUploadedAudios((prev) =>
          prev.map((audio) =>
            audio.name === fileItem.name
              ? { ...audio, status: "Completado", audioDriveLink: data.audioDriveLink }
              : audio
          )
        );

        setProcessingMessage(null);
        return; // Salimos del while(true) al completar

      } catch (error) {
        console.error(`Error al subir (intento #${attempts}):`, error);
        // Esperamos 3 segundos y reintentamos
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
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

    ffmpeg.FS("writeFile", inputName, await fetchFile(file));
    await ffmpeg.run("-i", inputName, "-ar", "16000", "-ac", "1", "-b:a", "192k", outputName);

    const data = ffmpeg.FS("readFile", outputName);
    return new File([data.buffer], outputName, { type: "audio/wav" });
  };

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
      <div className="bg-white rounded-xl w-full max-w-2xl shadow-lg flex flex-col">
        {/* Encabezado */}
        <div className="w-full h-24 rounded-t-xl flex justify-center items-center bg-[#47CACC]">
            <Image
          src="https://www.procencia.com/wp-content/uploads/2024/12/procencia.png"
          alt="Logo de Procencia"
          width={160}        // Ajusta el width según tu diseño
          height={80}        // Ajusta el height según tu diseño
          className="w-40 h-auto"
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
                        className="mt-2 sm:mt-0 px-4 py-2 bg-[#47CACC] text-white rounded-md shadow-md hover:bg-[#3aa8a9] transition-all"
                      >
                        Subir a Drive
                      </button>
                    )}

                    {/* Link al audio en Drive */}
                    {audio.status === "Completado" && audio.audioDriveLink && (
                      <a
                        href={audio.audioDriveLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 sm:mt-0 px-4 py-2 bg-blue-600 text-white rounded-md shadow-md hover:bg-blue-700 transition-all"
                      >
                        Ver en Drive
                      </a>
                    )}

                    {/* Botón para transcribir (opcional) */}
                    {audio.status === "Completado" && audio.originalFile && (
                      <button
                        onClick={() => transcribeAudio(audio)}
                        className="mt-2 sm:mt-0 px-4 py-2 bg-green-600 text-white rounded-md shadow-md hover:bg-green-700 transition-all"
                      >
                        Transcribir
                      </button>
                    )}

                    {/* Mostrar la transcripción si la hay */}
                    {audio.transcription && (
                      <div className="mt-2 text-sm text-gray-700 bg-gray-100 p-2 rounded">
                        <strong>Transcripción:</strong> {audio.transcription}
                      </div>
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
