"use client";

import { useState, useEffect } from "react";
import toast from "react-hot-toast";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal = ({ isOpen, onClose }: SettingsModalProps) => {
  const [defaultEmail, setDefaultEmail] = useState("");
  const [loading, setLoading] = useState(false);

  // Cargar email guardado cuando se abre el modal
  useEffect(() => {
    if (isOpen) {
      const savedEmail = localStorage.getItem("defaultEmail") || "";
      setDefaultEmail(savedEmail);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!defaultEmail) {
      toast.error("Por favor, ingresa una dirección de correo");
      return;
    }

    setLoading(true);

    try {
      // Validar el formato del correo electrónico
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(defaultEmail)) {
        throw new Error("Formato de correo electrónico inválido");
      }

      // Guardar en localStorage
      localStorage.setItem("defaultEmail", defaultEmail);
      
      toast.success("Configuración guardada correctamente");
      onClose();
    } catch (error) {
      console.error("Error al guardar la configuración:", error);
      toast.error(error instanceof Error ? error.message : "Error al guardar la configuración");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-300">
      <div className="bg-white rounded-xl w-full max-w-md p-6 relative shadow-lg border border-gray-100 transform transition-all duration-300">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Cerrar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-2xl font-bold text-gray-800 mb-6">Configuración</h2>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="defaultEmail" className="block text-sm font-medium text-gray-700 mb-2">
              Correo predeterminado para envíos
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <input
                type="email"
                id="defaultEmail"
                value={defaultEmail}
                onChange={(e) => setDefaultEmail(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#47CACC] focus:border-[#47CACC] transition-all duration-200"
                placeholder="ejemplo@correo.com"
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Este correo se usará para enviar automáticamente los resúmenes cuando presiones el botón "Enviar".
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300 transition-colors duration-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`px-5 py-2.5 text-sm font-medium text-white rounded focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#47CACC] transition-all duration-200 ${
                loading ? "bg-gray-400 cursor-not-allowed" : "bg-[#47CACC] hover:bg-[#3aa8a9] shadow-md hover:shadow-lg"
              }`}
            >
              {loading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Guardando...
                </span>
              ) : (
                "Guardar"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SettingsModal;