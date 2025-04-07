// pages/api/send-email.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import nodemailer from 'nodemailer';
import type { SentMessageInfo } from 'nodemailer';

type EmailData = {
  to: string;
  cc?: string;
  subject: string;
  summary: string;
  transcription?: string | null;
  fileTitle: string;
};

type ApiResponse = {
  message: string;
  messageId?: string;
  error?: string;
  debug?: any;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  // 1. Verificación del método HTTP
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ message: 'Método no permitido' });
  }

  // 2. Validación de datos de entrada
  const { to, cc, subject, summary, transcription, fileTitle }: EmailData = req.body;

  if (!to || !summary || !fileTitle) {
    return res.status(400).json({ 
      message: 'Faltan datos requeridos: to, summary o fileTitle' 
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    return res.status(400).json({ 
      message: 'Formato de email inválido para el destinatario' 
    });
  }

  // 3. Validación de variables de entorno
  const requiredEnvVars = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM_EMAIL'];
  const missingVars = requiredEnvVars.filter(v => !process.env[v]);

  if (missingVars.length > 0) {
    return res.status(500).json({
      message: 'Configuración SMTP incompleta',
      debug: process.env.NODE_ENV === 'development' ? { missingVars } : undefined
    });
  }

  try {
    // 4. Configuración del transporter SMTP
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST, // mail.smtp2go.com
      port: parseInt(process.env.SMTP_PORT || '2525'), // 2525, 587, 465, etc.
      secure: process.env.SMTP_SECURE === 'true', // true para SSL (puerto 465)
      auth: {
        user: process.env.SMTP_USER, // labs@racksmafia.com
        pass: process.env.SMTP_PASSWORD // FSjTzb2UWRqR3jnI
      },
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production' // Verificar certificados en producción
      },
      connectionTimeout: 10000, // 10 segundos
      socketTimeout: 10000
    });

    // 5. Verificación de conexión SMTP
    await transporter.verify();
    console.log('Conexión SMTP verificada');

    // 6. Preparación de contenido del email
    const currentDate = new Date().toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const cleanFileName = fileTitle
      .replace(/[^\w\s.-]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 100); // Limitar longitud del nombre

    const mailOptions = {
      from: process.env.SMTP_FROM_EMAIL || `"ProcencIA" <${process.env.SMTP_USER}>`,
      to,
      cc: cc?.split(',').map(e => e.trim()).filter(e => emailRegex.test(e)) || undefined,
      subject: subject.slice(0, 150), // Limitar longitud del asunto
      html: generateEmailTemplate({
        fileTitle,
        currentDate,
        summary,
        transcription,
        currentYear: new Date().getFullYear(),
        logoUrl: process.env.EMAIL_LOGO_URL
      }),
      attachments: [
        {
          filename: `Resumen_${cleanFileName}.txt`,
          content: summary,
          contentType: 'text/plain'
        }
      ],
      priority: 'high' as const
    };

    // 7. Envío del email
    const info: SentMessageInfo = await transporter.sendMail(mailOptions);
    console.log('Correo enviado:', {
      messageId: info.messageId,
      to: info.accepted
    });

    return res.status(200).json({ 
      message: 'Correo enviado exitosamente',
      messageId: info.messageId
    });

  } catch (error: unknown) {
    // 8. Manejo de errores
    console.error('Error en send-email:', error);

    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    const errorResponse: ApiResponse = {
      message: 'Error al enviar el correo',
      error: errorMessage
    };

    if (process.env.NODE_ENV === 'development') {
      errorResponse.debug = {
        stack: error instanceof Error ? error.stack : undefined,
        smtpConfig: {
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT,
          user: process.env.SMTP_USER ? '***' : 'undefined'
        }
      };
    }

    return res.status(500).json(errorResponse);
  }
}

// Función auxiliar para generar el template HTML
function generateEmailTemplate(params: {
  fileTitle: string;
  currentDate: string;
  summary: string;
  transcription?: string | null;
  currentYear: number;
  logoUrl?: string;
}): string {
  const defaultLogo = 'https://media1-production-mightynetworks.imgix.net/asset/9b3f1e09-d541-4126-aa48-29cec65af478/Disen_o_sin_ti_tulo__2_.png?ixlib=rails-4.2.0&auto=format&w=256&h=256&fit=crop&impolicy=Avatar';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="${params.logoUrl || defaultLogo}" alt="Logo de Procencia" style="max-width: 150px;">
      </div>
      
      <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
        <h2 style="color: #47CACC; margin-top: 0;">Resumen de Transcripción</h2>
        <p style="margin-bottom: 5px;"><strong>Archivo:</strong> ${escapeHtml(params.fileTitle)}</p>
        <p style="margin-bottom: 5px;"><strong>Fecha:</strong> ${params.currentDate}</p>
      </div>
      
      <div style="background-color: #f0fdfa; padding: 15px; border-radius: 5px; border-left: 4px solid #47CACC; margin-bottom: 25px;">
        <h3 style="color: #333; margin-top: 0;">Resumen</h3>
        <p style="line-height: 1.6; white-space: pre-line;">${escapeHtml(params.summary)}</p>
      </div>
      
      ${params.transcription ? `
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 25px;">
          <h3 style="color: #333; margin-top: 0;">Transcripción Completa</h3>
          <p style="line-height: 1.6; white-space: pre-line;">${escapeHtml(params.transcription)}</p>
        </div>
      ` : ''}
      
      <div style="margin-top: 20px; padding: 15px; background-color: #f0f9ff; border-radius: 5px; border-left: 4px solid #3b82f6;">
        <p style="margin: 0;">Se ha adjuntado el archivo del resumen a este correo.</p>
      </div>
      
      <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #eee; font-size: 12px; color: #777; text-align: center;">
        <p>Este es un correo automático enviado desde la plataforma de Procencia.</p>
        <p>© ${params.currentYear} Procencia. Todos los derechos reservados.</p>
      </div>
    </div>
  `;
}

// Función para escapar caracteres HTML (seguridad XSS)
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}