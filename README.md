Aquí tienes un **README** completo y bien estructurado para tu proyecto de transcripción de audios con **Next.js, Whisper y Google Drive**.

---

# 🎙️ Transcripción de Audios con Whisper y Google Drive

Este proyecto permite **grabar o subir audios**, transcribirlos automáticamente utilizando **OpenAI Whisper**, y almacenar tanto el audio como la transcripción en **Google Drive**. 🚀

## 📌 **Características**
✔️ **Subida de múltiples audios** desde la PC.  
✔️ **Grabación en vivo** con detección automática de idioma.  
✔️ **Conversión automática de formato** a uno compatible con Whisper.  
✔️ **Detección de idioma automática** en Whisper.  
✔️ **Subida a Google Drive** del audio y transcripción con enlace de descarga.  
✔️ **Interfaz moderna y accesible** con **notificaciones** de estado.  

---

## 🛠️ **Tecnologías Utilizadas**
- **Next.js 13** → Framework de React.  
- **TypeScript** → Tipado seguro en JavaScript.  
- **Tailwind CSS** → Diseño moderno y estilizado.  
- **OpenAI Whisper API** → Transcripción de audios con IA.  
- **Google Drive API** → Almacenamiento de audios y transcripciones.  
- **FFmpeg** → Conversión de audios a formatos compatibles.  

---

## 📦 **Instalación y Configuración**

### **1️⃣ Clonar el Repositorio**
```sh
git clone https://github.com/tuusuario/tu-repositorio.git
cd tu-repositorio
```

### **2️⃣ Instalar Dependencias**
```sh
npm install
```

### **3️⃣ Configurar Variables de Entorno**
Crea un archivo **`.env.local`** en la raíz del proyecto y añade lo siguiente:

```env
OPENAI_API_KEY=tu_api_key_de_openai
GOOGLE_CLIENT_EMAIL=tu_google_client_email
GOOGLE_PRIVATE_KEY="tu_google_private_key"
GOOGLE_DRIVE_FOLDER_ID=tu_folder_id_en_drive
```
🔹 **`OPENAI_API_KEY`** → Obtén una clave en [OpenAI](https://platform.openai.com/).  
🔹 **`GOOGLE_CLIENT_EMAIL` y `GOOGLE_PRIVATE_KEY`** → Configura Google Drive API.  
🔹 **`GOOGLE_DRIVE_FOLDER_ID`** → Crea una carpeta en Drive y copia su ID.  

### **4️⃣ Instalar y Configurar FFmpeg**
#### **Windows**
Descargar desde: [FFmpeg Oficial](https://ffmpeg.org/download.html)  
Asegurar que está en **PATH** con:
```sh
ffmpeg -version
```

#### **Mac/Linux**
```sh
brew install ffmpeg
# o en Linux
sudo apt install ffmpeg
```

---

## 🚀 **Ejecutar el Proyecto**
```sh
npm run dev
```
📍 Abre en tu navegador: **http://localhost:3000**

---

## 🎯 **Cómo Usar la Aplicación**
1. **📂 Sube un audio** desde tu PC (MP3, WAV, OGG, etc.).  
2. **🎙️ O graba un audio** en vivo desde el navegador.  
3. **🔄 El sistema convierte el audio** a un formato compatible si es necesario.  
4. **📡 Whisper transcribe automáticamente** el audio detectando el idioma.  
5. **📤 El audio y transcripción se suben a Google Drive** con un enlace de descarga.  

---

## 🛠️ **Problemas Comunes y Soluciones**
### ❌ **Error: "Unrecognized file format"**
🔹 **Solución:** FFmpeg no reconoce el formato del archivo. Asegúrate de que está instalado y configurado correctamente.  

### ❌ **Error: "Permission denied" con Google Drive**
🔹 **Solución:** Revisa los permisos del **Google Service Account** y asegúrate de que puede escribir en la carpeta especificada en `GOOGLE_DRIVE_FOLDER_ID`.  

---

## 🏗️ **Futuras Mejoras**
- ✅ **Soporte para traducción automática** después de la transcripción.  
- ✅ **Historial de transcripciones** para cada usuario.  
- ✅ **Interfaz mejorada** con vista previa de audios subidos.  

---

## 👩‍💻 **Desarrollado por**
💡 **Oriana Mendez**  

🚀 **¡Disfruta transcribiendo audios con inteligencia artificial!** 🎧✨

---

Si necesitas **más ajustes o detalles específicos**, dime y lo adaptamos. ¡Espero que este README te ayude! 🚀💻