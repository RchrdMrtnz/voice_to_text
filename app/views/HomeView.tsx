"use client";

import { useState, useEffect } from "react";
import { uploadAudio, getFilesFromS3, generateSummary } from '../services/ApiService';
import toast from 'react-hot-toast';
import ExitModal from './ExitModal';
import dynamic from "next/dynamic";
import SettingsModal from './SettingsModal';
const AudioRecorder = dynamic(() => import("./AudioRecorder"), {
  ssr: false,
});
const EmailModal = dynamic(() => import("./EmailView"), {
  ssr: false,
});

interface UploadedAudio {
  name: string;
  status: "Pendiente" | "Procesando" | "Completado" | "Error al procesar";
  transcriptLink?: string;
  audioLink?: string;
  summary?: string;
  summaryUrl?: string;
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
  summary?: S3File | null;  // Make summary optional
  id?: string;              // Make id optional
}

export default function MicrophoneComponent() {
  const [uploadedAudios, setUploadedAudios] = useState<UploadedAudio[]>([]);
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);
  const [showExitModal, setShowExitModal] = useState(false);
  const [s3Files, setS3Files] = useState<S3File[]>([]);
  const [groupedFiles, setGroupedFiles] = useState<Record<string, GroupedFile>>({});
  const [generatingSummaries, setGeneratingSummaries] = useState<Record<string, boolean>>({});
  const [summary, setSummary] = useState<{ mensaje: string; resumen: string; resumen_url: string; resumen_s3_key: string } | null>(null);
  const [expandedSummaries, setExpandedSummaries] = useState<Record<string, boolean>>({});
  const [summaryModal, setSummaryModal] = useState<SummaryModalState>({ open: false, content: '', title: '' });
  const [activeTab, setActiveTab] = useState<'uploads' | 'files'>('uploads');
  const [searchTerm, setSearchTerm] = useState('');
  const [emailModal, setEmailModal] = useState({
    isOpen: false,
    content: '',
    fileTitle: '',
    transcription: ''
  });
  
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const openEmailModal = (content: string, fileTitle: string, transcription?: string) => {
    setEmailModal({
      isOpen: true,
      content,
      fileTitle,
      transcription: transcription || ''
    });
  };
  // Función para agrupar archivos de S3
// Función para agrupar archivos de S3 - Versión mejorada
const groupFiles = (files: S3File[]): Record<string, GroupedFile> => {
  return files.reduce((acc, file) => {
    const fileName = file.Key.split("/").pop() || "";
    const lowerFileName = fileName.toLowerCase();
    const lowerKey = file.Key.toLowerCase();
    
    // Extraer el ID según el tipo de archivo
    const extractFileId = () => {
      // Caso 1: Archivos de audio (ID_TIMESTAMP_NOMBRE.ext)
      const audioMatch = fileName.match(/^(\d+)_.+\.(wav|mp3|m4a|ogg|flac)$/i);
      if (audioMatch) return audioMatch[1];
      
      // Caso 2: Transcripciones/Resúmenes (UUID_ID_TIMESTAMP_NOMBRE.txt)
      const textMatch = fileName.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_(\d+)_.+\.txt$/i);
      if (textMatch) return textMatch[1];
      
      // Caso 3: Archivos con 'resumen' en el nombre
      if (lowerFileName.includes('resumen')) {
        const resumenParts = fileName.split('_resumen')[0].split('_');
        return resumenParts[resumenParts.length - 1];
      }
      
      // Caso por defecto: primer segmento del nombre
      return fileName.split('_')[0];
    };

    const fileId = extractFileId();
    
    // Inicializar el grupo si no existe
    if (!acc[fileId]) {
      acc[fileId] = { 
        audio: null, 
        transcript: null,
        summary: null
      };
    }

    // Clasificar el archivo
    const isAudio = /\.(wav|mp3|m4a|ogg|flac)$/i.test(fileName);
    const isText = /\.txt$/i.test(fileName);
    const isResume = lowerKey.includes('resume/') || lowerFileName.includes('resumen');

    if (isAudio) {
      acc[fileId].audio = file;
    } else if (isText) {
      if (isResume) {
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
const handleGenerateSummary = async (s3Key: string, fileId: string) => {
  try {
    // 1. Mostrar estado de carga
    setGeneratingSummaries(prev => ({ ...prev, [fileId]: true }));
    setProcessingMessage("Generando resumen...");

    // 2. Llamar al API para generar el resumen
    const summaryData = await generateSummary(s3Key);
    
    // 3. Preparar nombre para descarga
    const originalName = s3Key.split('/').pop() || 'resumen';
    const downloadName = `resumen-${originalName.split('_').slice(-2).join('_')}`;
    
    // 4. Descargar automáticamente
    await handleDownloadFile(summaryData.resumen_url, downloadName);
    
    // 5. Actualizar estado de groupedFiles (para la pestaña "Todos los archivos")
    setGroupedFiles(prevGroupedFiles => {
      const updatedGroupedFiles = { ...prevGroupedFiles };
      
      for (const [key, group] of Object.entries(updatedGroupedFiles)) {
        if (group.transcript?.Key === s3Key) {
          updatedGroupedFiles[key] = {
            ...group,
            summary: {
              Key: summaryData.resumen_s3_key,
              URL: summaryData.resumen_url,
              Size: 0,
              LastModified: new Date().toISOString(),
              ContentType: 'text/plain'
            }
          };
          break;
        }
      }
      
      return updatedGroupedFiles;
    });
    
    // 6. Actualizar estado de uploadedAudios (para la pestaña "Subidos recientemente")
    setUploadedAudios(prev => prev.map(audio => 
      audio.name === fileId ? { 
        ...audio, 
        summary: summaryData.resumen,
        summaryUrl: summaryData.resumen_url
      } : audio
    ));
    
    // 7. Notificación de éxito
    toast.success("Resumen generado y descargado");
    
  } catch (error) {
    // 8. Manejo de errores
    console.error("Error al generar el resumen:", error);
    toast.error("Error al generar el resumen");
    
  } finally {
    // 9. Limpiar estados de carga
    setGeneratingSummaries(prev => ({ ...prev, [fileId]: false }));
    setProcessingMessage(null);
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
      <header className="w-full h-20 sm:h-24 rounded-t-xl flex items-center bg-gradient-to-r from-[#47CACC] to-[#3aa8a9] px-12 shadow-sm">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center">
            <img
              className="w-32 sm:w-40 h-auto object-contain"
              src="https://www.procencia.com/wp-content/uploads/2024/12/procencia.png"
              alt="Logo de Procencia"
            />
          </div>
          
          <div className="flex items-center">
            <button
              onClick={() => setSettingsModalOpen(true)}
              className="p-2.5 rounded-full hover:bg-white/20 focus:bg-white/30 active:bg-white/40 transition-all flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-white/50"
              aria-label="Configuración"
              title="Configuración"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>
      </header>

        <section className="px-4 sm:px-6 py-6 sm:py-8 flex-grow bg-gray-50">
          <div className="max-w-4xl mx-auto">
            {/* Sección del grabador de audio */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 transition-all hover:shadow-md">
              <h2 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#47CACC]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                Grabador de Audio
              </h2>
              
              <AudioRecorder onRecordingStop={handleRecordingStop} />
            </div>

            {/* Separador */}
            <div className="flex items-center justify-center my-8">
              <div className="w-24 sm:w-32 h-px bg-gray-300"></div>
              <span className="mx-4 text-xl sm:text-2xl font-bold text-gray-400">O</span>
              <div className="w-24 sm:w-32 h-px bg-gray-300"></div>
            </div>

            {/* Sección de subida de archivos */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 transition-all hover:shadow-md">
              <h2 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#47CACC]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Sube audios desde tu dispositivo
              </h2>
              
              <div className="flex justify-center">
                <label className="flex flex-col items-center justify-center w-full max-w-md h-36 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 hover:border-[#47CACC]/50 transition-all duration-200">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-[#47CACC] mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm text-gray-600 font-medium">Haz clic aquí o arrastra tus archivos</p>
                    <p className="text-xs text-gray-500 mt-1">Formatos soportados: MP3, WAV, M4A...</p>
                  </div>
                  <input
                    type="file"
                    multiple
                    accept="audio/*"
                    className="hidden"
                    onChange={handleFileChange}
                    aria-label="Subir archivos de audio"
                  />
                </label>
              </div>
            </div>

            {processingMessage && (
              <div role="alert" className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-center text-sm sm:text-base flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5 text-amber-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {processingMessage}
              </div>
            )}

            {/* Pestañas mejoradas */}
            <div className="mt-10 mb-4">
              <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-4 sm:space-x-8">
                  <button
                    className={`px-1 py-3 text-sm sm:text-base font-medium flex items-center gap-2 border-b-2 transition-colors duration-200 ${
                      activeTab === 'uploads'
                        ? 'border-[#47CACC] text-[#47CACC]'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                    onClick={() => setActiveTab('uploads')}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeTab === 'uploads' ? 2 : 1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Subidos recientemente
                  </button>
                  <button
                    className={`px-1 py-3 text-sm sm:text-base font-medium flex items-center gap-2 border-b-2 transition-colors duration-200 ${
                      activeTab === 'files'
                        ? 'border-[#47CACC] text-[#47CACC]'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                    onClick={() => setActiveTab('files')}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={activeTab === 'files' ? 2 : 1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                    </svg>
                    Todos los archivos
                  </button>
                </nav>
              </div>
            </div>
          </div>

          {activeTab === 'uploads' && (
            <article className="mt-6 sm:mt-8">
              <div className="flex items-center justify-between pb-3 border-b border-gray-200 mb-4">
                <h3 className="text-lg sm:text-xl font-bold text-gray-800 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#47CACC]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Archivos Subidos
                </h3>
              </div>

              {filteredAudios.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 bg-gray-50 rounded-xl border border-gray-200">
                  <p className="text-gray-500 text-center text-sm sm:text-base">No hay archivos subidos recientemente</p>
                  <p className="text-gray-400 text-center text-xs mt-1">Sube un archivo de audio para comenzar</p>
                </div>
              ) : (
                <ul className="space-y-3 sm:space-y-4">
                  {filteredAudios.map((audio, index) => (
                    <li key={index} className="p-4 sm:p-5 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200">
                      <div className="flex flex-col items-start gap-3 sm:gap-4">
                        <div className="flex gap-3 flex-1 w-full">
                          <div className="flex items-center justify-center w-8 h-8 bg-[#47CACC]/10 rounded-full">
                            <span className="text-[#47CACC] font-medium text-sm">{index + 1}</span>
                          </div>
                          
                          <div className="flex flex-col md:flex-row  md:justify-between md:items-center w-full">
                            <div className="flex items-center gap-4">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                              </svg>
                              <span className="text-gray-800 font-medium text-sm sm:text-base truncate">
                                {audio.name}
                              </span>
                            </div>
                            
                            <div className="flex items-center my-4 md:my-0">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                                audio.status === "Pendiente" ? "bg-gray-100 text-gray-600" :
                                audio.status === "Procesando" ? "bg-yellow-100 text-yellow-700 border border-yellow-200" :
                                audio.status === "Completado" ? "bg-green-100 text-green-700 border border-green-200" :
                                "bg-red-100 text-red-700 border border-red-200"
                              }`}>
                                {audio.status === "Pendiente" && (
                                  <span className="flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Pendiente
                                  </span>
                                )}
                                {audio.status === "Procesando" && (
                                  <span className="flex items-center gap-1">
                                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Procesando
                                  </span>
                                )}
                                {audio.status === "Completado" && (
                                  <span className="flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    Completado
                                  </span>
                                )}
                                {audio.status === "Error al procesar" && (
                                  <span className="flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    Error
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-start sm:justify-end">
                          {audio.status === "Completado" && audio.transcriptLink && (
                            <div className="flex flex-wrap gap-2">
                              {/* Botón Descargar TXT */}
                              <button
                                onClick={() => handleDownloadFile(audio.transcriptLink!, `${audio.name}.txt`)}
                                className="px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 text-xs sm:text-sm font-medium flex items-center gap-1.5 transition-colors duration-200 border border-blue-100"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                <span>Descargar TXT</span>
                              </button>

                              {/* Botón Generar Resumen */}
                              {generatingSummaries[audio.name] ? (
                                <div className="flex items-center gap-2 text-sm text-blue-600 px-4 py-2">
                                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                  <span>Generando...</span>
                                </div>
                              ) : !audio.summary ? (
                                <button
                                  onClick={() => {
                                    const s3Key = audio.transcriptLink?.split('amazonaws.com/')[1] || '';
                                    handleGenerateSummary(s3Key, audio.name);
                                  }}
                                  className="px-3 py-1.5 sm:px-4 sm:py-2 bg-purple-50 text-purple-600 rounded-full hover:bg-purple-100 text-xs sm:text-sm font-medium flex items-center gap-1.5 transition-colors duration-200 border border-purple-100"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                  </svg>
                                  <span>Generar Resumen</span>
                                </button>
                              ) : null}

                              {/* Botón Enviar por Email (solo cuando hay resumen) */}
                              {audio.summary && (
                                <button
                                  onClick={async () => {
                                    const defaultEmail = localStorage.getItem("defaultEmail") || "orianamendez.work@gmail.com";
                                    if (!defaultEmail) {
                                      toast.error("Configura un correo predeterminado en ajustes");
                                      setSettingsModalOpen(true);
                                      return;
                                    }

                                    toast.loading("Enviando correo...", { id: "emailToast" });
                                    
                                    try {
                                      const response = await fetch("/api/send-email", {
                                        method: "POST",
                                        headers: {
                                          "Content-Type": "application/json",
                                        },
                                        body: JSON.stringify({
                                          to: defaultEmail,
                                          subject: `Resumen: ${audio.name}`,
                                          summary: audio.summary,
                                          fileTitle: audio.name
                                        }),
                                      });

                                      const data = await response.json();
                                      
                                      if (!response.ok) {
                                        throw new Error(data.message || "Error al enviar el correo");
                                      }

                                      toast.success("Correo enviado exitosamente", { id: "emailToast" });
                                    } catch (error) {
                                      console.error("Error al enviar el correo:", error);
                                      toast.error(
                                        error instanceof Error ? error.message : "Error al enviar el correo", 
                                        { id: "emailToast" }
                                      );
                                    }
                                  }}
                                  className="px-3 py-1.5 sm:px-4 sm:py-2 bg-green-50 text-green-600 rounded-full hover:bg-green-100 text-xs sm:text-sm font-medium flex items-center gap-1.5 transition-colors duration-200 border border-green-100"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                  </svg>
                                  <span>Enviar por Email</span>
                                </button>
                              )}
                            </div>
)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          )}

          {activeTab === 'files' && (
            <article className="mt-6 sm:mt-8">
              <div className="flex items-center justify-between pb-3 border-b border-gray-200">
                <h3 className="text-lg sm:text-xl font-bold text-gray-800 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#47CACC]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                  Archivos Guardados
                </h3>
              </div>

              {/* Barra de búsqueda */}
              <div className="relative my-6">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Buscar en archivos..."
                  className="w-full p-3 pl-10 rounded-lg border border-gray-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#47CACC] focus:border-[#47CACC] text-sm sm:text-base transition-all duration-200"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {filteredGroupedFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 bg-gray-50 rounded-xl border border-gray-200">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6" />
                  </svg>
                  <p className="text-gray-500 text-center text-sm sm:text-base">No se encontraron archivos</p>
                  <p className="text-gray-400 text-center text-xs mt-1">Sube un archivo o realiza una búsqueda diferente</p>
                </div>
              ) : (
                <ul className="space-y-4">
                  {[...filteredGroupedFiles].sort((a, b) => {
                    // Obtener las fechas de los archivos
                    const dateA = new Date(
                      a.audio?.LastModified || 
                      a.transcript?.LastModified || 
                      Date.now()
                    );
                    
                    const dateB = new Date(
                      b.audio?.LastModified || 
                      b.transcript?.LastModified || 
                      Date.now()
                    );
                    return dateB.getTime() - dateA.getTime();   
                  }).map((files) => (
                    <li key={files.id} className="p-4 sm:p-5 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200">
                      <div className="w-full flex justify-between items-center mb-3">
                        <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded">
                          ARCHIVO
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(
                            files.audio?.LastModified || 
                            files.transcript?.LastModified || 
                            Date.now()
                          ).toLocaleString()}
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center mb-4">
                        <h4 className="text-sm sm:text-base font-medium text-gray-800 truncate max-w-xs sm:max-w-sm">
                          {files.audio?.Key.split("/").pop() || files.transcript?.Key.split("/").pop()}
                        </h4>
                      </div>
                      
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        {files.audio && (
                          <button
                            onClick={() => handleDownloadFile(files.audio!.URL, files.audio!.Key.split("/").pop()!)}
                            className="px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 text-xs sm:text-sm font-medium flex items-center gap-1.5 transition-colors duration-200 border border-blue-100"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                            </svg>
                            <span>Audio</span>
                          </button>
                        )}
                        
                        {files.transcript && (
                          <button
                            onClick={() => handleDownloadFile(files.transcript!.URL, files.transcript!.Key.split("/").pop()!)}
                            className="px-3 py-1.5 sm:px-4 sm:py-2 bg-green-50 text-green-600 rounded-full hover:bg-green-100 text-xs sm:text-sm font-medium flex items-center gap-1.5 transition-colors duration-200 border border-green-100"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span>Transcripción</span>
                          </button>
                        )}
                        
                        {/* Mostrar botones de resumen según si existe o no */}
                        {files.summary ? (
                          <>
                            <button
                              onClick={() => handleDownloadFile(files.summary!.URL, files.summary!.Key.split("/").pop()!)}
                              className="px-3 py-1.5 sm:px-4 sm:py-2 bg-purple-50 text-purple-600 rounded-full hover:bg-purple-100 text-xs sm:text-sm font-medium flex items-center gap-1.5 transition-colors duration-200 border border-purple-100"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                              <span>Descargar Resumen</span>
                            </button>
                            
                            <button
                              onClick={async () => {
                                const defaultEmail = localStorage.getItem("defaultEmail");
                                
                                if (!defaultEmail) {
                                  toast.error("Configura un correo predeterminado en ajustes");
                                  setSettingsModalOpen(true);
                                  return;
                                }
                                
                                toast.loading("Enviando correo...", { id: "emailToast" });
                                
                                try {
                                  const summaryResponse = await fetch(files.summary!.URL);
                                  const summaryContent = await summaryResponse.text();
                                  
                                  const fileName = files.audio?.Key.split("/").pop() || 
                                                files.transcript?.Key.split("/").pop() || 
                                                "archivo";
                                  
                                  const response = await fetch("/api/send-email", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      to: defaultEmail,
                                      subject: `Resumen: ${fileName}`,
                                      summary: summaryContent,
                                      fileTitle: fileName
                                    }),
                                  });

                                  if (!response.ok) {
                                    throw new Error(await response.text());
                                  }

                                  toast.success("Correo enviado exitosamente", { id: "emailToast" });
                                } catch (error) {
                                  console.error("Error al enviar el correo:", error);
                                  toast.error(
                                    error instanceof Error ? error.message : "Error al enviar el correo", 
                                    { id: "emailToast" }
                                  );
                                }
                              }}
                              className="px-3 py-1.5 sm:px-4 sm:py-2 bg-indigo-50 text-indigo-600 rounded-full hover:bg-indigo-100 text-xs sm:text-sm font-medium flex items-center gap-1.5 transition-colors duration-200 border border-indigo-100"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                              <span>Enviar por Email</span>
                            </button>
                          </>
                        ) : files.transcript && (
                          <button
                            onClick={() => handleGenerateSummary(files.transcript!.Key, files.id || files.transcript!.Key)}
                            className="px-3 py-1.5 sm:px-4 sm:py-2 bg-purple-50 text-purple-600 rounded-full hover:bg-purple-100 text-xs sm:text-sm font-medium flex items-center gap-1.5 transition-colors duration-200 border border-purple-100"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            <span>Generar Resumen</span>
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
      <SettingsModal 
      isOpen={settingsModalOpen}
      onClose={() => setSettingsModalOpen(false)}
      />
    </div>

  );
}
