Aquí tienes el **README** actualizado con la información sobre el archivo `credentials.json` que configuramos para la integración con **Google Drive API**. 📄🚀

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
Crea un archivo **`.env`** en la raíz del proyecto y añade lo siguiente:

```env
OPENAI_API_KEY=tu_api_key_de_openai
GOOGLE_DRIVE_FOLDER_ID=tu_folder_id_en_drive
```
🔹 **`OPENAI_API_KEY`** → Obtén una clave en [OpenAI](https://platform.openai.com/).  
🔹 **`GOOGLE_DRIVE_FOLDER_ID`** → Crea una carpeta en Google Drive y copia su ID.  

---

### **4️⃣ Configurar Credenciales de Google Drive**
Para permitir que la aplicación suba archivos a Google Drive, necesitas configurar una **Cuenta de Servicio** en Google Cloud.

#### **🔹 Paso 1: Crear Credenciales en Google Cloud**
1. **Accede a la Consola de Google Cloud**:  
   👉 [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto.
3. Habilita la **Google Drive API** en el proyecto.
4. Ve a **Credenciales** > **Crear Credenciales** > **Cuenta de Servicio**.
5. Asigna el rol **Editor** o **Propietario**.
6. Descarga el archivo **JSON** de las credenciales.

#### **🔹 Paso 2: Guardar el archivo `credentials.json`**
Guarda el archivo JSON en la raíz del proyecto con el nombre **`credentials.json`**.

Ejemplo de cómo debería verse tu archivo:

```json
{
  "type": "service_account",
  "project_id": "tu-proyecto-id",
  "private_key_id": "tu-clave-privada-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\ntu-clave-aqui\n-----END PRIVATE KEY-----\n",
  "client_email": "tu-email@tu-proyecto.iam.gserviceaccount.com",
  "client_id": "tu-client-id",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/tu-email@tu-proyecto.iam.gserviceaccount.com"
}
```

---

### **5️⃣ Instalar y Configurar FFmpeg**
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
🔹 **Solución:**  
1. Comparte la carpeta de Google Drive con el correo de la **Cuenta de Servicio**.  
2. Asegúrate de que el `credentials.json` está bien configurado.  

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