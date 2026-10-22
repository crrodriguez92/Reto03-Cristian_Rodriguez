
import express from "express";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { validarSolicitud } from "./tools/oc";

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const ROOT = process.cwd();
const FIXTURES = resolve(ROOT, "fixtures", "solicitudes");

app.use(express.json());
app.use(express.static(resolve(ROOT, "public")));

function leerJson(ruta: string): unknown {
  return JSON.parse(readFileSync(ruta, "utf8"));
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "reto-03" });
});

// Lista los casos disponibles sin modificar sus archivos.
app.get("/api/casos", (_req, res) => {
  try {
    const casos = readdirSync(FIXTURES, { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .map((item) => item.name)
      .filter((id) =>
        existsSync(join(FIXTURES, id, "solicitud.json"))
      )
      .sort();

    res.json({ ok: true, casos });
  } catch {
    res.status(500).json({
      ok: false,
      error: "No fue posible leer los casos de prueba.",
    });
  }
});

// Devuelve los datos del caso seleccionado.
app.get("/api/casos/:id", (req, res) => {
  const id = req.params.id;

  if (!/^sol-\d{3}$/.test(id)) {
    res.status(400).json({ ok: false, error: "Identificador inválido." });
    return;
  }

  const carpeta = resolve(FIXTURES, id);

  try {
    const solicitud = leerJson(join(carpeta, "solicitud.json"));
    const aprobacion = leerJson(join(carpeta, "aprobacion.json"));

    res.json({
      ok: true,
      id,
      solicitud,
      aprobacion,
      cotizacion: existsSync(join(carpeta, "cotizacion.txt"))
        ? readFileSync(join(carpeta, "cotizacion.txt"), "utf8")
        : null,
      factura: existsSync(join(carpeta, "factura.txt"))
        ? readFileSync(join(carpeta, "factura.txt"), "utf8")
        : null,
    });
  } catch {
    res.status(404).json({
      ok: false,
      error: "No se pudo cargar la solicitud o su aprobación.",
    });
  }
});

// Ejecuta el validador existente con los datos originales.
app.post("/api/casos/:id/validar", (req, res) => {
  const id = req.params.id;

  if (!/^sol-\d{3}$/.test(id)) {
    res.status(400).json({ ok: false, error: "Identificador inválido." });
    return;
  }

  const carpeta = resolve(FIXTURES, id);

  try {
    const solicitud = leerJson(join(carpeta, "solicitud.json"));
    const aprobacion = leerJson(join(carpeta, "aprobacion.json"));
    const resultado = validarSolicitud(solicitud, aprobacion);

    res.json({ ok: true, resultado });
  } catch {
    res.status(500).json({
      ok: false,
      error: "No fue posible validar la solicitud.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor iniciado en http://localhost:${PORT}`);
});
