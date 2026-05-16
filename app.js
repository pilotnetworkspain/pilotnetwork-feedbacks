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

  // Logo (Clearbit → Google favicon → placeholder SVG)
  function logoSrc(company) {
    if (company.logo_url && company.logo_url.trim()) return company.logo_url;
    var domain = (company.fallback_domain || "").trim();
    if (domain) {
      return "https://logo.clearbit.com/" + domain;
    }
    return placeholderLogo(company.name);
  }

  // Si Clearbit falla, intenta Google favicon, luego placeholder
  function logoError(img, company) {
    var domain = (company.fallback_domain || "").trim();
    if (img.dataset.logoAttempt === "clearbit" && domain) {
      img.dataset.logoAttempt = "favicon";
      img.src = "https://www.google.com/s2/favicons?domain=" + encodeURIComponent(domain) + "&sz=128";
    } else {
      img.onerror = null;
      img.src = placeholderLogo(company.name);
    }
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
  };
  function t(key) {
    var lang = window.pnCurrentLang || 'es';
    var entry = UI_TEXTS[key];
    if (!entry) return key;
    return entry[lang] || entry['es'];
  }

  // Flag para pausar sendHeight cuando el modal está abierto
  var modalIsOpen = false;

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
      var url = cfg.SUPABASE_URL + "/rest/v1/companies_public?select=*&order=sort_order.asc,name.asc";
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
            '<img loading="lazy" src="'+escapeHtml(src)+'" alt="'+escapeHtml(c.name)+'" data-logo-attempt="clearbit" '+
            'onerror="(function(img){var d=\''+escapeHtml(c.fallback_domain||'')+'\';if(img.dataset.logoAttempt===\'clearbit\'&&d){img.dataset.logoAttempt=\'favicon\';img.src=\'https://www.google.com/s2/favicons?domain=\'+encodeURIComponent(d)+\'&sz=128\';}else{img.onerror=null;img.src=\''+placeholderLogo(c.name).replace(/'/g,"\\'").replace(/"/g,'&quot;')+'\';}})(this)" />'+
            '<div class="pn-feedback-card-brand-text">'+
              '<h3>'+escapeHtml(c.name)+'</h3>'+
              '<p>'+escapeHtml(c.company_type || getCatLabel(c.category))+'</p>'+
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
    function notifyParent() {
      try {
        window.parent.postMessage({ type: "pn-feedback-scroll-top" }, "*");
      } catch(e) {}
    }
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
    scrollToTop();
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
    $("#pn-detail-subtitle").textContent = (company.company_type || getCatLabel(company.category) || "") +
      (company.feedback_count != null ? "  ·  " + company.feedback_count + " feedback" + (company.feedback_count===1?"":"s") : "");
    $("#pn-detail-description").textContent = company.description || "";

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
    cont.innerHTML = state.feedbacksFiltered.map(function (f) {
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
        ? '<div class="pn-feedback-item-block">'+
            '<h4>'+escapeHtml(t('attachments'))+'</h4>'+
            '<ul class="pn-feedback-files-list">'+
              f.files.map(function (file) {
                var baseUrl = window.PN_SUPABASE_CONFIG.SUPABASE_URL + '/storage/v1/object/public/';
                var url = baseUrl + (file.storage_bucket || "feedback-files") + '/' + encodeURIComponent(file.file_path);
                return '<li><a href="'+escapeHtml(url)+'" target="_blank" rel="noopener noreferrer">'+
                  '📎 '+escapeHtml(file.file_name)+
                  (file.file_size ? ' <span style="color:#9da8ba">('+formatBytes(file.file_size)+')</span>' : '')+
                '</a></li>';
              }).join("")+
            '</ul>'+
          '</div>'
        : "";

      return '<article class="pn-feedback-item">'+
        '<div class="pn-feedback-item-head">'+
          '<div class="pn-feedback-item-meta">'+
            '<span class="pn-feedback-pill" data-pos="'+escapeHtml(f.position)+'">'+escapeHtml(getPosLabel(f.position))+'</span>'+
            (f.total_flight_hours != null ? '<span class="pn-feedback-pill">'+f.total_flight_hours+' '+escapeHtml(t('total-hours'))+'</span>' : '')+
            '<span class="pn-feedback-pill">'+escapeHtml(dateLabel)+'</span>'+
          '</div>'+
          '<div>'+
            '<div class="pn-feedback-item-author">'+escapeHtml(f.member_name || t('anonymous'))+'</div>'+
            '<div class="pn-feedback-item-date">'+escapeHtml(t('published-on'))+' '+formatDate(f.created_at.slice(0,10))+'</div>'+
          '</div>'+
        '</div>'+
        (f.flight_experience_summary
          ? '<div class="pn-feedback-item-block"><h4>'+escapeHtml(t('experience'))+'</h4><div class="pn-feedback-item-body">'+escapeHtml(f.flight_experience_summary)+'</div></div>'
          : '')+
        '<div class="pn-feedback-item-block"><h4>'+escapeHtml(t('feedback-section'))+'</h4><div class="pn-feedback-item-body">'+escapeHtml(f.feedback_text)+'</div></div>'+
        aircraftHtml+
        filesHtml+
      '</article>';
    }).join("");
    sendHeight();
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
    modalIsOpen = true; // bloquea sendHeight durante apertura
    resetFeedbackForm();
    if (slug) {
      var c = state.companies.find(function (x) { return x.slug === slug; });
      if (c) $("#pn-f-company").value = c.id;
    }
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    // NO ponemos overflow:hidden en body — dentro del iframe rompe el scroll del padre
    // Avisa al padre: él nos devolverá su scroll actual para centrar la card
    try {
      window.parent.postMessage({ type: "pn-feedback-modal-open" }, "*");
    } catch(e) {}
    // Fallback: si el padre no responde (Webador filtra scripts),
    // ponemos la card al principio del documento
    setTimeout(function() {
      var card = document.querySelector(".pn-feedback-modal-card");
      if (card && parseInt(card.style.marginTop) <= 16) {
        positionModalCard(0);
      }
    }, 300);
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

    var collected = collectFormData();
    var errors = validate(collected);
    if (errors.length) {
      setFormStatus(errors[0], "error");
      sendHeight();
      return;
    }

    setFormStatus("Enviando…", "info");
    btn.disabled = true;
    label.textContent = "Enviando…";
    spin.hidden = false;

    try {
      var cfg = window.PN_SUPABASE_CONFIG;
      var feedbackId = generateUUID();
      collected.feedback.id = feedbackId;

      // 1) Insert feedback
      var url = cfg.SUPABASE_URL + "/rest/v1/feedbacks";
      var fbResp = await fetch(url, {
        method: "POST",
        headers: {
          'apikey': cfg.SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + cfg.SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(collected.feedback)
      });

      if (!fbResp.ok) {
        var err = await fbResp.json();
        throw new Error(err.message || "Error al insertar feedback");
      }

      // 2) Insert aircraft_hours
      if (collected.aircraft.length) {
        var rows = collected.aircraft.map(function (a) {
          return Object.assign({ feedback_id: feedbackId }, a);
        });
        var ahUrl = cfg.SUPABASE_URL + "/rest/v1/aircraft_hours";
        var ahResp = await fetch(ahUrl, {
          method: "POST",
          headers: {
            'apikey': cfg.SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + cfg.SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(rows)
        });
        if (!ahResp.ok) {
          var ahErr = await ahResp.json();
          throw new Error(ahErr.message || "Error al insertar aircraft_hours");
        }
      }

      // 3) Éxito
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
    // Dejamos 20px de margen desde el borde visible
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

    // Modal: cerrar
    $$("[data-close-modal]").forEach(function (el) {
      el.addEventListener("click", function () {
        closeFeedbackModal();
        // Si el éxito está visible, refrescamos detalle (por si admin aprobó)
      });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !$("#pn-feedback-modal").hidden) closeFeedbackModal();
    });

    // Form
    $("#pn-add-aircraft").addEventListener("click", function () { addAircraftBlock(); });
    $("#pn-files-preview").addEventListener("click", onPreviewClick);
    $("#pn-f-text").addEventListener("input", function (e) {
      $("#pn-f-text-count").textContent = String(e.target.value.length);
    });
    $("#pn-feedback-form").addEventListener("submit", onSubmit);

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
