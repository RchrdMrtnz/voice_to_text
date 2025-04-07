import type { NextApiRequest, NextApiResponse } from 'next';
import nodemailer from 'nodemailer';

type EmailData = {
  to: string;
  cc?: string;
  subject: string;
  summary: string;
  transcription?: string | null;
  fileTitle: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método no permitido' });
  }

  // Validación de datos de entrada
  const { to, cc, subject, summary, transcription, fileTitle }: EmailData = req.body;

  if (!to || !summary || !fileTitle) {
    return res.status(400).json({ 
      message: 'Faltan datos requeridos: to, summary o fileTitle' 
    });
  }

  // Validar formato de email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    return res.status(400).json({ message: 'Formato de email inválido' });
  }

  try {
    // Verificar que las variables de entorno estén configuradas
    const requiredEnvVars = ['EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASSWORD'];
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Variable de entorno faltante: ${envVar}`);
      }
    }

    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || '587', 10),
      secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for otros puertos
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
      // Mejor manejo de timeouts
      connectionTimeout: 10000, // 10 segundos
      socketTimeout: 10000,
    });

    // Verificar la conexión con el servidor SMTP
    await transporter.verify().catch(error => {
      console.error('Error verificando conexión SMTP:', error);
      throw new Error('No se pudo conectar al servidor SMTP');
    });

    const currentDate = new Date().toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const cleanFileName = fileTitle.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_');
    const fileName = `Resumen_${cleanFileName}.txt`;

    const mailOptions = {
      from: `"Procencia" <${process.env.EMAIL_USER}>`,
      to,
      cc: cc || undefined,
      subject,
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="https://media1-production-mightynetworks.imgix.net/asset/9b3f1e09-d541-4126-aa48-29cec65af478/Disen_o_sin_ti_tulo__2_.png?ixlib=rails-4.2.0&auto=format&w=256&h=256&fit=crop&impolicy=Avatar" alt="Logo de Procencia" style="max-width: 150px;">
        </div>
        
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
          <h2 style="color: #47CACC; margin-top: 0;">Resumen de Transcripción</h2>
          <p style="margin-bottom: 5px;"><strong>Archivo:</strong> ${fileTitle}</p>
          <p style="margin-bottom: 5px;"><strong>Fecha:</strong> ${currentDate}</p>
        </div>
        
        <div style="background-color: #f0fdfa; padding: 15px; border-radius: 5px; border-left: 4px solid #47CACC; margin-bottom: 25px;">
          <h3 style="color: #333; margin-top: 0;">Resumen</h3>
          <p style="line-height: 1.6; white-space: pre-line;">${summary}</p>
        </div>
        
        ${
          transcription
            ? `
              <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 25px;">
                <h3 style="color: #333; margin-top: 0;">Transcripción Completa</h3>
                <p style="line-height: 1.6; white-space: pre-line;">${transcription}</p>
              </div>
            `
            : ''
        }
        
        <div style="margin-top: 20px; padding: 15px; background-color: #f0f9ff; border-radius: 5px; border-left: 4px solid #3b82f6;">
          <p style="margin: 0;">Se ha adjuntado el archivo del resumen a este correo.</p>
        </div>
        
        <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #eee; font-size: 12px; color: #777; text-align: center;">
          <p>Este es un correo automático enviado desde la plataforma de Procencia.</p>
          <p>© ${new Date().getFullYear()} Procencia. Todos los derechos reservados.</p>
        </div>
      </div>
    `,
      attachments: [
        {
          filename: fileName,
          content: summary,
          contentType: 'text/plain'
        }
      ]
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Correo enviado:', info.messageId);

    return res.status(200).json({ 
      message: 'Correo enviado exitosamente', 
      messageId: info.messageId 
    });
  } catch (error) {
    console.error('Error al enviar correo:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    
    return res.status(500).json({ 
      message: 'Error al enviar el correo',
      error: process.env.NODE_ENV === 'development' ? errorMessage : 'Error interno del servidor',
      details: process.env.NODE_ENV === 'development' ? 
        (error instanceof Error ? error.stack : undefined) : undefined
    });
  }
}