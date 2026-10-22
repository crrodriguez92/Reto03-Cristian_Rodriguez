
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

// Alteramos únicamente el proveedor para probar la regla RC1.
solicitud.proveedor_nombre = "Consultores Ágiles S.A.S.";
solicitud.proveedor_nit = "901777888";

const resultado = validarSolicitud(solicitud, aprobacion);

console.log("=== Prueba negativa: proveedor inactivo ===");
console.log(JSON.stringify(resultado, null, 2));

const bloqueadoPorProveedor = resultado.errores.some(
  (error) => error.includes("RC1") && error.includes("inactivo")
);

if (!bloqueadoPorProveedor) {
  throw new Error(
    "La prueba falló: el proveedor inactivo no fue bloqueado mediante RC1."
  );
}

console.log("PRUEBA SUPERADA: RC1 bloqueó el proveedor inactivo.");
