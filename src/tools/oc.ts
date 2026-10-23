
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const SolicitudSchema = z.object({
  solicitud_id: z.string().min(1),
  proveedor_nombre: z.string().min(1),
  proveedor_nit: z.string().optional(),
  centro_costo: z.string().min(1),
  subarea: z.string().min(1),
  cantidad: z.number().positive(),
  valor_unitario: z.number().nonnegative(),
  valor_total: z.number().nonnegative(),
  moneda: z.enum(["COP", "USD"]),
  indicador_iva: z.string().optional(),
  condiciones_pago: z.string().optional(),
  fecha_solicitud: z.string().min(1),
});

const AprobacionSchema = z.object({
  de: z.string().email(),
  para: z.string().min(1),
  cc: z.array(z.string()).optional().default([]),
  fecha: z.string().min(1),
  asunto: z.string(),
  cuerpo: z.string(),
});

type Solicitud = z.infer<typeof SolicitudSchema>;
type Aprobacion = z.infer<typeof AprobacionSchema>;

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

export interface OpcionesValidacion {
  cotizacion?: string | null;
  factura?: string | null;
  confirmado?: boolean;
  confirmadoPor?: string;
}

export interface ResultadoValidacion {
  solicitud_id: string;
  valida: boolean;
  apta: boolean;
  errores: string[];
  bloqueos: string[];
  advertencias: string[];
  confirmaciones: string[];
  observaciones: string[];
  derivados: Record<string, string>;
  retroactiva: boolean;
  proveedor?: Proveedor;
  centroCosto?: CentroCosto;
  aprobador?: Aprobador;
  indicadorIva?: IndicadorIva;
  condicionPago?: CondicionPago;
}

function leerJson<T>(ruta: string): T {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), ruta), "utf8")
  ) as T;
}

function fechaValida(valor: string): number | null {
  const fecha = Date.parse(valor);
  return Number.isNaN(fecha) ? null : fecha;
}

function extraerImporte(texto: string, etiqueta: RegExp): number | null {
  const coincidencia = texto.match(etiqueta);
  if (!coincidencia?.[1]) return null;

  const importe = Number(
    coincidencia[1].replace(/[.\s,]/g, "")
  );

  return Number.isFinite(importe) ? importe : null;
}

function extraerFecha(texto: string, etiqueta: RegExp): string | null {
  return texto.match(etiqueta)?.[1] ?? null;
}

export function validarSolicitud(
  entrada: unknown,
  evidenciaEntrada?: unknown,
  opciones: OpcionesValidacion = {}
): ResultadoValidacion {
  const parseo = SolicitudSchema.safeParse(entrada);

  const errores: string[] = [];
  const advertencias: string[] = [];
  const confirmaciones: string[] = [];
  const observaciones: string[] = [];
  const derivados: Record<string, string> = {};
  let retroactiva = false;

  if (!parseo.success) {
    const detalles = parseo.error.issues.map(
      issue => `${issue.path.join(".")}: ${issue.message}`
    );

    return {
      solicitud_id: "desconocida",
      valida: false,
      apta: false,
      errores: detalles,
      bloqueos: detalles,
      advertencias,
      confirmaciones,
      observaciones,
      derivados,
      retroactiva,
    };
  }

  const solicitud: Solicitud = parseo.data;

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

  // RC1: identificar proveedor por NIT o nombre, sin ambigüedad.
  const nit = solicitud.proveedor_nit?.replace(/\D/g, "");
  const nombre = solicitud.proveedor_nombre.trim().toLowerCase();

  const candidatos = proveedores.filter(p =>
    nit
      ? p.nit.replace(/\D/g, "") === nit
      : p.nombre.trim().toLowerCase() === nombre
  );

  let proveedor: Proveedor | undefined;

  if (candidatos.length !== 1) {
    errores.push(
      candidatos.length === 0
        ? "RC1: el proveedor no existe en el maestro."
        : "RC1: el proveedor es ambiguo; se requiere identificarlo inequívocamente."
    );
  } else {
    proveedor = candidatos[0];

    if (!proveedor.activo) {
      errores.push("RC1: el proveedor está inactivo.");
    }

    if (proveedor.nombre.trim().toLowerCase() !== nombre) {
      errores.push("RC1: el nombre del proveedor no coincide con el maestro.");
    }

    if (nit && proveedor.nit.replace(/\D/g, "") !== nit) {
      errores.push("RC1: el NIT no coincide con el maestro.");
    }
  }

  // RC4: centro de costo y subárea.
  const centroCosto = centros.find(
    c => c.centro_costo === solicitud.centro_costo
  );

  if (!centroCosto) {
    errores.push("RC4: el centro de costo no existe.");
  } else if (!centroCosto.subareas.includes(solicitud.subarea)) {
    errores.push("RC4: la subárea no pertenece al centro de costo.");
  }

  // RC2 y RC3: evidencia, autorización y límite.
  let aprobador: Aprobador | undefined;
  let evidencia: Aprobacion | undefined;

  if (evidenciaEntrada == null) {
    errores.push("RC2: no se suministró evidencia de aprobación.");
  } else {
    const parseoEvidencia = AprobacionSchema.safeParse(evidenciaEntrada);

    if (!parseoEvidencia.success) {
      errores.push("RC2: la evidencia de aprobación tiene un formato inválido.");
    } else {
      evidencia = parseoEvidencia.data;

      if (!/\baprobado\b/i.test(evidencia.cuerpo)) {
        errores.push("RC2: la evidencia no contiene una aprobación válida.");
      }

      if (!centroCosto) {
        errores.push("RC2: no se puede verificar al aprobador sin un centro de costo válido.");
      } else {
        aprobador = centroCosto.aprobadores.find(
          a => a.email.toLowerCase() === evidencia!.de.toLowerCase()
        );

        if (!aprobador) {
          errores.push("RC2: el remitente no está autorizado para este centro de costo.");
        } else if (solicitud.valor_total > aprobador.tope) {
          errores.push(
            `RC3: el total (${solicitud.valor_total}) supera el tope del aprobador (${aprobador.tope}).`
          );
        }
      }
    }
  }

  // RC5: comparar el total cotizado con el solicitado.
  if (!opciones.cotizacion?.trim()) {
    confirmaciones.push(
      "RC5: no hay cotización disponible; se requiere confirmación humana."
    );
  } else {
    const totalCotizado = extraerImporte(
      opciones.cotizacion,
      /TOTAL\s*\(?.*?\)?[^\n]*?:?\s*(?:COP|USD)\s*([\d.,]+)/i
    );

    if (totalCotizado === null) {
      errores.push("RC5: no fue posible identificar el total de la cotización.");
    } else {
      const diferencia = solicitud.valor_total === 0
        ? (totalCotizado === 0 ? 0 : 100)
        : Math.abs(totalCotizado - solicitud.valor_total) /
          solicitud.valor_total * 100;

      if (diferencia > 2) {
        confirmaciones.push(
          `RC5: la cotización (${totalCotizado}) difiere ${diferencia.toFixed(2)} % del valor solicitado (${solicitud.valor_total}); se requiere confirmación humana.`
        );
      }
    }
  }

  // RC6: IVA predeterminado y confirmación humana.
  const ivaOmitido = !solicitud.indicador_iva?.trim();
  const codigoIva = ivaOmitido
    ? proveedor?.indicador_iva_default
    : solicitud.indicador_iva;

  const indicadorIva = indicadores.find(i => i.codigo === codigoIva);

  if (!indicadorIva) {
    errores.push("RC6: el indicador de IVA no existe o no se pudo determinar.");
  } else if (ivaOmitido) {
    derivados.indicador_iva = indicadorIva.codigo;
    confirmaciones.push(
      `RC6: se propone IVA ${indicadorIva.codigo} (${indicadorIva.descripcion}); requiere confirmación humana.`
    );
  }

  // RC7: condiciones de pago predeterminadas; solo informar.
  const pagoOmitido = !solicitud.condiciones_pago?.trim();
  const codigoPago = pagoOmitido
    ? proveedor?.condiciones_pago_default
    : solicitud.condiciones_pago;

  const condicionPago = condiciones.find(c => c.codigo === codigoPago);

  if (!condicionPago) {
    errores.push("RC7: las condiciones de pago no existen o no se pudieron determinar.");
  } else if (pagoOmitido) {
    derivados.condiciones_pago = condicionPago.codigo;
    observaciones.push(
      `RC7: se utilizarán las condiciones de pago ${condicionPago.codigo} (${condicionPago.descripcion}) por defecto del proveedor.`
    );
  }

  // RC8: factura retroactiva.
  if (opciones.factura?.trim()) {
    const fechaFactura = extraerFecha(
      opciones.factura,
      /Fecha de emisi[oó]n:\s*(\d{4}-\d{2}-\d{2})/i
    );

    if (!fechaFactura || fechaValida(fechaFactura) === null) {
      errores.push("RC8: no fue posible identificar una fecha de emisión válida en la factura.");
    } else {
      const fechaSolicitud = fechaValida(solicitud.fecha_solicitud);

      if (fechaSolicitud === null) {
        errores.push("RC8: la fecha de solicitud no es válida.");
      } else if (fechaValida(fechaFactura)! < fechaSolicitud) {
        retroactiva = true;
        confirmaciones.push(
          `RC8: la factura es retroactiva (${fechaFactura}), anterior a la solicitud (${solicitud.fecha_solicitud}); requiere confirmación humana y registro de control.`
        );
      }
    }
  }

  // RC9: aprobación anterior a la solicitud.
  if (evidencia) {
    const fechaAprobacion = fechaValida(evidencia.fecha);
    const fechaSolicitud = fechaValida(solicitud.fecha_solicitud);

    if (fechaAprobacion === null || fechaSolicitud === null) {
      errores.push("RC9: no fue posible validar las fechas de solicitud y aprobación.");
    } else if (fechaAprobacion < fechaSolicitud) {
      confirmaciones.push(
        `RC9: la aprobación (${evidencia.fecha}) es anterior a la solicitud (${solicitud.fecha_solicitud}); requiere confirmación humana.`
      );
    }
  }

  // RC10: cantidad por precio unitario, tolerancia de una unidad monetaria.
  const totalCalculado = solicitud.cantidad * solicitud.valor_unitario;

  if (Math.abs(totalCalculado - solicitud.valor_total) > 1) {
    errores.push(
      `RC10: el total informado (${solicitud.valor_total}) no coincide con el calculado (${totalCalculado}).`
    );
  }

  if (opciones.confirmado) {
    if (!opciones.confirmadoPor?.trim()) {
      errores.push(
        "Confirmación: debe indicarse quién autoriza las excepciones."
      );
    } else {
      observaciones.push(
        `Excepciones confirmadas por ${opciones.confirmadoPor.trim()}.`
      );
    }
  }

  const bloqueos = [...errores];
  const apta = bloqueos.length === 0 && (
    confirmaciones.length === 0 || opciones.confirmado === true
  );

  return {
    solicitud_id: solicitud.solicitud_id,
    valida: apta,
    apta,
    errores,
    bloqueos,
    advertencias,
    confirmaciones,
    observaciones,
    derivados,
    retroactiva,
    proveedor,
    centroCosto,
    aprobador,
    indicadorIva,
    condicionPago,
  };
}
