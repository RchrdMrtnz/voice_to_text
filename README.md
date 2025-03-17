# Voice-to-Text Frontend

## 📄 Descripción

Este es el frontend de una aplicación de transcripción de audio a texto utilizando **Next.js** y **TailwindCSS**. Se conecta con un backend en **FastAPI** que procesa audios mediante **Whisper** y almacena los archivos en **S3**.

Los usuarios pueden:
- Grabar audios directamente desde la app.
- Subir archivos de audio para transcribir.
- Ver el estado de procesamiento de la transcripción.
- Descargar los archivos transcritos.

## 🛠️ Tecnologías Utilizadas
- **Next.js** 13
- **React** 18
- **TailwindCSS**
- **TypeScript**
- **AWS S3** (para almacenamiento de audios y transcripciones)
- **Axios** (para la comunicación con el backend)
- **MediaRecorder API** (para grabación de audio en navegadores)

## 🔄 Instalación y Ejecución

### 1. Clonar el Repositorio
```bash
git clone https://github.com/tu_usuario/voice-to-text-frontend.git
cd voice-to-text-frontend
```

### 2. Instalar Dependencias
```bash
npm install
```

### 3. Configurar el Backend
Asegúrate de que el backend de transcripción (FastAPI + Whisper) esté corriendo y configurado correctamente.

### 4. Ejecutar el Proyecto en Desarrollo
```bash
npm run dev
```
Esto iniciará el servidor en `http://localhost:3000`

## 📲 Características Principales
- **Grabar audio desde la app** y subirlo al backend.
- **Subir archivos desde el dispositivo** y obtener la transcripción.
- **Monitoreo del estado** de procesamiento de los audios.
- **Descarga de archivos** transcritos desde AWS S3.
- **Interfaz responsiva** y atractiva con TailwindCSS.

## 💡 Configuración de Variables de Entorno
Antes de ejecutar el proyecto, define las variables de entorno necesarias en un archivo `.env.local` en la raíz del proyecto:
```env
NEXT_PUBLIC_BACKEND_URL=https://tu-backend.com/api
```

## 🛠️ Dependencias Clave
```json
{
  "dependencies": {
    "@heroicons/react": "^2.2.0",
    "axios": "^1.8.2",
    "clsx": "^2.1.1",
    "next": "13.4.9",
    "react": "18.2.0",
    "react-dom": "18.2.0",
    "react-hot-toast": "^2.5.2",
    "react-toastify": "^11.0.5",
    "tailwindcss": "3.3.2",
    "uuid": "^11.1.0"
  }
}
```

## 📝 API del Backend
El frontend consume las siguientes rutas del backend:
- `POST /upload` - Subir archivo de audio.
- `GET /transcription_status/{task_id}` - Obtener estado de la transcripción.
- `POST /transcribe/{file_name}` - Iniciar transcripción.
- `GET /files` - Obtener archivos transcritos.

