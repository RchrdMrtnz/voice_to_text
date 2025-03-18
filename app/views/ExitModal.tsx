import { useEffect, useState } from "react";
import ReactDOM from "react-dom";

interface ExitModalProps {
  show: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const ExitModal = ({ show, onClose, onConfirm }: ExitModalProps) => {
  const [isBrowser, setIsBrowser] = useState(false);

  useEffect(() => {
    // Verificar si estamos en el navegador (cliente)
    setIsBrowser(true);

    // Crear el elemento `modal-root` si no existe
    if (!document.getElementById("modal-root")) {
      const modalRoot = document.createElement("div");
      modalRoot.setAttribute("id", "modal-root");
      document.body.appendChild(modalRoot);
    }

    // Limpieza al desmontar
    return () => {
      const modalRoot = document.getElementById("modal-root");
      if (modalRoot) {
        document.body.removeChild(modalRoot);
      }
    };
  }, []);

  const handleClose = (e: React.MouseEvent) => {
    e.preventDefault();
    onClose();
  };

  const handleConfirm = (e: React.MouseEvent) => {
    e.preventDefault();
    onConfirm();
  };

  const modalContent = show ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-modal-title"
      aria-describedby="exit-modal-description"
      className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50"
      onClick={handleClose}
    >
      <article
        className="bg-white px-8 py-14 rounded-xl shadow-xl text-center max-w-md w-full flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="exit-modal-title" className="text-2xl font-bold text-red-600 mb-4">
          ⚠️ Advertencia
        </h2>
        <p id="exit-modal-description" className="text-gray-700 text-lg leading-relaxed mb-4">
          Tienes procesos activos en este momento. Si sales ahora,{" "}
          <strong>perderás todo tu progreso</strong>.
          <br />
          <br />
          ¿Seguro que quieres salir de la página?
        </p>
        <div className="mt-6 flex justify-around sm:flex-row w-full gap-4">
          <button
            onClick={handleConfirm}
            className="bg-red-500 hover:bg-red-600 text-white font-semibold px-6 py-3 rounded w-full sm:w-auto transition-all"
          >
            Salir
          </button>
          <button
            onClick={handleClose}
            className="bg-green-500 hover:bg-green-600 text-white font-semibold px-6 py-3 rounded w-full sm:w-auto transition-all"
          >
            Continuar el proceso
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