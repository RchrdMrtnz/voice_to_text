"use client"; // Asegúrate de que este componente solo se ejecute en el cliente

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
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Función para iniciar la grabación
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new RecordRTC(stream, {
        type: "audio",
        mimeType: "audio/wav",
        recorderType: RecordRTC.StereoAudioRecorder,
      });

      recorder.startRecording();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      onRecordingStart?.();

      // Iniciar temporizador de grabación
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error("Error al grabar:", error);
      toast.error("Error al iniciar la grabación. Asegúrate de permitir el acceso al micrófono.");
    }
  };

  // Función para detener la grabación
  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stopRecording(() => {
        const audioBlob = mediaRecorderRef.current?.getBlob();
        if (audioBlob) {
          onRecordingStop?.(audioBlob);
          toast.success("Grabación detenida");
        }
      });
    }

    setIsRecording(false);
    clearInterval(recordingTimerRef.current!);
    setRecordingDuration(0);
  };

  return (
    <div className="text-center">
      <h1 className="text-xl font-extrabold text-gray-700 mb-8">🎤 Graba un audio</h1>
      <div className="flex justify-center">
        {isRecording ? (
          <button
            onClick={stopRecording}
            className="p-6 rounded-full bg-red-500 text-white text-3xl shadow-md animate-pulse hover:bg-red-600 transition-all"
            aria-label="Detener grabación"
          >
            ⏹️
          </button>
        ) : (
          <button
            onClick={startRecording}
            className="p-6 rounded-full bg-[#47CACC] text-white shadow-md hover:bg-[#3aa8a9] transition-all"
            aria-label="Iniciar grabación"
          >
            <img
              src="https://test-api-bot.s3.us-east-1.amazonaws.com/microphone-solid+(1).svg"
              className="w-6 aspect-square"
              alt="Icono de micrófono"
            />
          </button>
        )}
      </div>
      {isRecording && (
        <p className="text-red-500 mt-2" aria-live="polite">
          🔴 Grabando... {recordingDuration}s
        </p>
      )}
    </div>
  );
}