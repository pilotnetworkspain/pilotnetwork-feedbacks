window.PN_SUPABASE_CONFIG = {
  SUPABASE_URL: "https://qmouukexrgmjrphonuhg.supabase.co",

  SUPABASE_ANON_KEY: "sb_publishable_D3ls5okKBKF3svXwp48N8g_ZXeiNJD_",

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
