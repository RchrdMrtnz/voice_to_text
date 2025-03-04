// app/api/transcribe/route.ts
import { NextRequest, NextResponse } from "next/server";
import { OpenAI } from "openai";

// Inicializamos OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No se encontró archivo" }, { status: 400 });
    }

    // Llamamos a OpenAI Whisper
    const whisperResponse = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file,
    });

    if (!whisperResponse.text) {
      return NextResponse.json(
        { error: "No se pudo obtener la transcripción" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      text: whisperResponse.text,
      message: "Transcripción exitosa",
    });
  } catch (error) {
    console.error("Error en la transcripción:", error);
    return NextResponse.json(
      {
        error: "Error en la transcripción",
        details: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}
