// ===============================================================
// PILOT NETWORK - CONFIGURACIÓN SUPABASE
// ===============================================================
// 1. Renombra este archivo a `supabase-config.js`
// 2. Sustituye los valores por los de tu proyecto Supabase.
// 3. NUNCA pegues aquí la `service_role` key. Sólo `anon`.
// 4. Estos valores son PÚBLICOS por diseño: Supabase está pensado
//    para que el frontend use la anon key. La seguridad real la
//    hace Row Level Security (RLS) en la base de datos.
// ===============================================================

window.PN_SUPABASE_CONFIG = {
  // Por ejemplo: https://abcdefghijklmn.supabase.co
  SUPABASE_URL: "https://YOUR-PROJECT-REF.supabase.co",

  // Tu "anon public" key (Project Settings > API > Project API keys)
  SUPABASE_ANON_KEY: "YOUR-ANON-PUBLIC-KEY",

  // Bucket de Storage (déjalo así si seguiste storage-policies.sql)
  STORAGE_BUCKET: "feedback-files",

  // Límites de validación de archivos en el frontend
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024, // 10 MB
  MAX_FILES_PER_FEEDBACK: 5,
  ALLOWED_FILE_EXTENSIONS: ["pdf", "doc", "docx", "xls", "xlsx", "csv"],
  ALLOWED_MIME_TYPES: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "application/csv"
  ]
};
