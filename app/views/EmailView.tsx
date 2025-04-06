"use client";

import { useState, useEffect } from "react";
import toast from "react-hot-toast";

interface EmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  fileTitle: string;
  transcription?: string;
}

const EmailModal = ({ isOpen, onClose, content, fileTitle, transcription }: EmailModalProps) => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCc, setShowCc] = useState(false);
  const [ccEmail, setCcEmail] = useState("");
  const [includeTranscription, setIncludeTranscription] = useState(false);
  const [useDefaultEmail, setUseDefaultEmail] = useState(true);
  const [hasDefaultEmail, setHasDefaultEmail] = useState(false);

  // Verificar si hay email guardado cuando el componente se monta
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedEmail = localStorage.getItem("defaultEmail") || "";
      setHasDefaultEmail(!!savedEmail);
      
      if (isOpen && savedEmail && useDefaultEmail) {
        setEmail(savedEmail);
      }
    }
  }, [isOpen, useDefaultEmail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      toast.error("Por favor, ingresa una dirección de correo");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/send-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: email,
          cc: showCc ? ccEmail : "",
          subject: `Resumen: ${fileTitle}`,
          summary: content,
          transcription: includeTranscription ? transcription : null,
          fileTitle
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Error al enviar el correo");
      }

      toast.success("Correo enviado exitosamente");
      // No resetear el email si se está usando el predeterminado
      if (!useDefaultEmail) {
        setEmail("");
      }
      setCcEmail("");
      setIncludeTranscription(false);
      onClose();
    } catch (error) {
      console.error("Error al enviar el correo:", error);
      toast.error(error instanceof Error ? error.message : "Error al enviar el correo");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-md md:max-w-lg p-6 relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
          aria-label="Cerrar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-xl font-semibold text-gray-800 mb-4">Enviar resumen por correo</h2>
        
        <form onSubmit={handleSubmit}>
          {hasDefaultEmail && (
            <div className="mb-4 flex items-center">
              <input
                type="checkbox"
                id="useDefaultEmail"
                checked={useDefaultEmail}
                onChange={(e) => {
                  setUseDefaultEmail(e.target.checked);
                  if (e.target.checked) {
                    setEmail(localStorage.getItem("defaultEmail") || "");
                  } else {
                    setEmail("");
                  }
                }}
                className="mr-2 h-4 w-4 text-[#47CACC] border-gray-300 rounded focus:ring-[#47CACC]"
              />
              <label htmlFor="useDefaultEmail" className="text-sm text-gray-700">
                Usar correo predeterminado
              </label>
            </div>
          )}

          <div className="mb-4">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Destinatario *
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (hasDefaultEmail && e.target.value !== localStorage.getItem("defaultEmail")) {
                  setUseDefaultEmail(false);
                }
              }}
              className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-[#47CACC] focus:border-[#47CACC] ${
                useDefaultEmail ? "bg-gray-50" : ""
              }`}
              placeholder="ejemplo@correo.com"
              required
            />
          </div>

          <div className="mb-2">
            <button
              type="button"
              onClick={() => setShowCc(!showCc)}
              className="text-sm text-[#47CACC] hover:text-[#3aa8a9] flex items-center"
            >
              {showCc ? "Ocultar CC" : "Agregar CC"}{" "}
              <span className="ml-1">{showCc ? "▲" : "▼"}</span>
            </button>
          </div>

          {showCc && (
            <div className="mb-4">
              <label htmlFor="cc" className="block text-sm font-medium text-gray-700 mb-1">
                CC
              </label>
              <input
                type="email"
                id="cc"
                value={ccEmail}
                onChange={(e) => setCcEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-[#47CACC] focus:border-[#47CACC]"
                placeholder="cc@correo.com"
              />
            </div>
          )}

          {transcription && (
            <div className="mb-4 flex items-center">
              <input
                type="checkbox"
                id="includeTranscription"
                checked={includeTranscription}
                onChange={(e) => setIncludeTranscription(e.target.checked)}
                className="mr-2 h-4 w-4 text-[#47CACC] border-gray-300 rounded focus:ring-[#47CACC]"
              />
              <label htmlFor="includeTranscription" className="text-sm text-gray-700">
                Incluir transcripción completa
              </label>
            </div>
          )}

          <div className="mb-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Vista previa del resumen:</h3>
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-md max-h-40 overflow-y-auto">
              <p className="text-sm text-gray-600 whitespace-pre-line">
                {content.length > 300 ? `${content.substring(0, 300)}...` : content}
              </p>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              El archivo de resumen se adjuntará automáticamente al correo.
            </p>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#47CACC] ${
                loading ? "bg-gray-400" : "bg-[#47CACC] hover:bg-[#3aa8a9]"
              }`}
            >
              {loading ? "Enviando..." : "Enviar correo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EmailModal;