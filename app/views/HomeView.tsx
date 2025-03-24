"use client";

import { useState, useEffect } from "react";
import { uploadAudio, getFilesFromS3, generateSummary } from '../api/ApiService';
import toast from 'react-hot-toast';
import ExitModal from './ExitModal';
import dynamic from "next/dynamic";

const AudioRecorder = dynamic(() => import("./AudioRecorder"), {
  ssr: false,
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

interface SummaryModalState {
  open: boolean;
  content: string;
  title: string;
}

interface GroupedFile {
  audio: S3File | null;
  transcript: S3File | null;
  summary: S3File | null;
  id: string;
}

export default function MicrophoneComponent() {
  const [uploadedAudios, setUploadedAudios] = useState<UploadedAudio[]>([]);
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);
  const [showExitModal, setShowExitModal] = useState(false);
  const [s3Files, setS3Files] = useState<S3File[]>([]);
  const [groupedFiles, setGroupedFiles] = useState<Record<string, GroupedFile>>({});
  const [summary, setSummary] = useState<{ mensaje: string; resumen: string; resumen_url: string; resumen_s3_key: string } | null>(null);
  const [expandedSummaries, setExpandedSummaries] = useState<Record<string, boolean>>({});
  const [summaryModal, setSummaryModal] = useState<SummaryModalState>({ open: false, content: '', title: '' });
  const [activeTab, setActiveTab] = useState<'uploads' | 'files'>('uploads');
  const [searchTerm, setSearchTerm] = useState('');

  // Función para agrupar archivos de S3
// Función para agrupar archivos de S3 - Versión mejorada
const groupFiles = (files: S3File[]): Record<string, GroupedFile> => {
  return files.reduce((acc, file) => {
    const fileName = file.Key.split("/").pop() || "";
    
    let fileId = '';
    const parts = fileName.split('_');
    
    if (fileName.match(/^\d+_.+\.(wav|mp3|m4a|ogg|flac)$/)) {
      fileId = parts[0];
    }
    else if (fileName.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_\d+_.+\.txt$/)) {
      fileId = parts[1];
    }
    else if (fileName.includes('resumen')) {
      // Si es un resumen, usamos el timestamp que está antes de '_resumen'
      const resumenParts = fileName.split('_resumen')[0].split('_');
      fileId = resumenParts[resumenParts.length - 1]; // Tomamos el último segmento antes de '_resumen'
    }
    else {
      fileId = fileName.split('_')[0];
    }

    if (!acc[fileId]) {
      acc[fileId] = { 
        audio: null, 
        transcript: null,
        summary: null,
        id: fileId
      };
    }

    const audioExtensions = [".wav", ".mp3", ".m4a", ".ogg", ".flac"];
    if (audioExtensions.some(ext => fileName.toLowerCase().endsWith(ext))) {
      acc[fileId].audio = file;
    } else if (fileName.toLowerCase().endsWith(".txt")) {
      if (fileName.toLowerCase().includes('resumen') || file.Key.toLowerCase().includes('resumen')) {
        acc[fileId].summary = file;
      } else {
        acc[fileId].transcript = file;
      }
    }

    return acc;
  }, {} as Record<string, GroupedFile>);
};

  // Obtener archivos de S3
  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const files = await getFilesFromS3();
        setS3Files(files);
        setGroupedFiles(groupFiles(files));
      } catch (error) {
        console.error("Error al obtener archivos de S3:", error);
        toast.error("Error al obtener archivos de S3.");
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

  // Subida de archivos
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const files = Array.from(event.target.files);
      setActiveTab('uploads');
      
      files.forEach(async (file) => {
        const uniqueId = Date.now();
        const uniqueFileName = `${uniqueId}_${file.name}`;

        setUploadedAudios(prev => [...prev, { name: uniqueFileName, status: "Pendiente" }]);

        try {
          await uploadAudio(
            file,
            uniqueFileName,
            setUploadedAudios,
            setProcessingMessage,
            setGroupedFiles
          );
        } catch (error) {
          console.error("Error al subir el archivo:", error);
          toast.error("Error al subir el archivo.");
          setUploadedAudios(prev => prev.map(audio => 
            audio.name === uniqueFileName ? { ...audio, status: "Error al procesar" } : audio
          ));
        }
      });
    }
  };

  // Manejar grabación detenida
  const handleRecordingStop = async (audioBlob: Blob) => {
    const uniqueId = Date.now();
    const uniqueFileName = `${uniqueId}_recording.wav`;

    setUploadedAudios(prev => [...prev, { name: uniqueFileName, status: "Pendiente" }]);
    setActiveTab('uploads');

    try {
      await uploadAudio(
        new File([audioBlob], uniqueFileName, { type: "audio/wav" }),
        uniqueFileName,
        setUploadedAudios,
        setProcessingMessage,
        setGroupedFiles
      );
    } catch (error) {
      console.error("Error al subir el archivo:", error);
      toast.error("Error al subir el archivo.");
      setUploadedAudios(prev => prev.map(audio => 
        audio.name === uniqueFileName ? { ...audio, status: "Error al procesar" } : audio
      ));
    }
  };

  // Generar resumen
  const handleGenerateSummary = async (s3Key: string) => {
    try {
      setProcessingMessage("Generando resumen...");
      const summaryData = await generateSummary(s3Key);
      
      // Extraer el nombre del archivo del key de S3
      const originalName = s3Key.split('/').pop() || 'resumen';
      const downloadName = `resumen-${originalName.split('_').slice(-2).join('_')}`;
      
      // Descargar automáticamente
      await handleDownloadFile(summaryData.resumen_url, downloadName);
      
      setProcessingMessage(null);
      toast.success("Resumen descargado");
      
    } catch (error) {
      console.error("Error al generar el resumen:", error);
      setProcessingMessage(null);
      toast.error("Error al generar el resumen");
    }
  };

  // Alternar visibilidad de resumen
  const toggleSummary = (id: string) => {
    setExpandedSummaries(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Abrir modal de resumen
  const openSummaryModal = (content: string, title: string) => {
    setSummaryModal({ open: true, content, title });
  };

  // Función para descargar archivos
  const handleDownloadFile = async (url: string, filename: string) => {
    try {
      // Primero obtenemos el archivo como blob
      const response = await fetch(url);
      const blob = await response.blob();
      
      // Creamos un enlace temporal
      const link = document.createElement('a');
      const blobUrl = window.URL.createObjectURL(blob);
      
      link.href = blobUrl;
      link.download = filename;
      link.style.display = 'none';
      
      document.body.appendChild(link);
      link.click();
      
      // Limpieza
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      }, 100);
      
    } catch (error) {
      console.error('Error al descargar el archivo:', error);
      toast.error('Error al descargar el archivo');
    }
  };

  // Filtrar audios
  const filteredAudios = uploadedAudios.filter(audio => 
    audio.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (audio.summary && audio.summary.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Filtrar archivos S3 agrupados
// Filtrar archivos S3 agrupados (excluyendo los que solo tienen resumen)
const filteredGroupedFiles = Object.values(groupedFiles).filter(files => {
  // Excluir grupos que solo tienen resumen
  if (files.summary && !files.audio && !files.transcript) {
    return false;
  }
  
  // Incluir solo los que coinciden con el término de búsqueda
  return (
    files.audio?.Key.toLowerCase().includes(searchTerm.toLowerCase()) || 
    files.transcript?.Key.toLowerCase().includes(searchTerm.toLowerCase()) ||
    files.summary?.Key.toLowerCase().includes(searchTerm.toLowerCase())
  );
});

  // Componente Modal de Resumen
  const SummaryModal = () => (
    <div className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 ${summaryModal.open ? '' : 'hidden'}`}>
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto mx-2">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">{summaryModal.title}</h3>
          <button 
            onClick={() => setSummaryModal(prev => ({...prev, open: false}))}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>
        <div className="prose max-w-none">
          <p className="whitespace-pre-line">{summaryModal.content}</p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 justify-end">
          <button
            onClick={() => {
              navigator.clipboard.writeText(summaryModal.content);
              toast.success("Resumen copiado al portapapeles");
            }}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            📋 Copiar
          </button>
          <button
            onClick={() => setSummaryModal(prev => ({...prev, open: false}))}
            className="px-4 py-2 bg-[#47CACC] text-white rounded hover:bg-[#3aa8a9]"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full py-4 sm:py-10 bg-[#70D7D9]">
      <ExitModal
        show={showExitModal}
        onClose={() => setShowExitModal(false)}
        onConfirm={() => {
          setShowExitModal(false);
          window.location.reload();
        }}
      />
      
      <SummaryModal />

      <main className="bg-white rounded-xl w-full max-w-3xl shadow-lg flex flex-col mx-2 sm:mx-4">
        <header className="w-full h-20 sm:h-24 rounded-t-xl flex justify-center items-center bg-[#47CACC]">
          <img
            className="w-32 sm:w-40 h-full object-contain"
            src="https://www.procencia.com/wp-content/uploads/2024/12/procencia.png"
            alt="Logo de Procencia"
          />
        </header>

        <section className="px-3 sm:px-6 py-6 sm:py-8 flex-grow">
          <AudioRecorder onRecordingStop={handleRecordingStop} />

          <div className="mt-6 text-center flex flex-col justify-center items-center">
            <div className="relative">
              <div className="relative inline-flex items-center justify-center w-12 sm:w-16 h-12 sm:h-16 text-xl sm:text-2xl font-extrabold text-gray-700 transition-transform duration-200 before:absolute before:top-1/2 before:left-[-33%] before:w-6/12 before:h-px before:bg-black before:transform before:-translate-y-1/2 after:absolute after:top-1/2 after:right-[-33%] after:w-6/12 after:h-px after:bg-black after:transform after:-translate-y-1/2">
                O
              </div>
            </div>
          </div>

          <article className="my-6 text-center flex flex-col justify-center items-center">
            <h2 className="text-lg sm:text-xl font-extrabold text-gray-700 mb-4 sm:mb-6">📂 Sube audios desde tu dispositivo</h2>
            <label className="flex flex-col items-center justify-center w-full sm:w-80 h-28 sm:h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 transition-all p-3 sm:p-4">
              <span className="text-3xl sm:text-4xl text-[#47CACC]">📤</span>
              <span className="text-gray-600 text-xs sm:text-sm mt-2 sm:mt-3">Haz clic aquí o arrastra tus archivos</span>
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

          {processingMessage && (
            <div role="alert" className="mt-4 p-2 sm:p-3 bg-yellow-100 border border-yellow-300 rounded text-yellow-800 text-center text-sm sm:text-base">
              {processingMessage}
            </div>
          )}

          {/* Pestañas */}
          <div className="flex border-b pt-4 sm:pt-6 overflow-x-auto">
            <button
              className={`flex-1 min-w-[120px] px-3 py-2 text-sm sm:text-base ${activeTab === 'uploads' ? 'border-b-2 border-[#47CACC] text-[#47CACC]' : 'text-gray-500'}`}
              onClick={() => setActiveTab('uploads')}
            >
              Subidos recientemente
            </button>
            <button
              className={`flex-1 min-w-[120px] px-3 py-2 text-sm sm:text-base ${activeTab === 'files' ? 'border-b-2 border-[#47CACC] text-[#47CACC]' : 'text-gray-500'}`}
              onClick={() => setActiveTab('files')}
            >
              Todos los archivos
            </button>
          </div>

          {/* Contenido de pestañas */}
          {activeTab === 'uploads' && (
            <article className="mt-4 sm:mt-6">
              {filteredAudios.length === 0 ? (
                <p className="text-gray-500 text-center py-4 text-sm sm:text-base">No hay archivos subidos recientemente</p>
              ) : (
                <ul className="space-y-2 sm:space-y-3">
                  {filteredAudios.map((audio, index) => (
                    <li key={index} className="p-3 sm:p-4 bg-gray-50 rounded-xl border">
                      <div className="flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-4">
                        <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 flex-1 min-w-0 w-full sm:w-auto">
                          <span className="text-gray-500 text-xs sm:text-sm">{index + 1}.</span>
                          <span className="text-lg sm:text-xl">🎵</span>
                          <span className="text-gray-700 text-xs sm:text-sm truncate flex-1 min-w-0 text-center sm:text-left">
                            {audio.name}
                          </span>
                          <span className={`px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${
                            audio.status === "Pendiente" ? "bg-gray-200 text-gray-700" :
                            audio.status === "Procesando" ? "bg-yellow-200 text-yellow-800" :
                            audio.status === "Completado" ? "bg-green-200 text-green-800" :
                            "bg-red-200 text-red-800"
                          }`}>
                            {audio.status}
                          </span>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-1 sm:gap-2 w-full sm:w-auto">
                          {audio.status === "Completado" && audio.transcriptLink && (
                            <button
                              onClick={() => handleDownloadFile(audio.transcriptLink!, `${audio.name}.txt`)}
                              className="w-full sm:w-auto px-3 sm:px-4 py-1 sm:py-2 bg-[#47CACC] text-white rounded-full shadow-md hover:bg-[#3aa8a9] transition-all text-center text-xs sm:text-sm"
                            >
                              📥 TXT
                            </button>
                          )}

                          {audio.status === "Completado" && audio.transcriptLink && (
                            <button
                              onClick={() => {
                                const s3Key = audio.transcriptLink?.split('amazonaws.com/')[1] || '';
                                handleGenerateSummary(s3Key);
                              }}
                              className="w-full sm:w-auto px-3 sm:px-4 py-1 sm:py-2 bg-[#47CACC] text-white rounded-full shadow-md hover:bg-[#3aa8a9] transition-all text-center text-xs sm:text-sm"
                            >
                              🤖 Resumen
                            </button>
                          )}
                        </div>
                      </div>

                      {audio.summary && (
                        <div className="w-full mt-2 sm:mt-3">
                          <div className="flex justify-between items-center">
                            <button 
                              onClick={() => toggleSummary(audio.name)}
                              className="text-xs sm:text-sm text-[#47CACC] font-medium flex items-center"
                            >
                              {expandedSummaries[audio.name] ? 'Ocultar' : 'Mostrar'} resumen
                              <span className="ml-1">
                                {expandedSummaries[audio.name] ? '↑' : '↓'}
                              </span>
                            </button>
                            <button
                              onClick={() => openSummaryModal(audio.summary || '', `Resumen: ${audio.name}`)}
                              className="text-xs sm:text-sm text-[#47CACC] font-medium"
                            >
                              Ver completo
                            </button>
                          </div>
                          {expandedSummaries[audio.name] && (
                            <div className="mt-1 sm:mt-2 p-2 sm:p-3 bg-gradient-to-r from-[#f0fdfa] to-[#ecfdf5] rounded-lg border border-[#d1fae5]">
                              <p className="text-xs sm:text-sm text-[#064e3b]">{audio.summary}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          )}

          {activeTab === 'files' && (
            <article className="mt-4 sm:mt-6">
              <h3 className="text-base sm:text-lg font-semibold text-gray-700 mb-3 sm:mb-4 pb-2 border-b">📁 Archivos Guardados</h3>
                        {/* Barra de búsqueda */}
          <div className="relative my-9">
            <input
              type="text"
              placeholder="Buscar en archivos..."
              className="w-full p-2 sm:p-3 pl-8 sm:pl-10 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#47CACC] text-sm sm:text-base"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <span className="absolute left-2 sm:left-3 top-2 sm:top-3 text-gray-400">🔍</span>
          </div>
              {filteredGroupedFiles.length === 0 ? (
                <p className="text-gray-500 text-center py-4 text-sm sm:text-base">No se encontraron archivos</p>
              ) : (
                <ul className="space-y-3">
                  {filteredGroupedFiles.map((files) => (
                    <li key={files.id} className="p-3 sm:p-4 bg-gray-50 rounded-xl border">
                      <div className="w-full flex justify-between">
                        <span className="text-xs text-gray-500">
                          ARCHIVO
                        </span>
                        <span className="text-xs text-gray-500 mb-4">
                          {new Date(
                            files.audio?.LastModified || 
                            files.transcript?.LastModified || 
                            Date.now()
                          ).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-gray-700 my-2">
                          {files.audio?.Key.split("/").pop() || files.transcript?.Key.split("/").pop()}
                        </span>
                      </div>
                      
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        {files.audio && (
                          <button
                            onClick={() => handleDownloadFile(files.audio!.URL, files.audio!.Key.split("/").pop()!)}
                            className="px-3 py-1 sm:px-4 sm:py-2 bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 text-xs sm:text-sm flex items-center gap-1"
                          >
                            <span>🎧</span>
                            <span>Audio</span>
                          </button>
                        )}
                        
                        {files.transcript && (
                          <button
                            onClick={() => handleDownloadFile(files.transcript!.URL, files.transcript!.Key.split("/").pop()!)}
                            className="px-3 py-1 sm:px-4 sm:py-2 bg-green-100 text-green-700 rounded-full hover:bg-green-200 text-xs sm:text-sm flex items-center gap-1"
                          >
                            <span>📄</span>
                            <span>Transcripción</span>
                          </button>
                        )}
                        
                        {files.transcript && !files.summary && (
                          <button
                            onClick={() => handleGenerateSummary(files.transcript!.Key)}
                            className="px-3 py-1 sm:px-4 sm:py-2 bg-purple-100 text-purple-700 rounded-full hover:bg-purple-200 text-xs sm:text-sm flex items-center gap-1"
                          >
                            <span>🤖</span>
                            <span>Resumen</span>
                          </button>
                        )}
                        
                        {files.summary && (
                          <button
                            onClick={() => handleDownloadFile(files.summary!.URL, files.summary!.Key.split("/").pop()!)}
                            className="px-3 py-1 sm:px-4 sm:py-2 bg-purple-100 text-purple-700 rounded-full hover:bg-purple-200 text-xs sm:text-sm flex items-center gap-1"
                          >
                            <span>📝</span>
                            <span>Resumen</span>
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          )}
        </section>
      </main>
    </div>
  );
}