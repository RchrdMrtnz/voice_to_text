"use client";

import { useState, useRef, useEffect } from "react";
import RecordRTC from "recordrtc";
import toast from "react-hot-toast";

interface AudioRecorderProps {
  onRecordingStart?: () => void;
  onRecordingStop?: (audioBlob: Blob) => void;
}

export default function AudioRecorder({
  onRecordingStart,
  onRecordingStop,
}: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<RecordRTC | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Función para formatear el tiempo de grabación
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Función para iniciar la grabación
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const recorder = new RecordRTC(stream, {
        type: "audio",
        mimeType: "audio/wav",
        recorderType: RecordRTC.StereoAudioRecorder,
        numberOfAudioChannels: 1,
        desiredSampRate: 16000,
      });

      recorder.startRecording();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      onRecordingStart?.();

      // Iniciar temporizador de grabación
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
      
      toast.success("Grabación iniciada", { 
        icon: '🎙️',
        position: 'bottom-center',
        duration: 2000
      });
    } catch (error) {
      console.error("Error al grabar:", error);
      toast.error("Error al iniciar la grabación. Asegúrate de permitir el acceso al micrófono.", {
        duration: 4000
      });
    }
  };

  // Función para detener la grabación
  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stopRecording(() => {
        const audioBlob = mediaRecorderRef.current?.getBlob();
        if (audioBlob) {
          onRecordingStop?.(audioBlob);
          toast.success("Grabación guardada correctamente", {
            icon: '✅',
            duration: 3000
          });
        }
      });
    }

    // Limpiar recursos
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }
    
    setIsRecording(false);
    setRecordingDuration(0);
  };

  // Limpiar recursos al desmontar el componente
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center">
      <div className={`relative flex flex-col items-center justify-center transition-all duration-300 ${isRecording ? 'scale-110' : 'scale-100'}`}>
        {/* Círculo principal */}
        <div className={`relative flex items-center justify-center rounded-full transition-all duration-300 ${
          isRecording 
            ? 'w-28 h-28 bg-red-500 shadow-lg shadow-red-300' 
            : 'w-24 h-24 bg-[#47CACC] hover:bg-[#3aa8a9] shadow-md hover:shadow-lg'
        }`}>
          {/* Círculo pulsante durante grabación */}
          {isRecording && (
            <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-50"></div>
          )}
          
          {/* Botón */}
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className="w-full h-full rounded-full flex items-center justify-center focus:outline-none focus:ring-4 focus:ring-white/30 transition-all z-10"
            aria-label={isRecording ? "Detener grabación" : "Iniciar grabación"}
          >
            {isRecording ? (
              <div className="w-8 h-8 bg-white rounded"></div>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            )}
          </button>
        </div>

        {/* Duración */}
        {isRecording && (
          <div className="mt-6">
            {/* Tiempo de grabación */}
            <div className="flex items-center justify-center bg-red-100 text-red-700 font-medium px-4 py-1.5 rounded-full">
              <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse mr-2"></div>
              <span className="text-sm">{formatTime(recordingDuration)}</span>
            </div>
          </div>
        )}
      </div>
      
      {/* Texto de instrucción */}
      <p className={`mt-4 text-sm text-gray-600 transition-opacity duration-300 ${isRecording ? 'opacity-0' : 'opacity-100'}`}>
        Presiona el botón para {isRecording ? "detener" : "iniciar"} la grabación
      </p>
    </div>
  );
}