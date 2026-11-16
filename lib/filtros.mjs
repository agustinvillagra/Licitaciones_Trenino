/**
 * Reglas de filtrado de licitaciones para Trenino.
 *
 * Criterio general: este filtro es MÁS INCLUSIVO que el usado en el análisis de
 * mercado. Allá importaba no inflar el tamaño del canal; acá importa no perder
 * una licitación. Un falso positivo cuesta diez segundos de lectura, una
 * licitación perdida cuesta la venta.
 *
 * Las dos líneas son excluyentes: una licitación cae en "escolar" o en
 * "corporativo", nunca en ambas. Escolar manda si el texto indica que la prenda
 * es para alumnos.
 */

/** Saca tildes, colapsa espacios y pasa a mayúsculas. */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .trim();
}

/** Menciona una prenda de vestir o un encargo de confección. */
const PRENDA =
  /\bUNIFORME|VESTUARIO|VESTIMENTA|INDUMENTARIA|\bTENIDA\b|\bAJUAR\b|\bROPA\b|\bPRENDA|TEXTIL|CONFECCION DE VESTUARIO|\bBUZO\b|POLERA|POLERON|PANTALON|DELANTAL|COTONA|PECHERA|PARKA|CHAQUETA|CHALECO|\bPOLAR\b|\bFALDA\b|JUMPER|CAMISA|BLUSA|CORBATA|\bGORRO\b|\bJOCKEY\b|\bZAPATO|ZAPATILLA|CALZADO|\bPIQUE\b|SOFTSHELL|CASACA|OVEROL|\bSHORT\b|\bCALZA\b|BERMUDA/;

/** Servicios y obras que el filtro amplio arrastra y no son compra de vestuario. */
const RUIDO =
  /LAVADO|PLANCHA|LAVANDERIA|MOBILIARIO|FORMULARIO|ANALISIS TECNICO|\bOBRAS\b|ARRIENDO|REPARACION|MANTENCION|MANTENIMIENTO|CAMARIN|VESTIDOR|SE[NÑ]ALETICA|SOFTWARE|CAPACITACION|ASESORIA|\bFLETE\b|BODEGAJE|SANITIZACION|DESRATIZACION|ALIMENTACION|COLACION/;

/** Uniforme clínico y del sector salud: excluido por decisión del equipo. */
const SALUD =
  /\bSAMU\b|HOSPITAL|CESFAM|CONSULTORIO|CLINIC|QUIRURG|\bSCRUB|FILIPINA|ESTERILIZ|PACIENTE|ENFERMER|SANITARI|\bAMBO\b|SERVICIO DE SALUD|\bSSMS\b|\bSSO\b|DESECHABLE/;

/**
 * El texto indica que la prenda es para ALUMNOS.
 * Incluye los programas públicos que financian uniforme escolar: pro-retención,
 * Ley SEP, JUNAEB y Mineduc.
 */
const ALUMNOS =
  /ESCOLAR|\bALUMN|\bALUM\b|ESTUDIANTE|\bNINO\b|\bNINA\b|\bNINOS\b|\bNINAS\b|PARVUL|PREESCOLAR|PRE ESCOLAR|PREKINDER|\bKINDER\b|MATRICUL|PRO ?-? ?RETENCION|PRORET|\bLEY SEP\b|\bSEP\b|JUNAEB|MINEDUC|\bLICEO\b|\bCOLEGIO\b|\bESCUELA\b|JARDIN INFANTIL|SALA CUNA|ESTABLECIMIENTO EDUCACIONAL|\bEE\b|CENTRO EDUCATIVO|BENEFICIARIO/;

/**
 * El texto indica que la prenda es para el PERSONAL.
 * Solo desempata: si el texto nombra alumnos de forma explícita, gana escolar.
 */
const PERSONAL =
  /TRABAJADOR|FUNCIONARI|\bPERSONAL\b|EDUCADORA|DOCENTE|PROFESOR|ASISTENTE DE LA EDUCACION|MANIPULADOR|AUXILIAR|ADMINISTRATIV|\bSTAFF\b/;

/** Marca explícita de alumnos: no la revierte ninguna palabra de personal. */
const ALUMNOS_FUERTE =
  /ESCOLAR|\bALUMN|\bALUM\b|ESTUDIANTE|PARVUL|PRO ?-? ?RETENCION|PRORET|JUNAEB|MATRICUL/;

/** Academias policiales y militares: sus "alumnos" no son mercado escolar. */
const ACADEMIA =
  /CARABINEROS|GENDARMERIA|INVESTIGACIONES|\bPDI\b|EJERCITO|ARMADA|NAVAL|FUERZA AEREA|AERONAUTICA|MILITAR|\bASPIRANTE|\bCADETE|ESCUELA DE SUBOFICIALES|ESCUELA MILITAR|POLICIA/;

/** Sector del comprador, deducido del nombre del organismo. */
export function sector(organismo) {
  const n = normalizar(organismo);
  if (/CARABINEROS|GENDARMERIA|INVESTIGACIONES|\bPDI\b|EJERCITO|ARMADA|NAVAL|FUERZA AEREA|AERONAUTICA|MILITAR|DEFENSA/.test(n))
    return 'Defensa y seguridad';
  if (/MUNICIPALIDAD|MUNICIPAL|CORPORACION MUNICIPAL|\bDAEM\b/.test(n)) return 'Municipalidades';
  if (/EDUCACION|EDUCACIONAL|UNIVERSIDAD|LICEO|COLEGIO|ESCUELA|JARDIN|PARVUL|JUNJI|INTEGRA|JUNAEB|INSTITUTO PROFESIONAL/.test(n))
    return 'Educación';
  if (/HOSPITAL|SERVICIO DE SALUD|SERVICIO SALUD|CESFAM|CONSULTORIO|\bSALUD\b|CLINIC/.test(n)) return 'Salud';
  return 'Otro sector público';
}

/**
 * Clasifica una licitación.
 * Recibe el nombre (obligatorio) y, si ya se descargó el detalle, el organismo.
 * Devuelve { linea, motivo } donde linea es 'escolar' | 'corporativo' | null.
 */
export function clasificar(nombre, organismo = '') {
  const n = normalizar(nombre);
  const todo = `${n} ${normalizar(organismo)}`;

  if (!PRENDA.test(n)) return { linea: null, motivo: 'No menciona ninguna prenda' };
  if (RUIDO.test(n)) return { linea: null, motivo: 'Es un servicio u obra, no compra de vestuario' };
  if (ACADEMIA.test(todo))
    return { linea: null, motivo: 'Academia policial o militar: no es mercado escolar ni corporativo' };

  const marcaAlumnos = ALUMNOS.test(n);
  const marcaPersonal = PERSONAL.test(n);

  if (marcaAlumnos && (!marcaPersonal || ALUMNOS_FUERTE.test(n)))
    return { linea: 'escolar', motivo: 'El texto indica que la prenda es para alumnos' };

  if (SALUD.test(todo))
    return { linea: null, motivo: 'Uniforme clínico o del sector salud: excluido por decisión del equipo' };

  if (marcaAlumnos && marcaPersonal)
    return { linea: 'corporativo', motivo: 'Establecimiento educacional comprando para su personal' };

  return { linea: 'corporativo', motivo: 'Vestuario corporativo o institucional' };
}

/** Tipos de licitación por tamaño de ticket (UTM). */
export const TIPOS = {
  L1: 'Menos de 100 UTM',
  LE: '100 a 1.000 UTM',
  LP: '1.000 a 2.000 UTM',
  LQ: '2.000 a 5.000 UTM',
  LR: 'Más de 5.000 UTM',
  LS: 'Servicios personales',
  E2: 'Privada 100 a 1.000 UTM',
  CO: 'Compra coordinada',
  B2: 'Privada menos de 100 UTM',
  H2: 'Privada 1.000 a 2.000 UTM',
  I2: 'Privada más de 2.000 UTM',
};

/** Días hasta el cierre, en días completos. Negativo si ya cerró. */
export function diasParaCierre(fechaCierre, ahora = new Date()) {
  if (!fechaCierre) return null;
  const cierre = new Date(fechaCierre);
  if (Number.isNaN(cierre.getTime())) return null;
  return Math.ceil((cierre - ahora) / 86_400_000);
}
