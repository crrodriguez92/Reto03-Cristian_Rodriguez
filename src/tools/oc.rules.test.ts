
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validarSolicitud } from "./oc";

const ROOT = process.cwd();
const FIXTURES = resolve(ROOT, "fixtures/solicitudes");

type Caso = {
  solicitud: Record<string, any>;
  aprobacion: Record<string, any> | null;
  cotizacion: string | null;
  factura: string | null;
};

function cargarCaso(id: string): Caso {
  const carpeta = join(FIXTURES, id);
  const leerTexto = (nombre: string): string | null => {
    const ruta = join(carpeta, nombre);
    return existsSync(ruta) ? readFileSync(ruta, "utf8") : null;
  };

  const solicitudTexto = leerTexto("solicitud.json");
  assert.ok(solicitudTexto, `${id}: falta solicitud.json`);

  const aprobacionTexto = leerTexto("aprobacion.json");

  return {
    solicitud: JSON.parse(solicitudTexto),
    aprobacion: aprobacionTexto ? JSON.parse(aprobacionTexto) : null,
    cotizacion: leerTexto("cotizacion.txt"),
    factura: leerTexto("factura.txt"),
  };
}

function validar(
  caso: Caso,
  cambios: {
    solicitud?: Record<string, any>;
    aprobacion?: Record<string, any> | null;
    cotizacion?: string | null;
    factura?: string | null;
    confirmado?: boolean;
    confirmadoPor?: string;
  } = {}
) {
  const solicitud = {
    ...caso.solicitud,
    ...cambios.solicitud,
  };

  const aprobacion =
    cambios.aprobacion === undefined
      ? caso.aprobacion
      : cambios.aprobacion;

  return validarSolicitud(solicitud, aprobacion, {
    cotizacion:
      cambios.cotizacion === undefined
        ? caso.cotizacion
        : cambios.cotizacion,
    factura:
      cambios.factura === undefined
        ? caso.factura
        : cambios.factura,
    confirmado: cambios.confirmado,
    confirmadoPor: cambios.confirmadoPor,
  });
}

const pruebas: Array<{ nombre: string; ejecutar: () => void }> = [
  {
    nombre: "RC1: acepta un proveedor activo identificado por NIT",
    ejecutar: () => {
      const resultado = validar(cargarCaso("sol-001"));
      assert.equal(resultado.proveedor?.activo, true);
      assert.ok(!resultado.bloqueos.some((e) => e.includes("RC1")));
    },
  },
  {
    nombre: "RC1: bloquea un proveedor inactivo",
    ejecutar: () => {
      const caso = cargarCaso("sol-001");
      const resultado = validar(caso, {
        solicitud: {
          proveedor_nombre: "Consultores Ágiles S.A.S.",
          proveedor_nit: "901777888",
        },
      });
      assert.ok(resultado.bloqueos.some(
        (e) => e.includes("RC1") && e.includes("inactivo")
      ));
      assert.equal(resultado.apta, false);
    },
  },
  {
    nombre: "RC1: bloquea un proveedor inexistente",
    ejecutar: () => {
      const caso = cargarCaso("sol-001");
      const resultado = validar(caso, {
        solicitud: {
          proveedor_nombre: "Proveedor Inexistente S.A.S.",
          proveedor_nit: "999999999",
        },
      });
      assert.ok(resultado.bloqueos.some(
        (e) => e.includes("RC1") && e.includes("no existe")
      ));
    },
  },
  {
    nombre: "RC2: exige evidencia de aprobación",
    ejecutar: () => {
      const resultado = validar(cargarCaso("sol-001"), {
        aprobacion: null,
      });
      assert.ok(resultado.bloqueos.some((e) => e.includes("RC2")));
    },
  },
  {
    nombre: "RC2: bloquea a un remitente no autorizado",
    ejecutar: () => {
      const caso = cargarCaso("sol-001");
      const resultado = validar(caso, {
        aprobacion: {
          ...caso.aprobacion!,
          de: "persona.no.autorizada@periferia-ficticia.com",
        },
      });
      assert.ok(resultado.bloqueos.some(
        (e) => e.includes("RC2") && e.includes("no está autorizado")
      ));
    },
  },
  {
    nombre: "RC3: bloquea un valor superior al tope del aprobador",
    ejecutar: () => {
      const resultado = validar(cargarCaso("sol-001"), {
        solicitud: {
          cantidad: 1,
          valor_unitario: 60000000,
          valor_total: 60000000,
        },
      });
      assert.ok(resultado.bloqueos.some((e) => e.includes("RC3")));
    },
  },
  {
    nombre: "RC4: bloquea un centro de costo inexistente",
    ejecutar: () => {
      const resultado = validar(cargarCaso("sol-001"), {
        solicitud: { centro_costo: "CC-9999" },
      });
      assert.ok(resultado.bloqueos.some((e) => e.includes("RC4")));
    },
  },
  {
    nombre: "RC4: bloquea una subárea que no pertenece al centro",
    ejecutar: () => {
      const resultado = validar(cargarCaso("sol-001"), {
        solicitud: { subarea: "Marketing" },
      });
      assert.ok(resultado.bloqueos.some(
        (e) => e.includes("RC4") && e.includes("subárea")
      ));
    },
  },
  {
    nombre: "RC5: solicita confirmación si la cotización supera la diferencia permitida",
    ejecutar: () => {
      const resultado = validar(cargarCaso("sol-004"));
      assert.ok(resultado.confirmaciones.some((e) => e.includes("RC5")));
      assert.equal(resultado.apta, false);
    },
  },
  {
    nombre: "RC5: solicita confirmación cuando no existe cotización",
    ejecutar: () => {
      const resultado = validar(cargarCaso("sol-001"), {
        cotizacion: null,
      });
      assert.ok(resultado.confirmaciones.some((e) => e.includes("RC5")));
    },
  },
  {
    nombre: "RC5: bloquea una cotización cuyo total no se puede interpretar",
    ejecutar: () => {
      const resultado = validar(cargarCaso("sol-001"), {
        cotizacion: "Cotización sin un total monetario identificable.",
      });
      assert.ok(resultado.bloqueos.some((e) => e.includes("RC5")));
    },
  },
  {
    nombre: "RC6: deriva el IVA y exige confirmación cuando se omite",
    ejecutar: () => {
      const resultado = validar(cargarCaso("sol-006"));
      assert.equal(resultado.derivados.indicador_iva, "C1");
      assert.ok(resultado.confirmaciones.some((e) => e.includes("RC6")));
    },
  },
  {
    nombre: "RC7: deriva condiciones de pago y solo informa",
    ejecutar: () => {
      const resultado = validar(cargarCaso("sol-006"));
      assert.equal(resultado.derivados.condiciones_pago, "Z030");
      assert.ok(resultado.observaciones.some((e) => e.includes("RC7")));
      assert.ok(!resultado.confirmaciones.some((e) => e.includes("RC7")));
    },
  },
  {
    nombre: "RC8: identifica una factura retroactiva",
    ejecutar: () => {
      const resultado = validar(cargarCaso("sol-005"));
      assert.equal(resultado.retroactiva, true);
      assert.ok(resultado.confirmaciones.some((e) => e.includes("RC8")));
    },
  },
  {
    nombre: "RC8: bloquea una factura con fecha no identificable",
    ejecutar: () => {
      const resultado = validar(cargarCaso("sol-001"), {
        factura: "Factura sin fecha de emisión.",
      });
      assert.ok(resultado.bloqueos.some((e) => e.includes("RC8")));
    },
  },
  {
    nombre: "RC9: exige confirmación si la aprobación precede a la solicitud",
    ejecutar: () => {
      const caso = cargarCaso("sol-001");
      const resultado = validar(caso, {
        aprobacion: {
          ...caso.aprobacion!,
          fecha: "2026-08-19T10:00:00-05:00",
        },
      });
      assert.ok(resultado.confirmaciones.some((e) => e.includes("RC9")));
    },
  },
  {
    nombre: "RC10: bloquea cuando cantidad por precio no coincide con el total",
    ejecutar: () => {
      const resultado = validar(cargarCaso("sol-001"), {
        solicitud: { valor_total: 11400200 },
      });
      assert.ok(resultado.bloqueos.some((e) => e.includes("RC10")));
    },
  },
  {
    nombre: "La confirmación no elimina bloqueos de negocio",
    ejecutar: () => {
      const caso = cargarCaso("sol-001");
      const resultado = validar(caso, {
        solicitud: {
          proveedor_nombre: "Consultores Ágiles S.A.S.",
          proveedor_nit: "901777888",
        },
        confirmado: true,
        confirmadoPor: "responsable@periferia-ficticia.com",
      });
      assert.ok(resultado.bloqueos.some((e) => e.includes("RC1")));
      assert.equal(resultado.apta, false);
    },
  },
  {
    nombre: "Una confirmación requiere identificar quién autoriza",
    ejecutar: () => {
      const resultado = validar(cargarCaso("sol-004"), {
        confirmado: true,
      });
      assert.ok(resultado.bloqueos.some(
        (e) => e.includes("Confirmación") && e.includes("quién autoriza")
      ));
    },
  },
  {
    nombre: "La solicitud completa sol-001 es apta",
    ejecutar: () => {
      const resultado = validar(cargarCaso("sol-001"));
      assert.equal(resultado.apta, true);
      assert.deepEqual(resultado.bloqueos, []);
      assert.deepEqual(resultado.confirmaciones, []);
    },
  },
];

let aprobadas = 0;
let fallidas = 0;

console.log("\n=== Suite de pruebas de reglas de órdenes de compra ===\n");

for (const prueba of pruebas) {
  try {
    prueba.ejecutar();
    aprobadas++;
    console.log(`PASS ${prueba.nombre}`);
  } catch (error) {
    fallidas++;
    console.error(`FAIL ${prueba.nombre}`);
    console.error(error);
  }
}

console.log(`\nResultado: ${aprobadas} superadas; ${fallidas} fallidas; ${pruebas.length} en total.`);

if (fallidas > 0) {
  process.exitCode = 1;
}
