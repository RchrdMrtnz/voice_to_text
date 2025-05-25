// AudioRecorderStreaming.tsx - MEJOR FEEDBACK VISUAL AL DETENER

"use client";

import { useState, useRef, useEffect } from "react";
import RecordRTC from "recordrtc";
import toast from "react-hot-toast";

interface AudioRecorderProps {
  onRecordingStop: (sessionId: string, finalAudioKey: string) => Promise<void>;
  onRecordingStart?: () => void;
  onRecordingStateChange?: (isRecording: boolean) => void;
}

interface TaskStatus {
  task_id: string;
  status: string;
  result: {
    session_id: string;
    final_audio_key: string;
    message: string;
    chunks_processed?: number;
    final_duration_seconds?: number;
  } | null;
}

const backendUrl = "/api";

export default function AudioRecorderStreaming({
  onRecordingStart,
  onRecordingStop,
  onRecordingStateChange,
}: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [processingStep, setProcessingStep] = useState<number>(0);
  const [isProcessingStop, setIsProcessingStop] = useState(false);
  
  // ✅ NUEVO: Estado para mostrar duración final
  const [finalRecordingDuration, setFinalRecordingDuration] = useState<number>(0);
  
  // Referencias para la grabación
  const mediaRecorderRef = useRef<RecordRTC | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Referencias para el manejo de chunks
  const sessionIdRef = useRef<string>("");
  const chunkNumberRef = useRef<number>(0);
  const lastChunkSentTimeRef = useRef<number>(0);
  
  // ✅ EFECTO PARA NOTIFICAR CAMBIOS EN EL ESTADO DE GRABACIÓN
  useEffect(() => {
    onRecordingStateChange?.(isRecording);
  }, [isRecording, onRecordingStateChange]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const generateSessionId = (): string => {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  };

  // Upload chunk con logging reducido
  const uploadChunk = async (blob: Blob, sessionId: string, chunkNumber: number): Promise<any> => {
    try {
      console.log(`📤 Subiendo chunk ${chunkNumber} (${Math.round(blob.size / 1024)}KB)`);
      
      setIsAutoSaving(true);
      
      const file = new File([blob], `chunk-${chunkNumber}.webm`, {
        type: "audio/webm",
      });
      
      const formData = new FormData();
      formData.append("file", file);
      
      const response = await fetch(`${backendUrl}/upload-chunk?session_id=${sessionId}&chunk_number=${chunkNumber}`, {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Error al subir fragmento ${chunkNumber}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      setTimeout(() => setIsAutoSaving(false), 1000);
      return data;
    } catch (error) {
      console.error(`❌ Error chunk ${chunkNumber}:`, error);
      setIsAutoSaving(false);
      throw error;
    }
  };

  const finishRecording = async (sessionId: string): Promise<string> => {
    try {
      setProcessingStep(1);
      
      const response = await fetch(`${backendUrl}/finish-recording?session_id=${sessionId}`, {
        method: "POST",
      });
      
      if (!response.ok) {
        throw new Error(`Error al finalizar la grabación: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.task_id;
    } catch (error) {
      console.error("❌ Error al finalizar la grabación:", error);
      throw error;
    }
  };

  const checkTaskStatus = async (taskId: string): Promise<TaskStatus> => {
    try {
      const response = await fetch(`${backendUrl}/task-status/${taskId}`);
      
      if (!response.ok) {
        throw new Error(`Error al verificar el estado de la tarea: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error("Error al verificar el estado de la tarea:", error);
      throw error;
    }
  };

  const waitForTaskCompletion = async (taskId: string): Promise<TaskStatus> => {
    let status: TaskStatus;
    let attempts = 0;
    const maxAttempts = 30;
    
    do {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      status = await checkTaskStatus(taskId);
      attempts++;
      
      if (status.status === "PROGRESS") {
        setProcessingStatus(`Procesando grabación... ${status.result?.message || ""}`);
        setProcessingStep(2);
      } else if (status.status === "SUCCESS") {
        setProcessingStatus("¡Grabación completada!");
        setProcessingStep(3);
      } else if (status.status === "FAILURE") {
        setProcessingStatus("Error al procesar");
        setProcessingStep(0);
      }
      
    } while (status.status !== "SUCCESS" && status.status !== "FAILURE" && attempts < maxAttempts);
    
    if (attempts >= maxAttempts && status.status !== "SUCCESS" && status.status !== "FAILURE") {
      throw new Error("Tiempo de espera agotado");
    }
    
    return status;
  };

  const startRecording = async () => {
    try {
      console.log("🎬 Iniciando grabación...");
      
      // ✅ LIMPIAR estados anteriores
      setFinalRecordingDuration(0);
      setProcessingStatus(null);
      setProcessingStep(0);
      
      sessionIdRef.current = generateSessionId();
      chunkNumberRef.current = 0;
      lastChunkSentTimeRef.current = Date.now();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const recorder = new RecordRTC(stream, {
        type: "audio",
        mimeType: "audio/webm",
        recorderType: RecordRTC.StereoAudioRecorder,
        numberOfAudioChannels: 1,
        desiredSampRate: 16000,
        timeSlice: 15000,
        ondataavailable: async (blob) => {
          if (blob && blob.size > 100) {
            const currentChunkNumber = chunkNumberRef.current++;
            lastChunkSentTimeRef.current = Date.now();
            
            try {
              await uploadChunk(blob, sessionIdRef.current, currentChunkNumber);
            } catch (err) {
              console.error(`❌ Error al subir chunk ${currentChunkNumber}:`, err);
            }
          }
        }
      });

      recorder.startRecording();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      onRecordingStart?.();

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
      
      toast.success("Grabación iniciada", { 
        icon: '🎙️',
        position: 'bottom-center',
        duration: 2000
      });
    } catch (error) {
      console.error("❌ Error al iniciar grabación:", error);
      toast.error("Error al iniciar la grabación. Asegúrate de permitir el acceso al micrófono.", {
        duration: 4000
      });
    }
  };

  // ✅ FUNCIÓN MEJORADA: Mejor feedback visual
  const stopRecording = async () => {
    if (!mediaRecorderRef.current || !streamRef.current || isProcessingStop) {
      console.log("⚠️ Grabación ya se está procesando o no está activa");
      return;
    }
    
    try {
      console.log("🛑 Deteniendo grabación...");
      
      // ✅ CAMBIOS INMEDIATOS DE ESTADO VISUAL
      setIsProcessingStop(true);
      
      // ✅ DETENER temporizador inmediatamente
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      
      // ✅ GUARDAR duración final antes de cambiar estados
      setFinalRecordingDuration(recordingDuration);
      
      // ✅ CAMBIAR estados visuales INMEDIATAMENTE
      setIsRecording(false); // Ya no está grabando
      setIsProcessing(true);  // Ahora está procesando
      setProcessingStatus("Finalizando grabación...");
      setProcessingStep(1);
      
      // ✅ FEEDBACK VISUAL CLARO: Ya no grabando, ahora procesando
      toast.success(`Grabación detenida (${formatTime(recordingDuration)})`, {
        icon: '⏹️',
        position: 'bottom-center',
        duration: 2000
      });
      
      console.log(`📊 Grabación finalizada: ${chunkNumberRef.current} chunks enviados`);
      
      mediaRecorderRef.current.stopRecording(async () => {
        try {
          setProcessingStatus("Combinando fragmentos de audio...");
          
          console.log("🔧 Combinando chunks automáticos...");
          
          const taskId = await finishRecording(sessionIdRef.current);
          const finalStatus = await waitForTaskCompletion(taskId);
          
          if (finalStatus.status === "SUCCESS" && finalStatus.result) {
            console.log("✅ Grabación procesada exitosamente");
            
            toast.success("¡Grabación procesada correctamente!", {
              icon: '✅',
              duration: 3000,
            });
            
            await onRecordingStop?.(
              finalStatus.result.session_id,
              finalStatus.result.final_audio_key
            );
          } else {
            console.log("❌ Error al procesar la grabación");
            toast.error("Error al procesar la grabación", {
              duration: 3000,
            });
          }
        } catch (error) {
          console.error("❌ Error en el proceso de finalización:", error);
          toast.error("Error al procesar la grabación", {
            duration: 3000,
          });
        } finally {
          // ✅ LIMPIAR recursos
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
          }
          
          // ✅ TRANSICIÓN FINAL suave después de mostrar éxito
          setTimeout(() => {
            setIsProcessing(false);
            setIsProcessingStop(false);
            setProcessingStatus(null);
            setRecordingDuration(0);
            setFinalRecordingDuration(0);
            setProcessingStep(0);
          }, 2000); // 2 segundos para que el usuario vea el éxito
        }
      });
    } catch (error) {
      console.error("❌ Error al detener grabación:", error);
      toast.error("Error al detener la grabación", {
        duration: 3000,
      });
      
      // ✅ LIMPIAR en caso de error
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      
      setIsRecording(false);
      setIsProcessing(false);
      setIsProcessingStop(false);
      setProcessingStatus(null);
      setRecordingDuration(0);
      setFinalRecordingDuration(0);
      setProcessingStep(0);
    }
  };

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

  const renderProgressIndicator = () => {
    if (!isProcessing) return null;
    
    return (
      <div className="w-full mt-3 bg-gray-200 rounded-full h-2.5">
        <div 
          className="bg-amber-500 h-2.5 rounded-full transition-all duration-500 ease-in-out" 
          style={{ width: `${(processingStep / 3) * 100}%` }}
        />
      </div>
    );
  };

  return (
    <div className="flex flex-col items-center justify-center">
      <div className={`relative flex flex-col items-center justify-center transition-all duration-300 ${isRecording || isProcessing ? 'scale-110' : 'scale-100'}`}>
        {/* Círculo principal con estados más claros */}
        <div className={`relative flex items-center justify-center rounded-full transition-all duration-300 ${
          isRecording 
            ? 'w-28 h-28 bg-red-500 shadow-lg shadow-red-300' 
            : isProcessing
              ? 'w-28 h-28 bg-amber-500 shadow-lg shadow-amber-300'
              : 'w-24 h-24 bg-[#47CACC] hover:bg-[#3aa8a9] shadow-md hover:shadow-lg'
        }`}>
          {/* Círculo pulsante SOLO durante grabación activa */}
          {isRecording && !isProcessing && (
            <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-50"></div>
          )}
          
          {/* Indicador de autoguardado SOLO durante grabación */}
          {isRecording && !isProcessing && isAutoSaving && (
            <div className="absolute -top-2 -right-2 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full z-20 animate-pulse">
              Guardando...
            </div>
          )}
          
          {/* Botón */}
          <button
            onClick={isRecording ? stopRecording : isProcessing ? undefined : startRecording}
            className={`w-full h-full rounded-full flex items-center justify-center focus:outline-none focus:ring-4 focus:ring-white/30 transition-all z-10 ${isProcessing ? 'cursor-not-allowed' : 'cursor-pointer'}`}
            aria-label={isRecording ? "Detener grabación" : isProcessing ? "Procesando" : "Iniciar grabación"}
            disabled={isProcessing}
          >
            {isRecording ? (
              <div className="w-8 h-8 bg-white rounded"></div>
            ) : isProcessing ? (
              <svg className="animate-spin h-10 w-10 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            )}
          </button>
        </div>

        {/* ✅ ESTADOS VISUALES MEJORADOS - Sin solapamiento */}
        {(isRecording || isProcessing || processingStatus) && (
          <div className="mt-6 min-w-[200px]">
            {/* ✅ MOSTRAR contador SOLO durante grabación activa */}
            {isRecording && !isProcessing && (
              <div className="flex items-center justify-center bg-red-100 text-red-700 font-medium px-4 py-1.5 rounded-full">
                <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse mr-2"></div>
                <span className="text-sm">
                  Grabando {formatTime(recordingDuration)}
                  {isAutoSaving && (
                    <span className="ml-2 text-green-600 text-xs">• Guardando</span>
                  )}
                </span>
              </div>
            )}
            
            {/* ✅ MOSTRAR procesamiento SOLO cuando no está grabando */}
            {!isRecording && isProcessing && processingStatus && (
              <div className="flex flex-col items-center space-y-2 w-full">
                {/* ✅ MOSTRAR duración final al comenzar procesamiento */}
                {finalRecordingDuration > 0 && processingStep === 1 && (
                  <div className="flex items-center justify-center bg-green-100 text-green-700 font-medium px-4 py-1.5 rounded-full mb-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm">
                      Grabado: {formatTime(finalRecordingDuration)}
                    </span>
                  </div>
                )}
                
                <div className="flex items-center justify-center bg-amber-100 text-amber-700 font-medium px-4 py-1.5 rounded-full w-full">
                  <div className="w-2 h-2 bg-amber-600 rounded-full animate-pulse mr-2"></div>
                  <span className="text-sm">{processingStatus}</span>
                </div>
                {renderProgressIndicator()}
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* ✅ TEXTO de instrucción más claro */}
      <p className={`mt-4 text-sm text-gray-600 transition-opacity duration-300 ${isRecording || isProcessing ? 'opacity-0' : 'opacity-100'}`}>
        {isProcessing ? '' : `Presiona el botón para ${isRecording ? "detener" : "iniciar"} la grabación`}
      </p>
    </div>
  );
}