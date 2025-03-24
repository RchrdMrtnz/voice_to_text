"use client";

import { useState, useEffect } from "react";
import { uploadAudio, getFilesFromS3, generateSummary  } from '../api/ApiService';
import toast from 'react-hot-toast';
import ExitModal from './ExitModal';
import dynamic from "next/dynamic";

const AudioRecorder = dynamic(() => import("./AudioRecorder"), {
  ssr: false, // Desactiva la renderización en el servidor
});
interface UploadedAudio {
  name: string;
  status: "Pendiente" | "Procesando" | "Completado" | "Error al procesar";
  transcriptLink?: string;
  audioLink?: string;
  summary?: string;
}

interface S3File {
  Key: string;
  URL: string;
  Size: number;
  LastModified: string;
  ContentType: string;
}

export default function MicrophoneComponent() {
  const [uploadedAudios, setUploadedAudios] = useState<UploadedAudio[]>([]);
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);
  const [showExitModal, setShowExitModal] = useState(false);
  const [s3Files, setS3Files] = useState<S3File[]>([]);
  const [groupedFiles, setGroupedFiles] = useState<
    Record<string, { audio: S3File | null; transcript: S3File | null }>
  >({});
  const [summary, setSummary] = useState<{ mensaje: string; resumen: string; resumen_url: string; resumen_s3_key: string } | null>(null);
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

  // Función para manejar la grabación detenida
  const handleRecordingStop = async (audioBlob: Blob) => {
    const uniqueId = Date.now();
    const uniqueFileName = `${uniqueId}_recording.wav`;

    // Agregar el archivo a la lista de audios subidos con estado "Pendiente"
    setUploadedAudios((prev) => [
      ...prev,
      { name: uniqueFileName, status: "Pendiente" },
    ]);

    try {
      // Subir el archivo
      await uploadAudio(
        new File([audioBlob], uniqueFileName, { type: "audio/wav" }),
        uniqueFileName,
        setUploadedAudios,
        setProcessingMessage,
        setGroupedFiles
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
  };

  const handleGenerateSummary = async (s3Key: string) => {
    try {
      setProcessingMessage("Generando resumen...");
      const summaryData = await generateSummary(s3Key);
      setSummary(summaryData);
      setProcessingMessage(null);
      toast.success("Resumen generado con éxito");
    } catch (error) {
      console.error("🚨 Error al generar el resumen:", error);
      setProcessingMessage("Error al generar el resumen");
      toast.error("Error al generar el resumen. Intenta de nuevo.");
    }
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


  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full py-10 bg-[#70D7D9]">
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
      <main className="bg-white rounded-xl w-full max-w-3xl shadow-lg flex flex-col mx-4">
        {/* Header con logo */}
        <header className="w-full h-24 rounded-t-xl flex justify-center items-center bg-[#47CACC]">
          <img
            className="w-40 h-full object-contain"
            src="https://www.procencia.com/wp-content/uploads/2024/12/procencia.png"
            alt="Logo de Procencia"
          />
        </header>
  
        {/* Contenido principal */}
        <section className="px-4 sm:px-8 py-8 sm:py-12 flex-grow">
          {/* Usar el componente AudioRecorder */}
          <AudioRecorder onRecordingStop={handleRecordingStop} />
  
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
            <label className="flex flex-col items-center justify-center w-full sm:w-80 h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 transition-all p-4">
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
                    className="p-4 bg-gray-50 rounded-xl border flex flex-col sm:flex-row justify-between items-center gap-4"
                  >
                    {/* Contenedor principal (nombre y estado) */}
                    <div className="flex flex-col sm:flex-row items-center gap-2 flex-1 min-w-0 w-full sm:w-auto">
                      <span className="text-gray-500">{index + 1}.</span>
                      <span className="text-xl">🎵</span>
                      {/* Nombre del archivo */}
                      <span className="text-gray-700 text-sm truncate flex-1 min-w-0 w-full sm:w-auto text-center sm:text-left">
                        {audio.name}
                      </span>
                      {/* Estado del archivo */}
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
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

                    {/* Botones de acción (descargar y generar resumen) */}
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                      {/* Botón para descargar transcripción (solo visible si está completado) */}
                      {audio.status === "Completado" && audio.transcriptLink && (
                        <a
                          href={audio.transcriptLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full sm:w-auto px-4 py-2 bg-[#47CACC] text-white rounded-full shadow-md hover:bg-[#3aa8a9] transition-all text-center"
                        >
                          📥 Descargar TXT
                        </a>
                      )}

                      {/* Botón para generar resumen (solo visible si está completado) */}
                      {audio.status === "Completado" && audio.transcriptLink && (
                        <button
                        onClick={() => {
                          const s3Key = audio.transcriptLink?.split('amazonaws.com/')[1] || '';
                          handleGenerateSummary(s3Key);
                        }}
                          className="w-full sm:w-auto px-4 py-2 bg-[#47CACC] text-white rounded-full shadow-md hover:bg-[#3aa8a9] transition-all text-center"
                        >
                          📝 Generar Resumen
                        </button>
                      )}
                    </div>

                    {/* Mostrar el resumen generado (si existe) */}
                    {audio.summary && (
                      <div className="w-full mt-4 p-4 bg-gray-100 rounded-lg border border-gray-200">
                        <h4 className="text-md font-semibold text-gray-700 mb-2">Resumen:</h4>
                        <p className="text-gray-600 text-sm">{audio.summary}</p>
                      </div>
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
                      className="p-4 bg-gray-50 rounded-xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
                    >
                      {/* Contenedor del nombre y detalles del archivo */}
                      <div className="flex flex-col w-full sm:w-auto flex-1 min-w-0">
                        {/* Nombre del archivo */}
                        <span className="text-gray-700 font-medium truncate">
                          {files.audio ? files.audio.Key.split("/").pop() : files.transcript?.Key.split("/").pop()}
                        </span>

                        {/* Detalles del archivo (tamaño y última modificación) */}
                        {files.audio && (
                          <>
                            <span className="text-sm text-gray-500 truncate">
                              Tamaño: {(files.audio.Size / 1024).toFixed(2)} KB
                            </span>
                            <span className="text-sm text-gray-500 truncate">
                              Última modificación: {new Date(files.audio.LastModified).toLocaleString()}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Botones de descarga */}
                      <div className="w-full sm:w-auto flex flex-wrap gap-2">
                        {files.audio && (
                          <a
                            href={files.audio.URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full sm:w-auto px-3 py-2 bg-[#3fb1b3] text-white rounded-full shadow-md hover:bg-[#3aa8a9] transition-all text-center whitespace-nowrap"
                          >
                            🎧 Audio
                          </a>
                        )}

                        {files.transcript && (
                          <a
                            href={files.transcript.URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full sm:w-auto px-3 py-2 bg-[#3fb1b3] text-white rounded-full shadow-md hover:bg-[#3aa8a9] transition-all text-center whitespace-nowrap"
                          >
                            📄 Transcripción
                          </a>
                        )}

                        {/* Botón para generar resumen */}
                        {files.transcript && (
                          <button
                            onClick={() => handleGenerateSummary(files.transcript!.Key)}
                            className="w-full sm:w-auto px-3 py-2 bg-[#3fb1b3] text-white rounded-full shadow-md hover:bg-[#3aa8a9] transition-all text-center whitespace-nowrap"
                          >
                            📝  Generar Resumen
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </article>
            )}

          {/* Mostrar el resumen generado */}
          {summary && (
            <article className="mt-8">
              <h3 className="text-lg font-semibold text-gray-700 mb-4 pb-2 border-b">📝 Resumen Generado</h3>
              <div className="p-4 bg-gray-50 rounded-xl border">
                <p className="text-gray-700">{summary.resumen}</p>
                <a
                  href={summary.resumen_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-block px-4 py-2 bg-[#47CACC] text-white rounded-full shadow-md hover:bg-[#3aa8a9] transition-all text-center"
                >
                  📥 Descargar Resumen
                </a>
              </div>
            </article>
          )}
        </section>
      </main>
    </div>
  );
}