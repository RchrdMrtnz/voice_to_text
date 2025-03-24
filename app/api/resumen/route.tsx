import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const s3_key = searchParams.get("s3_key");

  if (!s3_key) {
    return NextResponse.json({ error: "Falta el parámetro s3_key" }, { status: 400 });
  }

  try {
    const response = await fetch(`http://34.192.168.88/api/resumen/?s3_key=${encodeURIComponent(s3_key)}`);
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("❌ Error en el proxy resumen:", error);
    return NextResponse.json({ error: "Error al obtener el resumen" }, { status: 500 });
  }
}
