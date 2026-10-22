
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

// ============================================================
// 1. ESQUEMAS DE VALIDACIÓN
// ============================================================

const SolicitudSchema = z.object({
  solicitud_id: z.string().min(1),
  proveedor_nombre: z.string().min(1),
  proveedor_nit: z.string().min(1),
  centro_costo: z.string().min(1),
  subarea: z.string().min(1),
  cantidad: z.number().positive(),
  valor_unitario: z.number().nonnegative(),
  valor_total: z.number().nonnegative(),
  moneda: z.string().min(1),
  indicador_iva: z.string().optional(),
  condiciones_pago: z.string().optional(),
  fecha_solicitud: z.string().min(1),
});

const AprobacionSchema = z.object({
  de: z.string().email(),
  // Se valida como texto porque algunos fixtures contienen
  // caracteres Unicode en la dirección del destinatario.
  para: z.string().min(1),
  cc: z.array(z.string()),
  fecha: z.string().min(1),
  asunto: z.string(),
  cuerpo: z.string(),
});

type Solicitud = z.infer<typeof SolicitudSchema>;
type Aprobacion = z.infer<typeof AprobacionSchema>;

// ============================================================
// 2. TIPOS DE LOS MAESTROS
// ============================================================

interface Proveedor {
  codigo_sap: string;
  nit: string;
  nombre: string;
  condiciones_pago_default: string;
  indicador_iva_default: string;
  activo: boolean;
}

interface Aprobador {
  email: string;
  nombre: string;
  tope: number;
}

interface CentroCosto {
  centro_costo: string;
  nombre: string;
  subareas: string[];
  aprobadores: Aprobador[];
}

interface IndicadorIva {
  codigo: string;
  descripcion: string;
  tasa: number;
}

interface CondicionPago {
  codigo: string;
  descripcion: string;
  dias: number;
}

// ============================================================
// 3. LECTURA DE ARCHIVOS JSON
// ============================================================

function leerJson<T>(ruta: string): T {
  const contenido = readFileSync(
    resolve(process.cwd(), ruta),
    "utf8"
  );

  return JSON.parse(contenido) as T;
}

// ============================================================
// 4. CONTRATO DEL RESULTADO
// ============================================================

export interface ResultadoValidacion {
  solicitud_id: string;
  valida: boolean;
  errores: string[];
  advertencias: string[];
  observaciones: string[];
  proveedor?: Proveedor;
  centroCosto?: CentroCosto;
  aprobador?: Aprobador;
  indicadorIva?: IndicadorIva;
  condicionPago?: CondicionPago;
}

// ============================================================
// 5. VALIDACIÓN DE LA SOLICITUD
// ============================================================

export function validarSolicitud(
  entrada: unknown,
  evidenciaEntrada?: unknown
): ResultadoValidacion {
  const resultado = SolicitudSchema.safeParse(entrada);

  if (!resultado.success) {
    return {
      solicitud_id: "desconocida",
      valida: false,
      errores: resultado.error.issues.map(
        (issue) =>
          `${issue.path.join(".")}: ${issue.message}`
      ),
      advertencias: [],
      observaciones: [],
    };
  }

  const solicitud: Solicitud = resultado.data;
  const errores: string[] = [];
  const advertencias: string[] = [];
  const observaciones: string[] = [];

  // Cargar maestros.
  const proveedores = leerJson<Proveedor[]>(
    "fixtures/maestros/proveedores.json"
  );

  const centros = leerJson<CentroCosto[]>(
    "fixtures/maestros/centros-costo.json"
  );

  const indicadores = leerJson<IndicadorIva[]>(
    "fixtures/maestros/indicadores-iva.json"
  );

  const condiciones = leerJson<CondicionPago[]>(
    "fixtures/maestros/condiciones-pago.json"
  );

  // ----------------------------------------------------------
  // RC1: el proveedor debe existir y estar activo.
  // ----------------------------------------------------------

  const proveedor = proveedores.find(
    (item) => item.nit === solicitud.proveedor_nit
  );

  if (!proveedor) {
    errores.push(
      "RC1: el proveedor no existe en el maestro."
    );
  } else {
    if (!proveedor.activo) {
      errores.push(
        "RC1: el proveedor está inactivo."
      );
    }

    if (
      proveedor.nombre.trim().toLowerCase() !==
      solicitud.proveedor_nombre.trim().toLowerCase()
    ) {
      errores.push(
        "El nombre del proveedor no coincide con el maestro."
      );
    }
  }

  // ----------------------------------------------------------
  // RC4: validar centro de costo y subárea.
  // ----------------------------------------------------------

  const centroCosto = centros.find(
    (item) =>
      item.centro_costo === solicitud.centro_costo
  );

  if (!centroCosto) {
    errores.push(
      "RC4: el centro de costo no existe."
    );
  } else if (
    !centroCosto.subareas.includes(solicitud.subarea)
  ) {
    errores.push(
      "RC4: la subárea no pertenece al centro de costo."
    );
  }

  // ----------------------------------------------------------
  // RC2 y RC3: aprobación y tope del aprobador.
  // ----------------------------------------------------------

  let aprobador: Aprobador | undefined;

  if (evidenciaEntrada === undefined ||
      evidenciaEntrada === null) {
    errores.push(
      "RC2: no se suministró evidencia de aprobación."
    );
  } else {
    const evidenciaResultado =
      AprobacionSchema.safeParse(evidenciaEntrada);

    if (!evidenciaResultado.success) {
      errores.push(
        "RC2: la evidencia de aprobación tiene un formato inválido."
      );
    } else {
      const evidencia: Aprobacion =
        evidenciaResultado.data;

      // Comprobar que el cuerpo contenga la palabra requerida.
      if (!/\baprobado\b/i.test(evidencia.cuerpo)) {
        errores.push(
          "RC2: la evidencia no contiene una aprobación válida."
        );
      }

      // El remitente debe estar autorizado para este centro.
      if (!centroCosto) {
        errores.push(
          "RC2: no se puede verificar al aprobador porque el centro de costo no es válido."
        );
      } else {
        aprobador = centroCosto.aprobadores.find(
          (item) =>
            item.email.toLowerCase() ===
            evidencia.de.toLowerCase()
        );

        if (!aprobador) {
          errores.push(
            "RC2: el remitente no está autorizado para aprobar en este centro de costo."
          );
        } else {
          // RC3: el importe no puede superar el tope.
          if (solicitud.valor_total > aprobador.tope) {
            errores.push(
              `RC3: el total (${solicitud.valor_total}) ` +
              `supera el tope del aprobador (${aprobador.tope}).`
            );
          }
        }
      }
    }
  }

  // ----------------------------------------------------------
  // RC6: indicador de IVA y valor por defecto.
  // ----------------------------------------------------------

  const ivaOmitido =
    solicitud.indicador_iva === undefined ||
    solicitud.indicador_iva.trim() === "";

  const codigoIva = ivaOmitido
    ? proveedor?.indicador_iva_default
    : solicitud.indicador_iva;

  const indicadorIva = codigoIva
    ? indicadores.find(
        (item) => item.codigo === codigoIva
      )
    : undefined;

  if (!indicadorIva) {
    errores.push(
      "RC6: el indicador de IVA no existe o no se pudo determinar."
    );
  } else if (ivaOmitido) {
    advertencias.push(
      `RC6: se propone el indicador de IVA ${indicadorIva.codigo} ` +
      `(${indicadorIva.descripcion}) por defecto del proveedor. ` +
      "Se requiere confirmación humana."
    );
  }

  // ----------------------------------------------------------
  // RC7: condiciones de pago y valor por defecto.
  // ----------------------------------------------------------

  const pagoOmitido =
    solicitud.condiciones_pago === undefined ||
    solicitud.condiciones_pago.trim() === "";

  const codigoPago = pagoOmitido
    ? proveedor?.condiciones_pago_default
    : solicitud.condiciones_pago;

  const condicionPago = codigoPago
    ? condiciones.find(
        (item) => item.codigo === codigoPago
      )
    : undefined;

  if (!condicionPago) {
    errores.push(
      "RC7: las condiciones de pago no existen o no se pudieron determinar."
    );
  } else if (pagoOmitido) {
    observaciones.push(
      `RC7: se utilizarán las condiciones de pago ${condicionPago.codigo} ` +
      `(${condicionPago.descripcion}), según el valor por defecto del proveedor.`
    );
  }

  // ----------------------------------------------------------
  // RC10: cantidad × precio unitario = total, tolerancia de $1.
  // ----------------------------------------------------------

  const totalCalculado =
    solicitud.cantidad * solicitud.valor_unitario;

  if (
    Math.abs(totalCalculado - solicitud.valor_total) > 1
  ) {
    errores.push(
      `RC10: el total informado (${solicitud.valor_total}) ` +
      `no coincide con el calculado (${totalCalculado}).`
    );
  }

  // Una solicitud con errores no puede considerarse válida.
  // Las advertencias requieren atención, pero no son errores
  // bloqueantes por sí mismas.
  return {
    solicitud_id: solicitud.solicitud_id,
    valida: errores.length === 0,
    errores,
    advertencias,
    observaciones,
    proveedor,
    centroCosto,
    aprobador,
    indicadorIva,
    condicionPago,
  };
}
