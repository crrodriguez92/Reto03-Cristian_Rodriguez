
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { validarSolicitud } from "./oc";

const carpeta = resolve(
  process.cwd(),
  "fixtures/solicitudes/sol-001"
);

const leerJson = (ruta: string): unknown =>
  JSON.parse(readFileSync(ruta, "utf8"));

const solicitud = leerJson(join(carpeta, "solicitud.json"));
const aprobacion = leerJson(join(carpeta, "aprobacion.json"));

const cotizacionPath = join(carpeta, "cotizacion.txt");
const facturaPath = join(carpeta, "factura.txt");

const resultado = validarSolicitud(solicitud, aprobacion, {
  cotizacion: existsSync(cotizacionPath)
    ? readFileSync(cotizacionPath, "utf8")
    : null,
  factura: existsSync(facturaPath)
    ? readFileSync(facturaPath, "utf8")
    : null,
});

console.log("=== Prueba de validación: sol-001 ===");
console.log(JSON.stringify(resultado, null, 2));

if (resultado.bloqueos.length > 0) {
  throw new Error(
    `La prueba positiva falló por bloqueos: ${resultado.bloqueos.join(" | ")}`
  );
}

if (resultado.confirmaciones.length > 0) {
  throw new Error(
    `La prueba requiere resolver confirmaciones: ${resultado.confirmaciones.join(" | ")}`
  );
}

if (!resultado.apta) {
  throw new Error(
    "La prueba positiva falló: la solicitud no quedó apta."
  );
}

console.log(
  "PRUEBA SUPERADA: la solicitud está apta y no requiere confirmaciones."
);
