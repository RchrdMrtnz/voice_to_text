import { useEffect, useState } from "react";
import ReactDOM from "react-dom";

interface ExitModalProps {
  show: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const ExitModal = ({ show, onClose, onConfirm }: ExitModalProps) => {
  const [isBrowser, setIsBrowser] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    // Verificar si estamos en el navegador (cliente)
    setIsBrowser(true);

    // Crear el elemento `modal-root` si no existe
    if (!document.getElementById("modal-root")) {
      const modalRoot = document.createElement("div");
      modalRoot.setAttribute("id", "modal-root");
      document.body.appendChild(modalRoot);
    }

    // Resetear el estado de cierre cuando el modal se muestra
    if (show) {
      setIsClosing(false);
    }

    // Limpieza al desmontar
    return () => {
      const modalRoot = document.getElementById("modal-root");
      if (modalRoot && modalRoot.childNodes.length === 0) {
        document.body.removeChild(modalRoot);
      }
    };
  }, [show]);

  const handleClose = (e: React.MouseEvent) => {
    e.preventDefault();
    animateClose(onClose);
  };

  const handleConfirm = (e: React.MouseEvent) => {
    e.preventDefault();
    animateClose(onConfirm);
  };

  const animateClose = (callback: () => void) => {
    setIsClosing(true);
    setTimeout(() => {
      callback();
    }, 300); // Duración de la animación
  };

  const modalContent = show ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-modal-title"
      aria-describedby="exit-modal-description"
      className={`fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 transition-opacity duration-300 ${
        isClosing ? "opacity-0" : "opacity-100"
      }`}
      onClick={handleClose}
    >
      <article
        className={`bg-white rounded-xl shadow-2xl max-w-md w-full transform transition-all duration-300 ${
          isClosing ? "scale-95 opacity-0" : "scale-100 opacity-100"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="bg-red-50 px-6 py-4 rounded-t-xl border-b border-red-100 flex items-center">
          <div className="bg-red-100 p-2 rounded-full mr-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 id="exit-modal-title" className="text-xl font-bold text-red-700">
            Advertencia
          </h2>
        </div>
        
        {/* Contenido */}
        <div className="px-6 py-6">
          <p id="exit-modal-description" className="text-gray-700 text-base leading-relaxed mb-2">
            Tienes procesos activos en este momento. Si sales ahora, perderás todo tu progreso.
          </p>
          <p className="text-gray-600 text-sm">
            Los archivos que están siendo procesados no se guardarán.
          </p>
        </div>
        
        {/* Pie del modal */}
        <div className="px-6 py-4 bg-gray-50 rounded-b-xl border-t border-gray-100 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button
            onClick={handleClose}
            className="px-4 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded-lg transition-colors w-full sm:w-auto text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
          >
            Continuar el proceso
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors w-full sm:w-auto text-sm flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Salir de todos modos
          </button>
        </div>
      </article>
    </div>
  ) : null;

  if (isBrowser) {
    const modalRoot = document.getElementById("modal-root");
    if (!modalRoot) {
      console.error("El elemento 'modal-root' no se encontró en el DOM.");
      return null;
    }
    return ReactDOM.createPortal(modalContent, modalRoot);
  } else {
    return null;
  }
};

export default ExitModal;