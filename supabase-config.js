// Actualizado el 4-sep-2026: los feedbacks se han movido al proyecto
// Supabase unificado (ifbpbtyifiuhzyeifhea). La clave anónima es
// pública por diseño y la protección real es el RLS del servidor.
window.PN_SUPABASE_CONFIG = {
  SUPABASE_URL: "https://ifbpbtyifiuhzyeifhea.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmYnBidHlpZml1aHp5ZWlmaGVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNjIxNDMsImV4cCI6MjA5MzczODE0M30.CxWKoHsf0yPtJuoWPSaWFv-m-1GXvi2GGo_KHjxicWk",
  STORAGE_BUCKET: "feedback-files",
  MAX_FILE_SIZE_BYTES: 10485760,
  MAX_FILES_PER_FEEDBACK: 5,
  ALLOWED_FILE_EXTENSIONS: ["pdf", "doc", "docx", "xls", "xlsx", "csv", "jpg", "jpeg", "png", "webp"],
  ALLOWED_MIME_TYPES: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "image/jpeg",
    "image/png",
    "image/webp"
  ],
  IMAGE_EXTENSIONS: ["jpg", "jpeg", "png", "webp"]
};
