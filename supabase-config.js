window.PN_SUPABASE_CONFIG = {
  SUPABASE_URL: "https://qmouukexrgmjrphonuhg.supabase.co",

  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtb3V1a2V4cmdtanJwaG9udWhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTUxMzMsImV4cCI6MjA5NDE5MTEzM30.OZiLu1ltKgiMdOdlekupHeIjd4Bl0xWDZlf9ro_wD54",

  STORAGE_BUCKET: "feedback-files",

  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,
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
