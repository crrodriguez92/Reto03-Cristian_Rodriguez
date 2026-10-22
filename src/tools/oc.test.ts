
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validarSolicitud } from "./oc";

const carpeta = resolve(
  process.cwd(),
  "fixtures/solicitudes/sol-001"
);

const solicitud = JSON.parse(
  readFileSync(resolve(carpeta, "solicitud.json"), "utf8")
);

const aprobacion = JSON.parse(
  readFileSync(resolve(carpeta, "aprobacion.json"), "utf8")
);

const resultado = validarSolicitud(solicitud, aprobacion);

console.log("=== Prueba de validación: sol-001 ===");
console.log(JSON.stringify(resultado, null, 2));

if (!resultado.valida) {
  throw new Error(
    `La prueba positiva falló: ${resultado.errores.join(" | ")}`
  );
}

console.log(
  "PRUEBA SUPERADA: la solicitud y su aprobación son válidas."
);
