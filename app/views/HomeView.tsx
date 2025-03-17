"use client";

import { useState, useRef, useEffect } from "react";
import { uploadAudio, getFilesFromS3 } from '../api/ApiService'; // Importa la función de la API
import toast from 'react-hot-toast';

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
  const [isRecording, setIsRecording] = useState(false);
  const [uploadedAudios, setUploadedAudios] = useState<UploadedAudio[]>([]);
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);
  const [showExitModal, setShowExitModal] = useState(false);
  const [exitAction, setExitAction] = useState<(() => void) | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [s3Files, setS3Files] = useState<S3File[]>([]); // Archivos totales en S3
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [groupedFiles, setGroupedFiles] = useState<
  Record<string, { audio: S3File | null; transcript: S3File | null }>
>({});
  // Obtener los archivos de S3 al cargar la página
  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const files = await getFilesFromS3();
        console.log("Archivos de S3:", files); // Verifica los archivos
        setS3Files(files);
  
        // Agrupa los archivos
        const groupedFiles = files.reduce((acc: Record<string, { audio: S3File | null; transcript: S3File | null }>, file) => {
          const fileName = file.Key.split("/").pop() || ""; // Obtener el nombre completo del archivo
          const fileId = fileName.split("_")[0]; // Extraer el ID común (antes del primer "_")
        
          if (!acc[fileId]) {
            acc[fileId] = { audio: null, transcript: null }; // Inicializar el grupo
          }
        
          // Identificar si es un archivo de audio o de texto
          if (fileName.includes("_audio") || fileName.endsWith(".wav") || fileName.endsWith(".ogg")) {
            acc[fileId].audio = file; // Es un archivo de audio
          } else if (fileName.includes("_transcript") || fileName.endsWith(".txt")) {
            acc[fileId].transcript = file; // Es un archivo de texto
          }
        
          return acc;
        }, {} as Record<string, { audio: S3File | null; transcript: S3File | null }>);
  
        console.log("Archivos agrupados:", groupedFiles); // Verifica la agrupación
        setGroupedFiles(groupedFiles);
      } catch (error) {
        console.error("🚨 Error al obtener los archivos de S3:", error);
        toast.error("Error al obtener los archivos de S3. Intenta de nuevo.");
      }
    };
  
    fetchFiles();
  }, []);


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
        await uploadAudio(audioFile, fileName, setUploadedAudios, setProcessingMessage);
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
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const files = Array.from(event.target.files);
      
      files.forEach(async (file) => {
        // Generar el nombre único del archivo antes de enviarlo a `uploadAudio`
        const uniqueId = Date.now(); // Timestamp único
        const uniqueFileName = `${uniqueId}_${file.name}`;
  
        // Evitar subir el mismo archivo dos veces
        setUploadedAudios((prev) => {
          if (prev.some(audio => audio.name === uniqueFileName)) {
            console.warn(`⚠️ Archivo duplicado detectado: ${uniqueFileName}, no se subirá otra vez.`);
            return prev;
          }
          return [...prev, { name: uniqueFileName, status: "Pendiente" }];
        });
  
        // Subir archivo con el nombre único generado aquí
        await uploadAudio(file, uniqueFileName, setUploadedAudios, setProcessingMessage);
      });
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
                Salir
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
                  className="p-6 rounded-full bg-[#47CACC] text-white shadow-md hover:bg-[#3aa8a9] transition-all"
                >
                  <img src="https://test-api-bot.s3.us-east-1.amazonaws.com/microphone-solid+(1).svg" className="w-6 aspect-square" alt="Icono de microfono"></img>
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
          {/* Archivos totales en S3 */}
          {Object.entries(groupedFiles).length > 0 && (
            <div className="mt-8">
              <h3 className="text-lg font-semibold text-gray-700 mb-4 pb-2 border-b">
                📁 Archivos del Usuario
              </h3>
              <ul className="space-y-3">
                {Object.entries(groupedFiles).map(([fileId, files], index) => (
                  <li
                    key={index}
                    className="p-4 bg-gray-50 rounded-xl border flex flex-col sm:flex-row justify-between items-start sm:items-center"
                  >
                    {/* Información del archivo */}
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
            </div>
          )}

        </div>
      </div>
    </div>
  );
}