/* ===================================================================
   PILOT NETWORK · Assessment Feedbacks
   App principal (vista pública)
   - Lista de compañías con búsqueda y filtros
   - Detalle de compañía con feedbacks aprobados
   - Modal para publicar nuevo feedback
   - Subida de archivos a Supabase Storage
   - Auto-height a la web padre por postMessage
   =================================================================== */
(function () {
  "use strict";

  // ------- Config y cliente Supabase -------
  if (!window.PN_SUPABASE_CONFIG) {
    document.body.innerHTML = '<div style="padding:40px;color:#fff;font-family:system-ui">Falta el archivo <code>supabase-config.js</code>. Renombra <code>supabase-config.example.js</code> a <code>supabase-config.js</code> y rellénalo.</div>';
    return;
  }
  var CFG = window.PN_SUPABASE_CONFIG;
  // Usamos fetch directo en lugar del SDK de Supabase
  // var supabase = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
  //   auth: { persistSession: false, autoRefreshToken: false }
  // });

  // ===================================================================
  // MURO: QUE SE VE SIN CUENTA
  // -------------------------------------------------------------------
  // Los tres interruptores de abajo son lo unico que hay que tocar el
  // dia que el registro este abierto. Estan juntos a proposito: si
  // estuvieran repartidos por el fichero, abrir el grifo seria buscar
  // por medio codigo y algo se quedaria cerrado.
  //
  // LO QUE ESTO ES Y LO QUE NO ES. Esto tapa lo que se VE: los botones
  // no descargan y del sexto feedback en adelante sale un aviso en vez
  // del texto. No es una cerradura. Quien abra las herramientas del
  // navegador encuentra la clave publica en supabase-config.js y puede
  // pedirle los feedbacks a la base de datos por su cuenta. Cerrar eso
  // de verdad es cambiar los permisos en Supabase (RLS), y eso apaga
  // tambien esta pagina publica mientras no haya cuentas. Esta escrito
  // en docs/SEGURIDAD.md del repo pilotnetwork-web, hallazgo S-10.
  //
  // Asi que: esto frena la copia comoda, la del que pulsa un boton. No
  // frena a quien sabe lo que hace. Y esa es exactamente la diferencia
  // que hay que tener clara antes de decir que los feedbacks "estan
  // protegidos".
  // ===================================================================

  /** Con false, los tres botones de descarga avisan en vez de descargar. */
  var DESCARGAS_ABIERTAS = false;

  /** Cuantos feedbacks se leen enteros sin cuenta. Del 6 en adelante, aviso. */
  var TOPE_SIN_CUENTA = 5;

  /**
   * A donde lleva "Crear cuenta gratis".
   * Vacio = todavia no hay registro: el muro sale igual, pero en vez de
   * un boton que no lleva a ningun sitio muestra "abre en breve".
   * Cuando la web nueva este publica, aqui va su direccion. Ejemplo:
   *   var URL_CUENTA = "https://www.pilotnetwork.es/cuenta/entrar";
   */
  var URL_CUENTA = "";

  // ------- Estado global -------
  var state = {
    companies: [],          // lista completa
    filteredCompanies: [],  // tras búsqueda/filtros
    currentCompany: null,   // detalle abierto
    feedbacks: [],          // aprobados de la compañía actual
    feedbacksFiltered: [],
    filter: "all",
    search: "",
    positionFilter: "all",
    dateFrom: "",
    dateTo: ""
  };

  // ------- Helpers DOM -------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  // ------- Sanitización (texto plano -> HTML seguro) -------
  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Logo: usa logo_url de la DB (ya configurado con la URL correcta)
  // Fallback → placeholder SVG con iniciales
  function logoSrc(company) {
    if (company.logo_url && company.logo_url.trim()) return company.logo_url;
    return placeholderLogo(company.name);
  }
  function placeholderLogo(name) {
    var initials = (name || "?").split(/\s+/).slice(0,2).map(function(w){return w[0]||"";}).join("").toUpperCase();
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'+
      '<rect width="64" height="64" rx="14" fill="#0f1830"/>'+
      '<text x="50%" y="55%" font-family="Inter,system-ui,sans-serif" font-size="22" font-weight="900" fill="#6ea8ff" text-anchor="middle" dominant-baseline="middle">'+escapeHtml(initials)+'</text>'+
      '</svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  // ------- Etiquetas legibles -------
  var CATEGORY_LABEL = {
    commercial: "Comercial",
    executive:  "Ejecutiva",
    cargo:      "Cargo",
    low_cost:   "Low cost",
    regional:   "Regional",
    acmi:       "ACMI / Wet Lease",
    generic:    "Genérica"
  };
  var CATEGORY_LABEL_EN = {
    commercial: "Commercial",
    executive:  "Executive",
    cargo:      "Cargo",
    low_cost:   "Low cost",
    regional:   "Regional",
    acmi:       "ACMI / Wet Lease",
    generic:    "Generic"
  };
  var POSITION_LABEL = {
    cadet:         "Cadete",
    first_officer: "First Officer",
    captain:       "Comandante"
  };
  var POSITION_LABEL_EN = {
    cadet:         "Cadet",
    first_officer: "First Officer",
    captain:       "Captain"
  };

  // Obtiene etiqueta de categoría según idioma actual
  function getCatLabel(cat) {
    var lang = window.pnCurrentLang || 'es';
    var labels = lang === 'en' ? CATEGORY_LABEL_EN : CATEGORY_LABEL;
    return labels[cat] || cat;
  }
  // Obtiene etiqueta de posición según idioma actual
  function getPosLabel(pos) {
    var lang = window.pnCurrentLang || 'es';
    var labels = lang === 'en' ? POSITION_LABEL_EN : POSITION_LABEL;
    return labels[pos] || pos;
  }
  // Textos de UI dinámicos bilingüe
  var UI_TEXTS = {
    'view-feedbacks':    { es: 'Ver feedbacks', en: 'View feedbacks' },
    'add-feedback':      { es: '+ Añadir',       en: '+ Add' },
    'feedbacks-count-plural':  { es: 'feedbacks publicados', en: 'feedbacks published' },
    'feedbacks-count-single':  { es: 'feedback publicado',  en: 'feedback published' },
    'no-filter-match':   { es: 'No hay feedbacks que coincidan con los filtros.', en: 'No feedbacks match the filters.' },
    'date-not-set':      { es: 'Fecha no indicada',  en: 'Date not specified' },
    'aircraft-section':  { es: 'Aviones volados',    en: 'Aircraft flown' },
    'attachments':       { es: 'Archivos adjuntos',  en: 'Attachments' },
    'experience':        { es: 'Experiencia',        en: 'Experience' },
    'feedback-section':  { es: 'Feedback',           en: 'Feedback' },
    'anonymous':         { es: 'Anónimo',            en: 'Anonymous' },
    'published-on':      { es: 'Publicado',          en: 'Published' },
    'total-hours':       { es: 'h totales',          en: 'h total' },
    // --- Muro tras el quinto feedback ---
    'tope-title-1':      { es: 'Queda 1 feedback más de esta compañía',  en: '1 more feedback for this airline' },
    'tope-title-n':      { es: 'Quedan {n} feedbacks más de esta compañía', en: '{n} more feedbacks for this airline' },
    'tope-text':         { es: 'Los escriben pilotos que ya han pasado el proceso. Se leen con una cuenta gratuita, y así no acaban descargados en bloque y repartidos fuera de contexto.',
                           en: 'They are written by pilots who already went through the process. A free account opens them, and that is what stops them being bulk-downloaded and passed around out of context.' },
    'tope-cta':          { es: 'Ver los que faltan',      en: 'See the rest' },
    // --- Pedir los feedbacks con un formulario (9-oct-2026, Cesar) ---
    // Antes (1-oct) era un aviso con un mailto. Ahora es un formulario que
    // llega al panel de Cesar para aprobarlo. Ver solicitarFeedbacks() abajo.
    'pedir-title':       { es: 'Pide los feedbacks de {c}', en: 'Request the {c} feedbacks' },
    'pedir-text':        { es: 'Déjanos tus datos y te los enviamos por correo en un PDF marcado con tu nombre, tu teléfono y tu correo. Revisamos cada solicitud a mano; cuando la aprobemos, te llegará un correo para confirmar con un clic.',
                           en: 'Leave us your details and we will email them to you as a PDF marked with your name, phone and email. We review every request by hand; once we approve it, you will receive an email to confirm with one click.' },
    'pedir-nombre':      { es: 'Nombre y apellidos', en: 'Full name' },
    'pedir-telefono':    { es: 'Teléfono', en: 'Phone' },
    'pedir-correo':      { es: 'Correo electrónico', en: 'Email' },
    'pedir-cual':        { es: 'Qué quieres', en: 'What you want' },
    'pedir-todos':       { es: 'Todos los feedbacks ({n})', en: 'All the feedbacks ({n})' },
    'pedir-uno':         { es: 'Solo este: {f}', en: 'Only this one: {f}' },
    'pedir-idioma':      { es: 'Idioma del documento', en: 'Language of the document' },
    'pedir-condiciones': { es: 'Las condiciones de uso personal', en: 'The personal-use terms' },
    'pedir-acepto':      { es: 'He leído y acepto las condiciones de uso personal del documento.', en: 'I have read and accept the personal-use terms of the document.' },
    'pedir-cta':         { es: 'Enviar solicitud', en: 'Send request' },
    'pedir-enviando':    { es: 'Enviando…', en: 'Sending…' },
    'pedir-este':        { es: 'Pedir este feedback', en: 'Request this feedback' },
    'pedir-ok-title':    { es: '¡Solicitud recibida!', en: 'Request received!' },
    'pedir-ok':          { es: 'La revisamos y, cuando la aprobemos, te llegará un correo a {e} para confirmar y recibir el PDF. Mira también en spam o promociones.',
                           en: 'We will review it and, once approved, you will receive an email at {e} to confirm and receive the PDF. Check your spam or promotions folder too.' },
    'pedir-otra':        { es: 'Pedir otra', en: 'Request another' },
    'pedir-err-correo':  { es: 'Escribe un correo válido.', en: 'Enter a valid email.' },
    'pedir-err-nombre':  { es: 'Escribe tu nombre y apellidos.', en: 'Enter your full name.' },
    'pedir-err-telefono':{ es: 'Escribe un teléfono (con al menos 6 cifras).', en: 'Enter a phone number (at least 6 digits).' },
    'pedir-err-acepto':  { es: 'Para pedir el documento tienes que aceptar las condiciones.', en: 'To request the document you need to accept the terms.' },
    'pedir-err-limite':  { es: 'Has hecho varias solicitudes hoy. Inténtalo mañana o escríbenos a pilotnetworkspain@gmail.com.', en: 'You have sent several requests today. Try again tomorrow or write to pilotnetworkspain@gmail.com.' },
    'pedir-err-red':     { es: 'No hemos podido enviar la solicitud. Prueba otra vez en un momento.', en: 'We could not send the request. Please try again in a moment.' },
    'pedir-privacidad':  { es: 'Política de privacidad', en: 'Privacy policy' },
  };
  /**
   * Llevar la vista a un sitio, este la pagina donde este.
   *
   * EL PROBLEMA QUE ARREGLA. Esta pagina normalmente vive dentro de un
   * iframe en www.pilotnetwork.es, y el iframe crece hasta caber entero:
   * dentro no hay nada que desplazar, el que se desplaza es el padre. Por
   * eso todo el codigo pedia el desplazamiento por postMessage y la
   * pagina de Webador lo obedecia. Eso sigue igual.
   *
   * Pero abierta sola —una vista previa, o alguien que abre la direccion
   * directa— NO hay padre que escuche: el mensaje se perdia y al entrar
   * en una compania te quedabas arriba, mirando la lista, sin ver que
   * abajo ya estaban los feedbacks. Parecia que el clic no hacia nada.
   *
   * Se hacen las dos cosas: el mensaje al padre, que es quien manda
   * cuando hay iframe, y si no hay padre, el desplazamiento aqui mismo.
   * Dentro del iframe lo segundo no estorba porque no hay barra que mover.
   */
  function hayPadre() {
    try { return window.parent && window.parent !== window; } catch (e) { return true; }
  }
  function llevarLaVista(offset) {
    var y = Math.max(0, offset);
    try { window.parent.postMessage({ type: "pn-feedback-scroll-to", offset: y }, "*"); } catch (e) {}
    if (hayPadre()) return;
    try { window.scrollTo({ top: y, behavior: "smooth" }); } catch (e) { window.scrollTo(0, y); }
  }
  function llevarLaVistaArriba() {
    try { window.parent.postMessage({ type: "pn-feedback-scroll-top" }, "*"); } catch (e) {}
    if (hayPadre()) return;
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) { window.scrollTo(0, 0); }
  }

  function t(key) {
    var lang = window.pnCurrentLang || 'es';
    var entry = UI_TEXTS[key];
    if (!entry) return key;
    return entry[lang] || entry['es'];
  }

  // Flag para pausar sendHeight cuando el modal está abierto
  var modalIsOpen = false;
  window.pnCurrentLang = window.pnCurrentLang || 'en';

  function formatDate(dateStr) {
    if (!dateStr) return "";
    try {
      var d = new Date(dateStr + "T00:00:00");
      return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
    } catch(e) { return dateStr; }
  }
  function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + " KB";
    return (bytes/(1024*1024)).toFixed(2) + " MB";
  }

  // ===================================================================
  // CARGAR COMPAÑÍAS
  // ===================================================================
  function showLoading(el, on) {
    var node = $(el);
    if (node) node.hidden = !on;
  }

  async function loadCompanies() {
    showLoading("#pn-state-loading", true);
    $("#pn-state-error").hidden = true;
    $("#pn-state-empty").hidden = true;
    $("#pn-companies-grid").innerHTML = "";

    try {
      var cfg = window.PN_SUPABASE_CONFIG;
      var url = cfg.SUPABASE_URL + "/rest/v1/companies_public?select=*&order=feedback_count.desc,sort_order.asc,name.asc";
      var resp = await fetch(url, {
        headers: {
          'apikey': cfg.SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + cfg.SUPABASE_ANON_KEY
        }
      });
      var data = await resp.json();

      showLoading("#pn-state-loading", false);

      if (!resp.ok) {
        var err = $("#pn-state-error");
        err.hidden = false;
        var errMsg = (data && data.message) ? data.message : data;
        $("#pn-state-error-message").textContent =
          "No se pudo cargar la lista de compañías. " + errMsg;
        return;
      }
      state.companies = Array.isArray(data) ? data : [];
      applyCompanyFilters();
      fillCompanySelect();
    } catch (e) {
      showLoading("#pn-state-loading", false);
      var err = $("#pn-state-error");
      err.hidden = false;
      $("#pn-state-error-message").textContent = "Error de red: " + e.message;
    }
  }

  function applyCompanyFilters() {
    var q = state.search.trim().toLowerCase();
    state.filteredCompanies = state.companies.filter(function (c) {
      if (state.filter !== "all" && c.category !== state.filter) return false;
      if (q) {
        var hay = (c.name + " " + (c.company_type || "") + " " + (c.slug || "")).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    renderCompanies();
  }

  function renderCompanies() {
    var grid = $("#pn-companies-grid");
    if (!state.filteredCompanies.length) {
      $("#pn-state-empty").hidden = false;
      grid.innerHTML = "";
      sendHeight();
      return;
    }
    $("#pn-state-empty").hidden = true;

    var html = state.filteredCompanies.map(function (c, i) {
      var src = logoSrc(c);
      var fbCount = c.feedback_count || 0;
      var fbLabel = fbCount === 1 ? t('feedbacks-count-single') : t('feedbacks-count-plural');
      return ''+
        '<article class="pn-feedback-card" tabindex="0" data-slug="'+escapeHtml(c.slug)+'" style="animation-delay:'+(i*0.04).toFixed(2)+'s">'+
          '<span class="pn-feedback-badge" data-cat="'+escapeHtml(c.category)+'">'+escapeHtml(getCatLabel(c.category))+'</span>'+
          '<div class="pn-feedback-card-brand">'+
            '<img loading="lazy" src="'+escapeHtml(src)+'" alt="'+escapeHtml(c.name)+'" '+
            'onerror="this.onerror=null;this.src=\''+placeholderLogo(c.name).replace(/'/g,"\\'")+'\'" />'+
            '<div class="pn-feedback-card-brand-text">'+
              '<h3>'+escapeHtml(c.name)+'</h3>'+
            '</div>'+
          '</div>'+
          '<div class="pn-feedback-card-stat">'+
            '<strong>'+fbCount+'</strong><span>'+escapeHtml(fbLabel)+'</span>'+
          '</div>'+
          '<div class="pn-feedback-card-actions">'+
            '<button class="pn-feedback-btn pn-feedback-btn-primary" data-action="view" data-slug="'+escapeHtml(c.slug)+'">'+escapeHtml(t('view-feedbacks'))+'</button>'+
            '<button class="pn-feedback-btn pn-feedback-btn-ghost" data-action="add" data-slug="'+escapeHtml(c.slug)+'">'+escapeHtml(t('add-feedback'))+'</button>'+
          '</div>'+
        '</article>';
    }).join("");

    grid.innerHTML = html;
    sendHeight();
  }

  // Click en el grid (delegación)
  function onGridClick(e) {
    var btn = e.target.closest("[data-action]");
    var card = e.target.closest(".pn-feedback-card");
    if (btn) {
      var slug = btn.getAttribute("data-slug");
      if (btn.getAttribute("data-action") === "view") {
        openCompany(slug);
      } else if (btn.getAttribute("data-action") === "add") {
        openFeedbackModal(slug);
      }
      return;
    }
    if (card) openCompany(card.getAttribute("data-slug"));
  }
  function onGridKey(e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var card = e.target.closest(".pn-feedback-card");
    if (card) { e.preventDefault(); openCompany(card.getAttribute("data-slug")); }
  }

  // ===================================================================
  // DETALLE DE COMPAÑÍA + FEEDBACKS
  // ===================================================================
  function scrollToTop() {
    // Intento 1: scroll dentro del iframe
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    // Intento 2: avisa al padre para que haga scroll al top del iframe
    function notifyParent() { llevarLaVistaArriba(); }
    notifyParent();
    setTimeout(notifyParent, 100);
    setTimeout(notifyParent, 400);
  }

  function showListView() {
    state.currentCompany = null;
    $("#pn-view-list-hero").hidden = false;
    $("#pn-view-list-toolbar").hidden = false;
    $("#pn-companies-grid").hidden = false;
    $("#pn-company-detail").hidden = true;
    $("#pn-island-anchor") && ($(".pn-island-anchor").style.display = "flex");
    location.hash = "";
    scrollToTop();
    sendHeight();
  }
  function showDetailView() {
    $("#pn-view-list-hero").hidden = true;
    $("#pn-view-list-toolbar").hidden = true;
    $("#pn-companies-grid").hidden = true;
    $("#pn-state-empty").hidden = true;
    $("#pn-company-detail").hidden = false;
    var island = $(".pn-island-anchor");
    if (island) island.style.display = "none";
    sendHeight();
  }

  async function openCompany(slug) {
    var company = state.companies.find(function (c) { return c.slug === slug; });
    if (!company) return;
    state.currentCompany = company;
    state.positionFilter = "all";
    state.dateFrom = "";
    state.dateTo = "";

    // Header
    $("#pn-detail-logo").src = logoSrc(company);
    $("#pn-detail-logo").alt = company.name;
    $("#pn-detail-logo").onerror = function () { this.onerror = null; this.src = placeholderLogo(company.name); };
    $("#pn-detail-name").textContent = company.name;
    $("#pn-detail-subtitle").textContent = company.feedback_count != null ? company.feedback_count + " feedback" + (company.feedback_count===1?"":"s") : "";

    // Reset mini-filtros UI
    $$("#pn-company-detail [data-pos]").forEach(function (b) { b.classList.toggle("is-active", b.getAttribute("data-pos") === "all"); });
    $("#pn-date-from").value = "";
    $("#pn-date-to").value   = "";

    showDetailView();
    location.hash = "#/company/" + slug;
    await loadFeedbacks(company.id);
  }

  async function loadFeedbacks(companyId) {
    $("#pn-detail-loading").hidden = false;
    $("#pn-detail-empty").hidden = true;
    $("#pn-detail-feedbacks-list").innerHTML = "";

    try {
      var cfg = window.PN_SUPABASE_CONFIG;
      var url = cfg.SUPABASE_URL + "/rest/v1/feedbacks_public?company_id=eq." + companyId + "&order=created_at.desc";
      var resp = await fetch(url, {
        headers: {
          'apikey': cfg.SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + cfg.SUPABASE_ANON_KEY
        }
      });
      var feedbacks = await resp.json();

      $("#pn-detail-loading").hidden = true;

      if (!resp.ok) {
        $("#pn-detail-feedbacks-list").innerHTML =
          '<div class="pn-feedback-state pn-feedback-state-error"><p>Error al cargar feedbacks: ' + escapeHtml(feedbacks.message || 'Unknown error') + '</p></div>';
        sendHeight();
        return;
      }

      feedbacks = Array.isArray(feedbacks) ? feedbacks : [];
      state.feedbacks = feedbacks;

      if (!feedbacks.length) {
        state.feedbacksFiltered = [];
        $("#pn-detail-empty").hidden = false;
        sendHeight();
        return;
      }

      applyFeedbackFilters();
    } catch (e) {
      $("#pn-detail-loading").hidden = true;
      $("#pn-detail-feedbacks-list").innerHTML =
        '<div class="pn-feedback-state pn-feedback-state-error"><p>Error de red: ' + escapeHtml(e.message) + '</p></div>';
      sendHeight();
    }
  }

  function applyFeedbackFilters() {
    var list = state.feedbacks.slice();

    if (state.positionFilter !== "all") {
      list = list.filter(function (f) { return f.position === state.positionFilter; });
    }
    if (state.dateFrom) {
      list = list.filter(function (f) {
        var d = f.assessment_date || f.assessment_start_date;
        return d && d >= state.dateFrom;
      });
    }
    if (state.dateTo) {
      list = list.filter(function (f) {
        var d = f.assessment_date || f.assessment_end_date || f.assessment_start_date;
        return d && d <= state.dateTo;
      });
    }
    state.feedbacksFiltered = list;
    renderFeedbacks();
  }

  function renderFeedbacks() {
    var cont = $("#pn-detail-feedbacks-list");
    if (!state.feedbacksFiltered.length) {
      cont.innerHTML = '<div class="pn-feedback-state"><p>'+escapeHtml(t('no-filter-match'))+'</p></div>';
      sendHeight();
      return;
    }
    // El muro: solo se pintan los TOPE_SIN_CUENTA primeros. La lista ya
    // viene ordenada por fecha descendente desde la consulta
    // (order=created_at.desc), asi que estos son los mas recientes, que
    // es lo que pidio Cesar. Los demas no se pintan; en su sitio va un
    // aviso. Ojo: NO se borran de state.feedbacksFiltered, porque los
    // filtros de posicion y fecha siguen trabajando sobre la lista
    // entera y el contador tiene que poder decir cuantos faltan.
    var visibles = state.feedbacksFiltered;
    var ocultos = 0;
    if (!DESCARGAS_ABIERTAS && visibles.length > TOPE_SIN_CUENTA) {
      ocultos = visibles.length - TOPE_SIN_CUENTA;
      visibles = visibles.slice(0, TOPE_SIN_CUENTA);
    }
    cont.innerHTML = visibles.map(function (f) {
      var dateLabel = f.assessment_date
        ? formatDate(f.assessment_date)
        : (f.assessment_start_date && f.assessment_end_date
            ? (formatDate(f.assessment_start_date) + " — " + formatDate(f.assessment_end_date))
            : (f.assessment_start_date ? formatDate(f.assessment_start_date) : t('date-not-set')));

      var aircraftHtml = (f.aircraft_hours && f.aircraft_hours.length)
        ? '<div class="pn-feedback-item-block">'+
            '<h4>'+escapeHtml(t('aircraft-section'))+'</h4>'+
            '<div class="pn-feedback-aircraft-list">'+
              f.aircraft_hours.map(function (a) {
                return '<div class="pn-feedback-aircraft-chip">'+escapeHtml(a.aircraft_type)+
                  (a.hours != null ? ' <span>· '+a.hours+'h</span>' : '')+
                  '</div>';
              }).join("")+
            '</div>'+
          '</div>'
        : "";

      var filesHtml = (f.files && f.files.length)
        ? (function() {
            var cfg = window.PN_SUPABASE_CONFIG;
            var imageExts = cfg.IMAGE_EXTENSIONS || ["jpg","jpeg","png","webp"];
            var baseUrl = cfg.SUPABASE_URL + '/storage/v1/object/public/';
            var images = f.files.filter(function(file) {
              var ext = (file.file_name || "").split(".").pop().toLowerCase();
              return imageExts.indexOf(ext) !== -1;
            });
            var docs = f.files.filter(function(file) {
              var ext = (file.file_name || "").split(".").pop().toLowerCase();
              return imageExts.indexOf(ext) === -1;
            });
            var html = '<div class="pn-feedback-item-block"><h4>'+escapeHtml(t('attachments'))+'</h4>';
            // Imágenes en grid
            if (images.length) {
              html += '<div class="pn-feedback-images-grid">';
              images.forEach(function(file) {
                var url = baseUrl + (file.storage_bucket || "feedback-files") + '/' + encodeURIComponent(file.file_path);
                html += '<a href="'+escapeHtml(url)+'" target="_blank" rel="noopener noreferrer" class="pn-feedback-image-thumb">'+
                  '<img src="'+escapeHtml(url)+'" alt="'+escapeHtml(file.file_name)+'" loading="lazy" />'+
                '</a>';
              });
              html += '</div>';
            }
            // Documentos como lista
            if (docs.length) {
              html += '<ul class="pn-feedback-files-list">';
              docs.forEach(function(file) {
                var url = baseUrl + (file.storage_bucket || "feedback-files") + '/' + encodeURIComponent(file.file_path);
                html += '<li><a href="'+escapeHtml(url)+'" target="_blank" rel="noopener noreferrer">'+
                  '📎 '+escapeHtml(file.file_name)+
                  (file.file_size ? ' <span style="color:#9da8ba">('+formatBytes(file.file_size)+')</span>' : '')+
                '</a></li>';
              });
              html += '</ul>';
            }
            html += '</div>';
            return html;
          })()
        : "";

      return '<article class="pn-feedback-item">'+
        '<div class="pn-feedback-item-head">'+
          '<div class="pn-feedback-item-meta">'+
            '<span class="pn-feedback-pill" data-pos="'+escapeHtml(f.position)+'">'+escapeHtml(getPosLabel(f.position))+'</span>'+
            (f.total_flight_hours != null ? '<span class="pn-feedback-pill">'+f.total_flight_hours+' '+escapeHtml(t('total-hours'))+'</span>' : '')+
            '<span class="pn-feedback-pill">'+escapeHtml(dateLabel)+'</span>'+
          '</div>'+
          '<div>'+
            '<div class="pn-feedback-item-author">'+escapeHtml(
              (f.member_name === 'Anónimo' || f.member_name === 'Anonymous' || !f.member_name)
                ? t('anonymous')
                : f.member_name
            )+'</div>'+
            '<div class="pn-feedback-item-date">'+escapeHtml(t('published-on'))+' '+formatDate(f.created_at.slice(0,10))+'</div>'+
          '</div>'+
        '</div>'+
        (f.flight_experience_summary
          ? '<div class="pn-feedback-item-block"><h4>'+escapeHtml(t('experience'))+'</h4><div class="pn-feedback-item-body">'+escapeHtml(f.flight_experience_summary)+'</div></div>'
          : '')+
        '<div class="pn-feedback-item-block"><h4>'+escapeHtml(t('feedback-section'))+'</h4><div class="pn-feedback-item-body">'+escapeHtml(f.feedback_text)+'</div></div>'+
        aircraftHtml+
        filesHtml+
        '<div class="pn-pedir-este-fila"><button type="button" class="pn-feedback-btn pn-pedir-este" data-pedir-este="'+escapeHtml(f.id)+'">'+escapeHtml(t('pedir-este'))+'</button></div>'+
      '</article>';
    }).join("") + (ocultos ? avisoDelTope(ocultos) : "") + avisoPedir(visibles);
    var botonTope = cont.querySelector("[data-abrir-muro]");
    if (botonTope) botonTope.addEventListener("click", function () { abrirMuro(); });
    prepararPedir(cont);
    sendHeight();
    // Scroll al padre para que vea el inicio de la compañía
    requestAnimationFrame(function() {
      var detail = document.getElementById("pn-company-detail");
      if (!detail) return;
      var offset = detail.getBoundingClientRect().top + (window.pageYOffset || 0);
      llevarLaVista(offset - 16);
    });
  }

  /**
   * PEDIR LOS FEEDBACKS CON UN FORMULARIO (9-oct-2026). Cesar: «en vez de
   * que me manden un correo, que en la respectiva compañia le salga un
   * formulario con sus datos personales, correo y telefono, y me llegue a
   * mi panel para aprobar el envio automatico de los documentos».
   *
   * Sustituye al aviso con mailto del 1-oct. El formulario va a la edge
   * function «solicitar-feedbacks» (Supabase), que valida, limita y guarda;
   * a Cesar le llega un aviso y lo aprueba en la web nueva
   * (/cuenta/solicitudes). Al aprobar, la persona recibe un correo para
   * confirmar con un clic y le llega el PDF con su marca de agua.
   *
   * Las condiciones son LAS MISMAS que en la web nueva
   * (pilotnetwork-web, lib/entrega-condiciones.ts), con la misma version.
   * Si alli cambian, se cambian aqui y en la edge function.
   *
   * Contra robots: una casilla trampa invisible («web») y un minimo de 3
   * segundos con el formulario delante. Y Cesar aprueba cada una a mano.
   */
  var CONDICIONES_VERSION = "entrega-2026-10-08";
  var CONDICIONES = {
    es: [
      "Es para tu uso exclusivamente personal: para preparar tu propio proceso de selección.",
      "No puedes compartirlo, reenviarlo, publicarlo ni subirlo a grupos, foros, drives, redes sociales o academias, ni en todo ni en parte.",
      "No puedes venderlo, comercializarlo, cederlo ni usarlo en cursos, servicios o productos, propios o de terceros.",
      "No puedes quitar ni alterar la marca de agua ni el aviso legal.",
      "Todo esto vale igual para los documentos adjuntos, si los recibes: cada uno lleva tu marca y el aviso legal.",
      "Cada página lleva tu correo (y tu nombre y teléfono, si nos los diste) y un código de entrega único: si el documento aparece fuera de tus manos, se sabrá que salió de tu copia.",
      "Al aceptar quedan registrados la fecha y la hora, tu dirección IP y tu navegador, como prueba de esta aceptación.",
      "Incumplir estas condiciones te obliga a indemnizar los daños y perjuicios causados (art. 1101 del Código Civil) y puede dar lugar a acciones por la Ley de Propiedad Intelectual (arts. 133 a 141, derecho sobre la base de datos) y, si hay ánimo de lucro, por el art. 270 del Código Penal."
    ],
    en: [
      "It is for your strictly personal use: to prepare for your own selection process.",
      "You may not share, forward, publish or upload it to groups, forums, drives, social networks or academies, in whole or in part.",
      "You may not sell it, commercialise it, transfer it or use it in courses, services or products, your own or anyone else's.",
      "You may not remove or alter the watermark or the legal notice.",
      "All of this applies equally to the attached documents, if you receive them: each one carries your mark and the legal notice.",
      "Every page carries your email (and your name and phone number, if you gave them to us) and a unique delivery code: if the document turns up outside your hands, it will be known that it came from your copy.",
      "When you accept, the date and time, your IP address and your browser are recorded as proof of this acceptance.",
      "Breaching these terms makes you liable for the damage caused (Art. 1101 of the Spanish Civil Code) and may give rise to actions under the Spanish Intellectual Property Act (Arts. 133 to 141, database right) and, where there is a profit motive, Art. 270 of the Spanish Criminal Code."
    ]
  };
  var DATOS_PEDIR = {
    es: "Tus datos (tu correo y, si nos los diste, tu nombre y teléfono) se usan solo para esta entrega y para poder acreditar esta aceptación. Más información en la política de privacidad de Pilot Network.",
    en: "Your details (your email and, if you gave them, your name and phone) are used only for this delivery and to be able to prove this acceptance. More information in the Pilot Network privacy policy."
  };
  var PRIVACIDAD = { es: "https://www.pilotnetwork.es/politica-de-privacidad", en: "https://www.pilotnetwork.es/privacy-policy" };
  var CORREO_VALIDO = /^[^\s@<>()[\]\\,;:"]{1,64}@[^\s@<>()[\]\\,;:"]{1,190}\.[a-z]{2,24}$/i;
  var pedirAbierto = 0;
  var pedirHecho = null;   // { slug, correo } cuando ya se mando, para no volver a pintar el formulario

  function etiquetaFeedback(f) {
    var fecha = f.assessment_date || f.assessment_start_date || (f.created_at ? f.created_at.slice(0, 10) : "");
    return [f.position ? getPosLabel(f.position) : "", fecha ? formatDate(fecha) : ""].filter(Boolean).join(" · ") || t('anonymous');
  }

  function avisoPedir(visibles) {
    var lang = window.pnCurrentLang === 'en' ? 'en' : 'es';
    var c = state.currentCompany && state.currentCompany.name ? state.currentCompany.name : "";
    var slug = state.currentCompany ? state.currentCompany.slug : "";
    var total = state.currentCompany && state.currentCompany.feedback_count != null ? state.currentCompany.feedback_count : state.feedbacksFiltered.length;
    if (pedirHecho && pedirHecho.slug === slug) return pedirOkHtml(pedirHecho.correo);
    var opciones = '<option value="">' + escapeHtml(t('pedir-todos').split('{n}').join(String(total))) + '</option>' +
      (visibles || []).map(function (f) {
        return '<option value="' + escapeHtml(f.id) + '">' + escapeHtml(t('pedir-uno').split('{f}').join(etiquetaFeedback(f))) + '</option>';
      }).join("");
    var campo = function (id, nombre, tipo, etiqueta, extra) {
      return '<p class="pn-pedir-campo"><label for="' + id + '">' + escapeHtml(t(etiqueta)) + '</label>' +
        '<input id="' + id + '" name="' + nombre + '" type="' + tipo + '" ' + extra + '></p>';
    };
    return '<section class="pn-pedir" id="pn-pedir">' +
      '<span class="pn-pedir-icono" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" width="24" height="24" fill="none">' +
          '<rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" stroke-width="2"/>' +
          '<path d="m4 7 8 6 8-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>' +
      '</span>' +
      '<h4>' + escapeHtml(t('pedir-title').split('{c}').join(c)) + '</h4>' +
      '<p>' + escapeHtml(t('pedir-text')) + '</p>' +
      '<form class="pn-pedir-form" novalidate data-slug="' + escapeHtml(slug) + '">' +
        '<ul class="pn-pedir-errores" role="alert" hidden></ul>' +
        '<div class="pn-pedir-campos">' +
          campo('pn-pedir-nombre', 'nombre', 'text', 'pedir-nombre', 'maxlength="80" autocomplete="name" required') +
          campo('pn-pedir-telefono', 'telefono', 'tel', 'pedir-telefono', 'maxlength="24" autocomplete="tel" placeholder="+34 600 000 000" required') +
          '<p class="pn-pedir-campo pn-pedir-ancho"><label for="pn-pedir-correo">' + escapeHtml(t('pedir-correo')) + '</label>' +
            '<input id="pn-pedir-correo" name="correo" type="email" maxlength="254" autocomplete="email" required></p>' +
          '<p class="pn-pedir-campo"><label for="pn-pedir-cual">' + escapeHtml(t('pedir-cual')) + '</label>' +
            '<select id="pn-pedir-cual" name="feedback">' + opciones + '</select></p>' +
          '<p class="pn-pedir-campo"><label for="pn-pedir-idioma">' + escapeHtml(t('pedir-idioma')) + '</label>' +
            '<select id="pn-pedir-idioma" name="l"><option value="es"' + (lang === 'es' ? ' selected' : '') + '>Español</option><option value="en"' + (lang === 'en' ? ' selected' : '') + '>English</option></select></p>' +
        '</div>' +
        '<p class="pn-pedir-trampa" aria-hidden="true"><label>Web<input name="web" tabindex="-1" autocomplete="off"></label></p>' +
        '<details class="pn-pedir-condiciones"><summary>' + escapeHtml(t('pedir-condiciones')) + '</summary>' +
          '<ol>' + CONDICIONES[lang].map(function (x) { return '<li>' + escapeHtml(x) + '</li>'; }).join("") + '</ol>' +
          '<p class="pn-pedir-datos">' + escapeHtml(DATOS_PEDIR[lang]) + ' <a href="' + PRIVACIDAD[lang] + '" target="_blank" rel="noopener">' + escapeHtml(t('pedir-privacidad')) + '</a></p>' +
        '</details>' +
        '<label class="pn-pedir-acepto"><input type="checkbox" name="acepto"><span>' + escapeHtml(t('pedir-acepto')) + '</span></label>' +
        '<button class="pn-feedback-btn pn-feedback-btn-primary pn-pedir-enviar" type="submit">' + escapeHtml(t('pedir-cta')) + '</button>' +
      '</form>' +
    '</section>';
  }

  function pedirOkHtml(correo) {
    return '<section class="pn-pedir pn-pedir-ok" id="pn-pedir" aria-live="polite">' +
      '<span class="pn-pedir-icono" aria-hidden="true">✉️</span>' +
      '<h4>' + escapeHtml(t('pedir-ok-title')) + '</h4>' +
      '<p>' + escapeHtml(t('pedir-ok').split('{e}').join(correo)) + '</p>' +
      '<div class="pn-pedir-acciones"><button type="button" class="pn-feedback-btn" data-pedir-otra="1">' + escapeHtml(t('pedir-otra')) + '</button></div>' +
    '</section>';
  }

  // Lo escrito se guarda entre repintados (filtros, cambio de idioma).
  var pedirBorrador = {};
  function guardarBorrador(form) {
    if (!form) return;
    ["nombre", "telefono", "correo", "feedback", "l"].forEach(function (k) {
      if (form.elements[k]) pedirBorrador[k] = form.elements[k].value;
    });
    pedirBorrador.acepto = form.elements.acepto ? form.elements.acepto.checked : false;
    pedirBorrador.slug = form.getAttribute("data-slug");
  }

  function prepararPedir(cont) {
    var zona = cont.querySelector("#pn-pedir");
    if (!zona) return;
    var otra = zona.querySelector("[data-pedir-otra]");
    if (otra) otra.addEventListener("click", function () { pedirHecho = null; renderFeedbacks(); });
    var form = zona.querySelector("form");
    // «Pedir este feedback» en cada tarjeta: lo elige en el formulario y baja.
    cont.querySelectorAll("[data-pedir-este]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (pedirHecho) { pedirHecho = null; renderFeedbacks(); }
        var f = document.querySelector("#pn-pedir form");
        if (!f) return;
        var sel = f.elements.feedback;
        if (sel) sel.value = b.getAttribute("data-pedir-este");
        var z = document.getElementById("pn-pedir");
        var top = z.getBoundingClientRect().top + (window.pageYOffset || 0);
        llevarLaVista(top - 16);
        try { f.elements.nombre.focus({ preventScroll: true }); } catch (e) {}
      });
    });
    if (!form) return;
    if (pedirBorrador.slug === form.getAttribute("data-slug")) {
      ["nombre", "telefono", "correo", "feedback", "l"].forEach(function (k) {
        if (pedirBorrador[k] != null && form.elements[k]) form.elements[k].value = pedirBorrador[k];
      });
      if (form.elements.acepto) form.elements.acepto.checked = !!pedirBorrador.acepto;
    } else {
      pedirBorrador = {};
      pedirAbierto = Date.now();
    }
    if (!pedirAbierto) pedirAbierto = Date.now();
    form.addEventListener("input", function () { guardarBorrador(form); });
    form.addEventListener("change", function () { guardarBorrador(form); });
    form.addEventListener("submit", function (ev) { ev.preventDefault(); enviarPedir(form); });
  }

  function mostrarErroresPedir(form, claves) {
    var ul = form.querySelector(".pn-pedir-errores");
    ["nombre", "telefono", "correo"].forEach(function (k) {
      if (form.elements[k]) form.elements[k].setAttribute("aria-invalid", claves.indexOf(k) !== -1 ? "true" : "false");
    });
    if (!claves.length) { ul.hidden = true; ul.innerHTML = ""; sendHeight(); return; }
    ul.innerHTML = claves.map(function (k) { return '<li>' + escapeHtml(t('pedir-err-' + k)) + '</li>'; }).join("");
    ul.hidden = false;
    sendHeight();
  }

  async function enviarPedir(form) {
    var limpio = function (v, tope) { return String(v || "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, tope); };
    var datos = {
      slug: form.getAttribute("data-slug"),
      feedback_id: form.elements.feedback.value || null,
      nombre: limpio(form.elements.nombre.value, 80),
      telefono: limpio(form.elements.telefono.value, 24),
      correo: limpio(form.elements.correo.value, 254).toLowerCase(),
      idioma: form.elements.l.value === "en" ? "en" : "es",
      acepto: form.elements.acepto.checked === true,
      version: CONDICIONES_VERSION,
      origen: "webador",
      web: form.elements.web.value,
      ms: Date.now() - pedirAbierto
    };
    var fallos = [];
    if (!CORREO_VALIDO.test(datos.correo)) fallos.push("correo");
    if (datos.nombre.length < 2) fallos.push("nombre");
    if (datos.telefono.replace(/\D/g, "").length < 6) fallos.push("telefono");
    if (!datos.acepto) fallos.push("acepto");
    mostrarErroresPedir(form, fallos);
    if (fallos.length) return;

    var boton = form.querySelector(".pn-pedir-enviar");
    boton.disabled = true;
    boton.textContent = t('pedir-enviando');
    try {
      var cfg = window.PN_SUPABASE_CONFIG;
      var r = await fetch(cfg.SUPABASE_URL + "/functions/v1/solicitar-feedbacks", {
        method: "POST",
        headers: { 'apikey': cfg.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(datos)
      });
      var j = await r.json().catch(function () { return {}; });
      if (r.ok && j.ok) {
        pedirHecho = { slug: datos.slug, correo: datos.correo };
        pedirBorrador = {};
        var zona = document.getElementById("pn-pedir");
        if (zona) {
          zona.outerHTML = pedirOkHtml(datos.correo);
          prepararPedir($("#pn-detail-feedbacks-list"));
        }
        sendHeight();
        return;
      }
      var clave = j && j.error;
      mostrarErroresPedir(form, [clave === "limite" || clave === "correo" || clave === "nombre" || clave === "telefono" ? clave : "red"]);
    } catch (e) {
      mostrarErroresPedir(form, ["red"]);
    }
    boton.disabled = false;
    boton.textContent = t('pedir-cta');
  }

  /**
   * El cartel que sustituye al feedback numero 6 en adelante.
   *
   * Dice cuantos faltan. Un muro que solo dice "registrate" se cierra;
   * uno que dice "quedan 14" da una razon concreta para hacerlo. Y el
   * numero es el de verdad, no uno inventado para animar.
   */
  function avisoDelTope(cuantos) {
    var titulo = cuantos === 1
      ? t('tope-title-1')
      : t('tope-title-n').replace('{n}', '<span class="pn-tope-cuantos">' + cuantos + '</span>');
    return '<div class="pn-tope">' +
      '<span class="pn-tope-candado" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" width="26" height="26" fill="none">' +
          '<path d="M8 10.5V7.2a4 4 0 0 1 8 0v3.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
          '<rect x="4.6" y="10.3" width="14.8" height="10.4" rx="3.1" stroke="currentColor" stroke-width="2"/>' +
          '<circle cx="12" cy="15.2" r="1.5" fill="currentColor"/>' +
        '</svg>' +
      '</span>' +
      // titulo lleva HTML a proposito (el <span> del numero); el resto
      // del cartel es texto fijo del diccionario, nada que venga de la
      // base de datos, asi que no hay nada de nadie que escapar aqui.
      '<h4>' + titulo + '</h4>' +
      '<p>' + escapeHtml(t('tope-text')) + '</p>' +
      '<button class="pn-feedback-btn pn-feedback-btn-primary" type="button" data-abrir-muro="1">' +
        escapeHtml(t('tope-cta')) +
      '</button>' +
    '</div>';
  }

  // ===================================================================
  // MURO DE REGISTRO
  // ===================================================================
  function abrirMuro() {
    var m = $("#pn-lock-modal");
    if (!m) return;
    var hayRegistro = !!URL_CUENTA;
    var cta = $("#pn-lock-cta");
    var pronto = $("#pn-lang-lock-soon");
    if (cta)    { cta.href = URL_CUENTA || "#"; cta.hidden = !hayRegistro; }
    if (pronto) { pronto.hidden = hayRegistro; }
    // "Gratis, sin publicidad" solo tiene sentido si hay algo que crear.
    var pie = $(".pn-muro-pie");
    if (pie) pie.hidden = !hayRegistro;
    m.hidden = false;
    m.setAttribute("aria-hidden", "false");
    modalIsOpen = true;
    // Como el modal esta dentro del iframe, si el padre esta scrolleado
    // hacia abajo el cartel queda fuera de la pantalla. Se le pide al
    // padre que suba, igual que hace el modal de publicar feedback.
    llevarLaVistaArriba();
    var cerrar = m.querySelector(".pn-muro-cerrar");
    if (cerrar) cerrar.focus();
    sendHeight();
  }

  function cerrarMuro() {
    var m = $("#pn-lock-modal");
    if (!m) return;
    m.hidden = true;
    m.setAttribute("aria-hidden", "true");
    modalIsOpen = false;
    sendHeight();
  }

  /**
   * Lo que pasa al pulsar una descarga cuando estan cerradas.
   *
   * El candado y el barrido de luz los pone el CSS; aqui solo se pone y
   * se quita la clase. La clase se quita al terminar la animacion para
   * que el efecto vuelva a salir la siguiente vez que pulse: si se
   * quedara puesta, el segundo toque no haria nada visible y pareceria
   * que el boton se ha roto.
   */
  function avisarBloqueado(btn) {
    if (!btn) return;
    btn.classList.remove("esta-bloqueado");
    void btn.offsetWidth;               // reinicia la animacion
    btn.classList.add("esta-bloqueado");
    btn.setAttribute("aria-disabled", "true");
    window.setTimeout(function () {
      btn.classList.remove("esta-bloqueado");
      btn.removeAttribute("aria-disabled");
    }, 1100);
    // El cartel entra cuando la luz ya ha barrido: si sale a la vez, no
    // da tiempo a ver el candado y parece que el boton no ha hecho nada.
    window.setTimeout(abrirMuro, 420);
  }

  // ===================================================================
  // MODAL: NUEVO FEEDBACK
  // ===================================================================
  function fillCompanySelect() {
    var sel = $("#pn-f-company");
    if (!sel) return;
    var current = sel.value;
    var lang = window.pnCurrentLang || 'es';
    var ph = lang === 'en' ? 'Select a company…' : 'Selecciona una compañía…';
    sel.innerHTML = '<option value="">'+escapeHtml(ph)+'</option>';
    state.companies.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      sel.appendChild(opt);
    });
    if (current) sel.value = current;
  }

  function openFeedbackModal(slug) {
    var modal = $("#pn-feedback-modal");
    modalIsOpen = true;
    resetFeedbackForm();
    if (slug) {
      var c = state.companies.find(function (x) { return x.slug === slug; });
      if (c) $("#pn-f-company").value = c.id;
    }
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    // Scroll al top del iframe para que el usuario vea el modal
    llevarLaVistaArriba();
    sendHeight();
  }
  function closeFeedbackModal() {
    var modal = $("#pn-feedback-modal");
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    modalIsOpen = false;
    sendHeight();
  }

  function resetFeedbackForm() {
    var form = $("#pn-feedback-form");
    form.reset();
    form.hidden = false;
    $("#pn-form-success").hidden = true;
    $("#pn-form-status").hidden = true;
    $("#pn-form-status").textContent = "";
    $("#pn-files-preview").innerHTML = "";
    selectedFiles = [];
    $("#pn-aircraft-blocks").innerHTML = "";
    addAircraftBlock(); // arrancamos con uno
    $("#pn-f-text-count").textContent = "0";
    $("#pn-submit-btn").disabled = false;
    $$(".pn-feedback-field.has-error").forEach(function (el) { el.classList.remove("has-error"); });
  }

  // ----- Bloques de avión -----
  function addAircraftBlock(prefill) {
    var cont = $("#pn-aircraft-blocks");
    var row = document.createElement("div");
    row.className = "pn-feedback-aircraft-row";
    row.innerHTML =
      '<input type="text" data-aircraft-type placeholder="Tipo (A320, B737, ATR72…)" maxlength="40" />'+
      '<input type="number" data-aircraft-hours placeholder="Horas" min="0" max="50000" step="1" />'+
      '<button type="button" class="pn-feedback-aircraft-remove" aria-label="Eliminar avión">×</button>';
    if (prefill) {
      row.querySelector("[data-aircraft-type]").value = prefill.type || "";
      row.querySelector("[data-aircraft-hours]").value = prefill.hours || "";
    }
    row.querySelector(".pn-feedback-aircraft-remove").addEventListener("click", function () {
      row.remove();
      sendHeight();
    });
    cont.appendChild(row);
    sendHeight();
  }

  // ----- Selección de archivos -----
  var selectedFiles = [];

  function isValidExtension(name) {
    var ext = (name.split(".").pop() || "").toLowerCase();
    return CFG.ALLOWED_FILE_EXTENSIONS.indexOf(ext) !== -1;
  }
  function validateFile(file) {
    if (file.size > CFG.MAX_FILE_SIZE_BYTES) {
      return "El archivo supera " + (CFG.MAX_FILE_SIZE_BYTES/1024/1024) + " MB";
    }
    if (!isValidExtension(file.name)) {
      return "Extensión no permitida (sólo " + CFG.ALLOWED_FILE_EXTENSIONS.join(", ") + ")";
    }
    return null;
  }

  function handleFileSelection(files) {
    var arr = Array.from(files || []);
    arr.forEach(function (f) {
      if (selectedFiles.length >= CFG.MAX_FILES_PER_FEEDBACK) {
        renderFilesPreview("Máximo " + CFG.MAX_FILES_PER_FEEDBACK + " archivos.");
        return;
      }
      var err = validateFile(f);
      selectedFiles.push({ file: f, error: err });
    });
    renderFilesPreview();
  }
  function renderFilesPreview(extraMsg) {
    var ul = $("#pn-files-preview");
    ul.innerHTML = selectedFiles.map(function (entry, idx) {
      var cls = entry.error ? "is-invalid" : "";
      var info = entry.error
        ? '<small style="color:inherit">⚠️ '+escapeHtml(entry.error)+'</small>'
        : '<small style="color:#9da8ba">'+escapeHtml(formatBytes(entry.file.size))+'</small>';
      return '<li class="'+cls+'">'+
        '<span style="overflow-wrap:anywhere;flex:1">📄 '+escapeHtml(entry.file.name)+' '+info+'</span>'+
        '<button type="button" data-rm-idx="'+idx+'" aria-label="Quitar archivo">×</button>'+
      '</li>';
    }).join("");
    if (extraMsg) {
      var li = document.createElement("li");
      li.className = "is-invalid";
      li.textContent = extraMsg;
      ul.appendChild(li);
    }
    sendHeight();
  }

  function onPreviewClick(e) {
    var btn = e.target.closest("[data-rm-idx]");
    if (!btn) return;
    var idx = parseInt(btn.getAttribute("data-rm-idx"), 10);
    selectedFiles.splice(idx, 1);
    renderFilesPreview();
  }

  // ----- Drag & drop -----
  function setupDropzone() {
    var dz = $("#pn-dropzone");
    ["dragenter","dragover"].forEach(function (ev) {
      dz.addEventListener(ev, function (e) {
        e.preventDefault(); e.stopPropagation();
        dz.classList.add("is-dragover");
      });
    });
    ["dragleave","drop"].forEach(function (ev) {
      dz.addEventListener(ev, function (e) {
        e.preventDefault(); e.stopPropagation();
        dz.classList.remove("is-dragover");
      });
    });
    dz.addEventListener("drop", function (e) {
      if (e.dataTransfer && e.dataTransfer.files) handleFileSelection(e.dataTransfer.files);
    });
    $("#pn-f-files").addEventListener("change", function (e) {
      handleFileSelection(e.target.files);
      e.target.value = ""; // permitir re-seleccionar el mismo
    });
  }

  // ----- Validación + submit -----
  function setFormStatus(msg, type) {
    var el = $("#pn-form-status");
    el.textContent = msg || "";
    if (msg) {
      el.hidden = false;
      el.setAttribute("data-type", type || "info");
    } else {
      el.hidden = true;
    }
  }

  function collectFormData() {
    var data = {
      company_id:               $("#pn-f-company").value || null,
      member_name:              $("#pn-f-name").value.trim(),
      member_email:             $("#pn-f-email").value.trim() || null,
      assessment_date:          $("#pn-f-date").value || null,
      assessment_start_date:    $("#pn-f-date-start").value || null,
      assessment_end_date:      $("#pn-f-date-end").value || null,
      position:                 $("#pn-f-position").value || null,
      total_flight_hours:       $("#pn-f-hours").value ? parseInt($("#pn-f-hours").value, 10) : null,
      flight_experience_summary: $("#pn-f-experience").value.trim() || null,
      feedback_text:            $("#pn-f-text").value.trim()
    };
    var aircraft = $$("#pn-aircraft-blocks .pn-feedback-aircraft-row").map(function (row) {
      var t = row.querySelector("[data-aircraft-type]").value.trim();
      var h = row.querySelector("[data-aircraft-hours]").value;
      if (!t) return null;
      return { aircraft_type: t, hours: h ? parseInt(h,10) : null };
    }).filter(Boolean);

    return { feedback: data, aircraft: aircraft };
  }

  function validate(data) {
    $$(".pn-feedback-field.has-error").forEach(function (el) { el.classList.remove("has-error"); });

    var errors = [];
    if (!data.feedback.company_id) { errors.push("Selecciona una compañía."); $("#pn-f-company").closest(".pn-feedback-field").classList.add("has-error"); }
    if (!data.feedback.member_name || data.feedback.member_name.length < 2) { errors.push("Nombre o nickname obligatorio (mín 2 caracteres)."); $("#pn-f-name").closest(".pn-feedback-field").classList.add("has-error"); }
    if (data.feedback.member_email && !/^\S+@\S+\.\S+$/.test(data.feedback.member_email)) { errors.push("Email no parece válido."); $("#pn-f-email").closest(".pn-feedback-field").classList.add("has-error"); }
    if (!data.feedback.position) { errors.push("Indica la posición."); $("#pn-f-position").closest(".pn-feedback-field").classList.add("has-error"); }
    if (!data.feedback.feedback_text || data.feedback.feedback_text.length < 80) { errors.push("El texto del feedback debe tener al menos 80 caracteres."); $("#pn-f-text").closest(".pn-feedback-field").classList.add("has-error"); }
    if (data.feedback.total_flight_hours != null && (data.feedback.total_flight_hours < 0 || data.feedback.total_flight_hours > 50000)) { errors.push("Las horas totales no son válidas."); $("#pn-f-hours").closest(".pn-feedback-field").classList.add("has-error"); }
    if (!$("#pn-f-legal").checked) { errors.push("Debes aceptar el aviso legal."); }

    // Archivos: ningún error individual
    var fileError = selectedFiles.find(function (s) { return s.error; });
    if (fileError) errors.push("Hay archivos no válidos. Quítalos para continuar.");
    if (selectedFiles.length > CFG.MAX_FILES_PER_FEEDBACK) errors.push("Demasiados archivos.");

    return errors;
  }

  // Genera un UUID v4 en el cliente para no necesitar SELECT tras el INSERT.
  // (Supabase comprueba la política SELECT al hacer INSERT...RETURNING,
  //  pero los feedbacks recién insertados son 'pending' y la política anon
  //  solo permite ver 'approved' → falla. Con UUID propio evitamos el problema.)
  function generateUUID() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0;
      return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }


  function sanitizeFilename(name) {
    // Quitamos caracteres raros y mantenemos extensión
    var clean = name.replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_");
    return clean.length > 80 ? clean.slice(-80) : clean;
  }

  async function onSubmit(e) {
    e.preventDefault();
    var btn = $("#pn-submit-btn");
    var label = btn.querySelector(".pn-feedback-btn-label");
    var spin = btn.querySelector(".pn-feedback-btn-spinner");

    // Turnstile, ahora de verdad.
    //
    // Antes esto era decorativo: se miraba si la casilla estaba marcada EN EL
    // NAVEGADOR y, si el widget no cargaba, se dejaba pasar. El token no se
    // enviaba a ningun sitio y nadie lo verificaba. Cloudflare lo avisaba en
    // su panel: "Siteverify isn't being called". Ahora el token viaja a la
    // Edge Function, que lo comprueba contra Cloudflare antes de guardar nada.
    var tsResponse = document.querySelector("[name='cf-turnstile-response']");
    var tsToken = tsResponse && tsResponse.value;
    if (!tsToken) {
      setFormStatus("Completa la verificacion de seguridad para poder enviar.", "error");
      sendHeight();
      return;
    }

    var collected = collectFormData();
    var errors = validate(collected);
    if (errors.length) {
      setFormStatus(errors[0], "error");
      sendHeight();
      return;
    }

    setFormStatus("Enviando\u2026", "info");
    btn.disabled = true;
    label.textContent = "Enviando\u2026";
    spin.hidden = false;

    function reiniciarTurnstile() {
      // Los tokens son de un solo uso: si el envio falla hay que pedir otro,
      // o el segundo intento lo rechaza Cloudflare.
      try { if (window.turnstile) window.turnstile.reset("#pn-turnstile"); } catch (e) {}
    }

    try {
      var cfg = window.PN_SUPABASE_CONFIG;

      // 1) Crear el feedback a traves de la funcion. El id lo devuelve ella:
      //    ya no se genera en el navegador.
      var fnUrl = cfg.SUPABASE_URL + "/functions/v1/feedback-submit";
      var crearResp = await fetch(fnUrl, {
        method: "POST",
        headers: {
          'apikey': cfg.SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + cfg.SUPABASE_ANON_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sitio: "pilot",
          accion: "crear",
          turnstile_token: tsToken,
          feedback: collected.feedback,
          bloques: collected.aircraft
        })
      });
      var crear = await crearResp.json().catch(function () { return {}; });
      if (!crearResp.ok || !crear.ok) {
        reiniciarTurnstile();
        var mensajes = {
          turnstile_rechazado: "La verificacion de seguridad no ha pasado. Marca la casilla otra vez.",
          falta_turnstile: "Falta la verificacion de seguridad.",
          verificacion_no_configurada: "El envio esta temporalmente desactivado. Intentalo mas tarde.",
          feedback_demasiado_corto: "El feedback es demasiado corto.",
          empresa_inexistente: "Esa compania ya no existe. Recarga la pagina.",
          correo_invalido: "El correo no parece valido."
        };
        throw new Error(mensajes[crear.error] || "No se ha podido enviar el feedback.");
      }
      var feedbackId = crear.id;

      // 2) Archivos: se suben al bucket y luego se registran por la funcion,
      //    que comprueba que la ruta cuelga de este feedback y que es reciente.
      if (selectedFiles.length) {
        setFormStatus("Subiendo archivos\u2026", "info");
        var subidos = [];
        for (var fi = 0; fi < selectedFiles.length; fi++) {
          var sf = selectedFiles[fi];
          if (sf.error) continue;
          var cleanName = sanitizeFilename(sf.file.name);
          var filePath = feedbackId + "/" + Date.now() + "_" + cleanName;
          var uploadUrl = cfg.SUPABASE_URL + "/storage/v1/object/" + cfg.STORAGE_BUCKET + "/" + filePath;
          var uploadResp = await fetch(uploadUrl, {
            method: "POST",
            headers: {
              'apikey': cfg.SUPABASE_ANON_KEY,
              'Authorization': 'Bearer ' + cfg.SUPABASE_ANON_KEY,
              'Content-Type': sf.file.type || 'application/octet-stream',
              'x-upsert': 'true'
            },
            body: sf.file
          });
          if (!uploadResp.ok) {
            console.warn("[pn-feedback] no se pudo subir un archivo:", uploadResp.status);
            continue; // un archivo suelto no tumba el feedback
          }
          subidos.push({
            file_name: sf.file.name,
            file_path: filePath,
            file_size: sf.file.size,
            file_type: sf.file.type || 'application/octet-stream',
            storage_bucket: cfg.STORAGE_BUCKET
          });
        }
        if (subidos.length) {
          await fetch(fnUrl, {
            method: "POST",
            headers: {
              'apikey': cfg.SUPABASE_ANON_KEY,
              'Authorization': 'Bearer ' + cfg.SUPABASE_ANON_KEY,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              sitio: "pilot",
              accion: "registrar-ficheros",
              id: feedbackId,
              ficheros: subidos
            })
          });
        }
      }

      // 3) Exito
      $("#pn-feedback-form").hidden = true;
      $("#pn-form-success").hidden = false;
      sendHeight();

    } catch (err) {
      console.error("[pn-feedback] submit error:", err);
      setFormStatus("Error al enviar: " + (err.message || err) + ". Inténtalo de nuevo.", "error");
    } finally {
      btn.disabled = false;
      label.textContent = "Enviar feedback";
      spin.hidden = true;
      sendHeight();
    }
  }

  // ===================================================================
  // POSICIONAMIENTO DEL MODAL DENTRO DEL IFRAME
  // ===================================================================
  // El iframe no hace scroll: lo hace el padre (Webador).
  // Cuando el modal se abre, pedimos al padre su scroll relativo
  // al top del iframe. El padre responde con pn-parent-scroll-info
  // y posicionamos la card en esa zona del documento.
  function positionModalCard(scrollTopInIframe) {
    var card = document.querySelector(".pn-feedback-modal-card");
    if (!card) return;
    var top = Math.max(16, scrollTopInIframe + 16);
    card.style.marginTop = top + "px";
  }

  window.addEventListener("message", function (e) {
    if (!e.data) return;
    if (e.data.type === "pn-parent-scroll-info") {
      positionModalCard(e.data.scrollTop || 0);
    }
  });


  function readHash() {
    var h = location.hash || "";
    var m = h.match(/^#\/company\/([\w-]+)$/);
    if (m) {
      var slug = m[1];
      // Esperar a que las compañías estén cargadas
      if (state.companies.length) openCompany(slug);
      else { state._pendingSlug = slug; }
    } else {
      showListView();
    }
  }

  // ===================================================================
  // AUTO-HEIGHT a la web padre (postMessage)
  // ===================================================================
  var lastSentHeight = 0;
  function sendHeight() {
    // No redimensionar el iframe mientras el modal está abierto — evita el loop infinito
    if (modalIsOpen) return;
    // Esperamos al próximo frame para que el DOM se haya actualizado
    requestAnimationFrame(function () {
      var h = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight
      );
      if (Math.abs(h - lastSentHeight) < 4) return;
      lastSentHeight = h;
      try {
        window.parent.postMessage({
          type: "pn-feedback-height",
          height: h
        }, "*");
      } catch (e) {}
    });
  }
  // Re-emit en resize
  window.addEventListener("resize", sendHeight);

  // ===================================================================
  // DESCARGA FEEDBACKS EN WORD (.docx)
  // ===================================================================
  function downloadFeedbacksDocx() {
    // Cinturon y tirantes. El boton ya avisa antes de llegar aqui, pero
    // esta funcion tambien se puede llamar desde la consola o desde un
    // futuro boton que alguien conecte sin acordarse del muro. Que la
    // condicion viva DENTRO de la funcion es lo que hace que no haya
    // dos sitios donde acordarse.
    if (!DESCARGAS_ABIERTAS) { abrirMuro(); return; }
    var company = state.currentCompany;
    var feedbacks = state.feedbacksFiltered;
    var lang = window.pnCurrentLang || 'en';
    var isEn = lang === 'en';
    if (!company || !feedbacks.length) {
      alert(isEn ? "No feedbacks to download." : "No hay feedbacks para descargar.");
      return;
    }

    var LABELS = {
      subtitle:    isEn ? 'Assessment Feedbacks' : 'Feedbacks de Assessments',
      catLabel:    getCatLabel(company.category),
      countLabel:  feedbacks.length + (isEn
        ? ' feedback' + (feedbacks.length === 1 ? '' : 's') + ' published'
        : ' feedback' + (feedbacks.length === 1 ? '' : 's') + ' publicado' + (feedbacks.length === 1 ? '' : 's')),
      generated:   (isEn ? 'Generated: ' : 'Generado: ') + new Date().toLocaleDateString(isEn ? 'en-GB' : 'es-ES'),
      position:    isEn ? 'Position: '         : 'Posición: ',
      dateAssess:  isEn ? 'Assessment date: '  : 'Fecha assessment: ',
      hours:       isEn ? 'Total hours: '      : 'Horas totales: ',
      postedBy:    isEn ? 'Posted by: '        : 'Publicado por: ',
      pubDate:     isEn ? 'Publication date: ' : 'Fecha publicación: ',
      expTitle:    isEn ? 'Flight experience:' : 'Experiencia de vuelo:',
      fbTitle:     'Feedback:',
      aircraftTitle: isEn ? 'Aircraft flown:'  : 'Aviones volados:',
      dateNotSet:  isEn ? 'Date not specified' : 'Fecha no indicada',
      anon:        isEn ? 'Anonymous'          : 'Anónimo',
      footer:      'pilotnetwork.es · Assessment Feedbacks',
    };

    function xmlEscape(str) {
      if (!str) return "";
      return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    }
    function para(text, opts) {
      opts = opts || {};
      var sz = opts.size || 24;
      var bold = opts.bold ? "<w:b/>" : "";
      var color = opts.color ? "<w:color w:val=\"" + opts.color + "\"/>" : "";
      var spaceAfter = opts.spaceAfter || 120;
      var align = opts.align ? "<w:jc w:val=\"" + opts.align + "\"/>" : "";
      var lines = String(text || "").split("\n");
      return lines.map(function(line, i) {
        return "<w:p>" +
          "<w:pPr><w:spacing w:after=\"" + (i === lines.length-1 ? spaceAfter : 0) + "\"/>" + align + "</w:pPr>" +
          "<w:r><w:rPr>" + bold + color + "<w:sz w:val=\"" + sz + "\"/><w:szCs w:val=\"" + sz + "\"/></w:rPr>" +
          "<w:t xml:space=\"preserve\">" + xmlEscape(line) + "</w:t></w:r>" +
        "</w:p>";
      }).join("");
    }
    function divider() {
      return "<w:p><w:pPr><w:pBdr><w:bottom w:val=\"single\" w:sz=\"6\" w:space=\"1\" w:color=\"334466\"/></w:pBdr><w:spacing w:after=\"160\"/></w:pPr></w:p>";
    }

    var bodyXml = "";
    bodyXml += para("PILOT NETWORK",    { bold: true, size: 64, color: "1a3a6e", align: "center", spaceAfter: 80 });
    bodyXml += para(LABELS.subtitle,    { bold: true, size: 40, color: "2255aa", align: "center", spaceAfter: 80 });
    bodyXml += para(company.name,       { bold: true, size: 52, color: "000000", align: "center", spaceAfter: 80 });
    bodyXml += para(LABELS.catLabel,    { size: 24, color: "666666", align: "center", spaceAfter: 80 });
    bodyXml += para(LABELS.countLabel,  { size: 22, color: "888888", align: "center", spaceAfter: 80 });
    bodyXml += para(LABELS.generated,   { size: 20, color: "aaaaaa", align: "center", spaceAfter: 400 });
    bodyXml += "<w:p><w:r><w:br w:type=\"page\"/></w:r></w:p>";

    feedbacks.forEach(function(f, idx) {
      bodyXml += para("Feedback #" + (idx + 1), { bold: true, size: 32, color: "1a3a6e", spaceAfter: 80 });
      var pos = getPosLabel(f.position);
      var dateLabel = f.assessment_date
        ? formatDate(f.assessment_date)
        : (f.assessment_start_date ? formatDate(f.assessment_start_date) + (f.assessment_end_date ? " — " + formatDate(f.assessment_end_date) : "") : LABELS.dateNotSet);
      bodyXml += para(LABELS.position + pos, { size: 20, color: "334466", spaceAfter: 40 });
      bodyXml += para(LABELS.dateAssess + dateLabel, { size: 20, color: "334466", spaceAfter: 40 });
      if (f.total_flight_hours != null) bodyXml += para(LABELS.hours + f.total_flight_hours + "h", { size: 20, color: "334466", spaceAfter: 40 });
      bodyXml += para(LABELS.postedBy + (f.member_name || LABELS.anon), { size: 20, color: "334466", spaceAfter: 40 });
      bodyXml += para(LABELS.pubDate + formatDate(f.created_at.slice(0,10)), { size: 18, color: "888888", spaceAfter: 120 });
      if (f.flight_experience_summary) {
        bodyXml += para(LABELS.expTitle, { bold: true, size: 22, color: "000000", spaceAfter: 60 });
        bodyXml += para(f.flight_experience_summary, { size: 20, color: "333333", spaceAfter: 120 });
      }
      bodyXml += para(LABELS.fbTitle, { bold: true, size: 22, color: "000000", spaceAfter: 60 });
      bodyXml += para(f.feedback_text, { size: 20, color: "222222", spaceAfter: 120 });
      if (f.aircraft_hours && f.aircraft_hours.length) {
        bodyXml += para(LABELS.aircraftTitle, { bold: true, size: 22, color: "000000", spaceAfter: 60 });
        f.aircraft_hours.forEach(function(a) {
          bodyXml += para("  • " + a.aircraft_type + (a.hours != null ? " · " + a.hours + "h" : ""), { size: 20, color: "334466", spaceAfter: 40 });
        });
      }
      bodyXml += divider();
      if (idx < feedbacks.length - 1) bodyXml += "<w:p><w:pPr><w:spacing w:after=\"160\"/></w:pPr></w:p>";
    });

    bodyXml += para(LABELS.footer, { size: 16, color: "aaaaaa", align: "center", spaceAfter: 0 });

    var docXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" ' +
      'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<w:body>' + bodyXml +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>' +
      '</w:body></w:document>';

    function loadJSZip(cb) {
      if (window.JSZip) return cb();
      var s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      s.onload = cb;
      document.head.appendChild(s);
    }
    loadJSZip(function() {
      var zip = new JSZip();
      zip.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
      zip.file("_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
      zip.file("word/document.xml", docXml);
      zip.file("word/_rels/document.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
      zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }).then(function(blob) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "feedbacks-" + company.slug + ".docx";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
      });
    });
  }

  // ===================================================================
  // DESCARGA ARCHIVOS ADJUNTOS EN ZIP
  // ===================================================================
  /**
   * Los mismos feedbacks, en PDF.
   *
   * POR QUE EXISTE SI EL BOTON ESTA BLOQUEADO. Porque el dia que se
   * abran las descargas tiene que funcionar sin escribirla con prisa.
   * Un boton que existe pero no hace nada por dentro es peor que no
   * tener boton: se descubre el hueco justo cuando ya esta publicado.
   *
   * POR QUE jsPDF Y NO IMPRIMIR LA PAGINA. window.print() dentro de un
   * iframe imprime la web entera del padre, con su menu y su pie. Y
   * "guardar como PDF" depende del navegador de cada uno. jsPDF da
   * siempre el mismo documento, se llame desde donde se llame. Se carga
   * solo cuando hace falta, igual que JSZip para el Word: quien no
   * descarga nada no se traga la libreria.
   */
  function downloadFeedbacksPdf() {
    if (!DESCARGAS_ABIERTAS) { abrirMuro(); return; }

    var company = state.currentCompany;
    var feedbacks = state.feedbacksFiltered;
    var isEn = (window.pnCurrentLang || 'en') === 'en';
    if (!company || !feedbacks.length) {
      alert(isEn ? "No feedbacks to download." : "No hay feedbacks para descargar.");
      return;
    }

    var L = {
      subtitle:   isEn ? 'Assessment Feedbacks' : 'Feedbacks de Assessments',
      generated:  (isEn ? 'Generated: ' : 'Generado: ') + new Date().toLocaleDateString(isEn ? 'en-GB' : 'es-ES'),
      hours:      isEn ? 'Total hours: '      : 'Horas totales: ',
      postedBy:   isEn ? 'Posted by: '        : 'Publicado por: ',
      pubDate:    isEn ? 'Published: '        : 'Publicado: ',
      expTitle:   isEn ? 'Flight experience'  : 'Experiencia de vuelo',
      fbTitle:    'Feedback',
      acTitle:    isEn ? 'Aircraft flown'     : 'Aviones volados',
      dateNotSet: isEn ? 'Date not specified' : 'Fecha no indicada',
      anon:       isEn ? 'Anonymous'          : 'Anónimo',
      page:       isEn ? 'Page '              : 'Página ',
      footer:     'pilotnetwork.es · Assessment Feedbacks'
    };

    function cargarJsPDF(cb) {
      if (window.jspdf && window.jspdf.jsPDF) return cb();
      var sc = document.createElement("script");
      sc.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      sc.onload = cb;
      sc.onerror = function () {
        alert(isEn ? "The PDF library could not be loaded." : "No se ha podido cargar la librería del PDF.");
      };
      document.head.appendChild(sc);
    }

    cargarJsPDF(function () {
      var jsPDF = window.jspdf.jsPDF;
      var doc = new jsPDF({ unit: "mm", format: "a4" });

      var ANCHO = 210, ALTO = 297, MARGEN = 18;
      var UTIL = ANCHO - MARGEN * 2;
      var y = 0;

      // --- Cabecera de la primera pagina ---
      doc.setFillColor(11, 16, 32);
      doc.rect(0, 0, ANCHO, 42, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold"); doc.setFontSize(20);
      doc.text(String(company.name || ""), MARGEN, 20);
      doc.setFont("helvetica", "normal"); doc.setFontSize(10.5);
      doc.setTextColor(157, 180, 255);
      doc.text(L.subtitle + "  ·  " + getCatLabel(company.category), MARGEN, 28);
      doc.setTextColor(150, 160, 180); doc.setFontSize(9);
      doc.text(L.generated + "   ·   " + feedbacks.length + " feedback" + (feedbacks.length === 1 ? "" : "s"), MARGEN, 35);
      y = 54;

      function pieDePagina() {
        doc.setFont("helvetica", "normal"); doc.setFontSize(8);
        doc.setTextColor(170, 175, 185);
        doc.text(L.footer, MARGEN, ALTO - 10);
        doc.text(L.page + doc.internal.getNumberOfPages(), ANCHO - MARGEN, ALTO - 10, { align: "right" });
      }

      /** Reserva alto; si no cabe, pasa de pagina. Devuelve la y buena. */
      function sitio(alto) {
        if (y + alto <= ALTO - 20) return y;
        pieDePagina();
        doc.addPage();
        y = MARGEN + 4;
        return y;
      }

      function parrafo(texto, opts) {
        opts = opts || {};
        var tam = opts.size || 10;
        var interlinea = tam * 0.52;
        doc.setFont("helvetica", opts.bold ? "bold" : "normal");
        doc.setFontSize(tam);
        var c = opts.color || [40, 45, 58];
        doc.setTextColor(c[0], c[1], c[2]);
        var lineas = doc.splitTextToSize(String(texto == null ? "" : texto), UTIL);
        for (var i = 0; i < lineas.length; i++) {
          y = sitio(interlinea + 1);
          doc.text(lineas[i], MARGEN, y);
          y += interlinea + 1;
        }
        y += (opts.after == null ? 2 : opts.after);
      }

      feedbacks.forEach(function (f, idx) {
        var fecha = f.assessment_date
          ? formatDate(f.assessment_date)
          : (f.assessment_start_date && f.assessment_end_date
              ? formatDate(f.assessment_start_date) + " — " + formatDate(f.assessment_end_date)
              : (f.assessment_start_date ? formatDate(f.assessment_start_date) : L.dateNotSet));
        var autor = (!f.member_name || f.member_name === 'Anónimo' || f.member_name === 'Anonymous')
          ? L.anon : f.member_name;

        y = sitio(26);
        doc.setDrawColor(222, 228, 238);
        doc.setLineWidth(0.3);
        doc.line(MARGEN, y - 4, ANCHO - MARGEN, y - 4);

        parrafo(getPosLabel(f.position) + "   ·   " + fecha, { bold: true, size: 12, color: [17, 24, 44], after: 1 });
        var meta = L.postedBy + autor + "   ·   " + L.pubDate + formatDate(String(f.created_at || "").slice(0, 10));
        if (f.total_flight_hours != null) meta += "   ·   " + L.hours + f.total_flight_hours;
        parrafo(meta, { size: 8.5, color: [120, 128, 145], after: 4 });

        if (f.flight_experience_summary) {
          parrafo(L.expTitle, { bold: true, size: 9.5, color: [37, 99, 235], after: 1.5 });
          parrafo(f.flight_experience_summary, { size: 10, color: [55, 62, 76], after: 4 });
        }

        parrafo(L.fbTitle, { bold: true, size: 9.5, color: [37, 99, 235], after: 1.5 });
        parrafo(f.feedback_text, { size: 10, color: [30, 36, 48], after: 4 });

        if (f.aircraft_hours && f.aircraft_hours.length) {
          parrafo(L.acTitle, { bold: true, size: 9.5, color: [37, 99, 235], after: 1.5 });
          f.aircraft_hours.forEach(function (a) {
            parrafo("•  " + a.aircraft_type + (a.hours != null ? "  ·  " + a.hours + " h" : ""), { size: 10, color: [51, 68, 102], after: 0.5 });
          });
          y += 3;
        }

        if (idx < feedbacks.length - 1) y += 5;
      });

      pieDePagina();
      doc.save("feedbacks-" + company.slug + ".pdf");
    });
  }

  async function downloadFeedbacksFiles() {
    if (!DESCARGAS_ABIERTAS) { abrirMuro(); return; }
    var company = state.currentCompany;

    var feedbacks = state.feedbacksFiltered;
    if (!company || !feedbacks.length) {
      alert("No hay feedbacks para descargar.");
      return;
    }

    // Recopilar todos los archivos de todos los feedbacks
    var allFiles = [];
    feedbacks.forEach(function(f, idx) {
      if (f.files && f.files.length) {
        f.files.forEach(function(file) {
          allFiles.push({ file: file, feedbackIdx: idx + 1 });
        });
      }
    });

    if (!allFiles.length) {
      alert("No hay archivos adjuntos en estos feedbacks.");
      return;
    }

    // Cargar JSZip si no está cargado
    function loadJSZip(cb) {
      if (window.JSZip) return cb();
      var script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      script.onload = cb;
      document.head.appendChild(script);
    }

    loadJSZip(async function() {
      var btn = $("#pn-detail-download-files");
      btn.disabled = true;
      btn.textContent = "⏳ Descargando…";

      var zip = new JSZip();
      var cfg = window.PN_SUPABASE_CONFIG;
      var baseUrl = cfg.SUPABASE_URL + "/storage/v1/object/public/";
      var errors = 0;

      for (var i = 0; i < allFiles.length; i++) {
        var entry = allFiles[i];
        var file = entry.file;
        var url = baseUrl + (file.storage_bucket || "feedback-files") + "/" + file.file_path;
        var folderName = "feedback-" + entry.feedbackIdx;
        var fileName = file.file_name || ("archivo-" + i);

        try {
          var resp = await fetch(url);
          if (resp.ok) {
            var blob = await resp.blob();
            zip.file(folderName + "/" + fileName, blob);
          } else {
            errors++;
          }
        } catch(e) {
          errors++;
        }
      }

      var zipBlob = await zip.generateAsync({ type: "blob" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(zipBlob);
      a.download = "archivos-" + company.slug + ".zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);

      btn.disabled = false;
      btn.innerHTML = "🗜️ <span>Descargar archivos</span>";

      if (errors > 0) {
        alert(errors + " archivo(s) no se pudieron descargar.");
      }
    });
  }

  // ===================================================================
  // EVENTOS
  // ===================================================================
  function bindEvents() {
    // Filtros principales
    $$(".pn-feedback-filter").forEach(function (b) {
      b.addEventListener("click", function () {
        $$(".pn-feedback-filter").forEach(function (x) { x.classList.remove("is-active"); });
        b.classList.add("is-active");
        state.filter = b.getAttribute("data-filter");
        applyCompanyFilters();
      });
    });
    // Buscador
    var t;
    $("#pn-search-input").addEventListener("input", function (e) {
      clearTimeout(t);
      t = setTimeout(function () {
        state.search = e.target.value || "";
        applyCompanyFilters();
      }, 150);
    });

    // Grid
    $("#pn-companies-grid").addEventListener("click", onGridClick);
    $("#pn-companies-grid").addEventListener("keydown", onGridKey);

    // Volver
    $("#pn-back-button").addEventListener("click", showListView);

    // Filtros detalle
    $$("#pn-company-detail [data-pos]").forEach(function (b) {
      b.addEventListener("click", function () {
        $$("#pn-company-detail [data-pos]").forEach(function (x) { x.classList.remove("is-active"); });
        b.classList.add("is-active");
        state.positionFilter = b.getAttribute("data-pos");
        applyFeedbackFilters();
      });
    });
    $("#pn-date-from").addEventListener("change", function (e) { state.dateFrom = e.target.value; applyFeedbackFilters(); });
    $("#pn-date-to").addEventListener("change",   function (e) { state.dateTo   = e.target.value; applyFeedbackFilters(); });
    $("#pn-date-clear").addEventListener("click", function () {
      state.dateFrom = ""; state.dateTo = "";
      $("#pn-date-from").value = ""; $("#pn-date-to").value = "";
      applyFeedbackFilters();
    });

    // Abrir modal desde el detalle
    $("#pn-detail-add-feedback").addEventListener("click", function () {
      openFeedbackModal(state.currentCompany ? state.currentCompany.slug : null);
    });

    // --- Las tres descargas: Word, PDF y archivos ---
    // Con el muro puesto ninguna descarga: el boton enseña el candado,
    // barre la luz y sale el cartel. Con DESCARGAS_ABIERTAS = true este
    // mismo codigo descarga, sin tocar nada mas.
    [
      ["#pn-detail-download",       downloadFeedbacksDocx],
      ["#pn-detail-download-pdf",   downloadFeedbacksPdf],
      ["#pn-detail-download-files", downloadFeedbacksFiles]
    ].forEach(function (par) {
      var btn = $(par[0]);
      if (!btn) return;                       // el boton puede no existir aun
      btn.addEventListener("click", function () {
        if (!DESCARGAS_ABIERTAS) { avisarBloqueado(btn); return; }
        par[1]();
      });
    });

    // Muro: cerrar
    $$("[data-close-lock]").forEach(function (el) {
      el.addEventListener("click", cerrarMuro);
    });

    // Modal: cerrar
    $$("[data-close-modal]").forEach(function (el) {
      el.addEventListener("click", function () {
        closeFeedbackModal();
        // Si el éxito está visible, refrescamos detalle (por si admin aprobó)
      });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (!$("#pn-feedback-modal").hidden) { closeFeedbackModal(); return; }
      var muro = $("#pn-lock-modal");
      if (muro && !muro.hidden) cerrarMuro();
    });

    // Form
    $("#pn-add-aircraft").addEventListener("click", function () { addAircraftBlock(); });
    $("#pn-files-preview").addEventListener("click", onPreviewClick);
    $("#pn-f-text").addEventListener("input", function (e) {
      $("#pn-f-text-count").textContent = String(e.target.value.length);
    });
    $("#pn-feedback-form").addEventListener("submit", onSubmit);

    // Anónimo: bloquea/desbloquea campo nombre
    var anonChk = $("#pn-f-anon");
    var nameInp = $("#pn-f-name");
    if (anonChk && nameInp) {
      anonChk.addEventListener("change", function() {
        var anonLabel = (window.pnCurrentLang === 'en') ? 'Anonymous' : 'Anónimo';
        if (this.checked) {
          nameInp.value = anonLabel;
          nameInp.disabled = true;
          nameInp.style.opacity = "0.4";
          nameInp.removeAttribute("required");
        } else {
          nameInp.value = "";
          nameInp.disabled = false;
          nameInp.style.opacity = "1";
          nameInp.setAttribute("required", "required");
          nameInp.focus();
        }
      });
    }

    // Hash
    window.addEventListener("hashchange", readHash);
  }

  // ===================================================================
  // INIT
  // ===================================================================
  async function init() {
    setupDropzone();
    bindEvents();
    // Expone el re-render al sistema i18n del index.html
    window._pnRerender = function() {
      applyCompanyFilters();      // re-renderiza cards con nuevo idioma
      fillCompanySelect();        // re-renderiza placeholder del select de compañía
      if (state.currentCompany) applyFeedbackFilters(); // re-renderiza feedbacks si estamos en el detalle
    };
    await loadCompanies();
    // Aplicar idioma inicial una vez cargado todo
    if (typeof window.pnSetLang === 'function') {
      window.pnSetLang(window.pnCurrentLang || 'en');
    }
    if (state._pendingSlug) {
      var slug = state._pendingSlug;
      state._pendingSlug = null;
      openCompany(slug);
    } else {
      readHash();
    }
    sendHeight();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
