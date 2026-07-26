/* ─────────────────────────────────────────────────────────────────
   MakeMyCV — Frontend SPA
   Two entry flows:
     • Upload   → upload → details (guided free-text + quick-add) → template → payment → generating → download
     • Scratch  → form (6 steps) → template → payment → generating → download
───────────────────────────────────────────────────────────────── */

const API_BASE = '';  // same origin — Vercel serves frontend + API together

const STEPS = [
  { id: 'personal',  label: 'Personal'  },
  { id: 'summary',   label: 'Summary'   },
  { id: 'experience',label: 'Experience'},
  { id: 'education', label: 'Education' },
  { id: 'skills',    label: 'Skills'    },
  { id: 'extras',    label: 'Extras'    },
];

// Fields shown per guided quick-add type on the details screen — only the
// fields relevant to that type are ever shown, not a full form.
const GUIDED_FIELDS = {
  experience: [
    { key: 'title',   label: 'Job Title',    placeholder: 'Facilities Manager' },
    { key: 'company', label: 'Company',      placeholder: 'Company Name' },
    { key: 'start',   label: 'Start Date',   placeholder: 'Jan 2024' },
    { key: 'end',     label: 'End Date',     placeholder: 'Present' },
    { key: 'bullet',  label: 'What did you do?', placeholder: 'Managed a portfolio of 20+ units…' },
  ],
  education: [
    { key: 'institution', label: 'Institution',           placeholder: 'University / College' },
    { key: 'degree',      label: 'Degree / Qualification', placeholder: 'MBA' },
    { key: 'year',        label: 'Year',                   placeholder: '2024' },
  ],
  certification: [
    { key: 'name', label: 'Certification / Skill', placeholder: 'NEBOSH IGC' },
  ],
  project: [
    { key: 'description', label: 'Project / Award', placeholder: 'Led a heritage building retrofit — full MEP overhaul' },
  ],
};
const GUIDED_LABELS = { experience: 'Experience', education: 'Education', certification: 'Certification / Skill', project: 'Project / Award' };
const GUIDED_PAYLOAD_KEY = { experience: 'experience', education: 'education', certification: 'certifications', project: 'projects' };

// Zoho CRM Web-to-Lead — MakeMyCV_webform. These hidden tokens are the ones
// Zoho embeds in any public webform snippet (not secrets — same values
// anyone using this form on a real page would ship in their HTML).
// Submitted straight from the browser to Zoho, same as Zoho's own reference
// implementation — their endpoint is built to accept cross-origin form posts.
const ZOHO_WEBFORM = {
  url: 'https://crm.zoho.com/crm/WebToLeadForm',
  xnQsjsdp: '6da38ce683090586cee3d83e86eaf823064e7c7d1c9da3161d03f05e28c7654b',
  xmIwtLD: '5e049436889b0e76806e9fe4235bb7baa8a313db17b19c1746af2ce56b9c94a76ad1d2350bf95fff1f2acb967f233a2e',
  actionType: 'TGVhZHM=',
};

const App = (() => {
  // ── State ──────────────────────────────────────────────────────
  let currentStep = 0;
  let selectedTemplate = 'executive';
  let sessionId = null;
  let fileId = null;
  let flowMode = 'scratch'; // 'scratch' | 'upload'
  let cvData = {
    personal: {},
    summary: '',
    experience: [],
    education: [],
    skills: { technical: [], soft: [], languages: [], certifications: [] },
    extras: { awards: [], projects: [], volunteer: [], publications: [] },
  };

  // Upload-flow state
  let uploadFileData = null;   // { filename, type, data(base64) } — set once file is read
  let detailsName = '';
  let detailsEmail = '';
  let detailsPhone = '';
  let detailsNotes = '';
  let guidedAdds = [];         // [{ id, type, values:{} }]
  let guidedSeq = 0;
  let currentStage = '';       // tracked client-side, no network call — used by sendFinalLead()
  let leadFinalized = false;   // guards against double-send (completed vs abandoned)

  // Tags state keyed by field id
  const tagState = {};

  // ── Analytics ──────────────────────────────────────────────────
  // Fires GA4 events for every screen transition (funnel/drop-off tracking)
  // plus explicit milestone events. Safe no-op if gtag hasn't loaded.
  function trackEvent(name, params = {}) {
    try {
      window.dataLayer = window.dataLayer || [];
      if (typeof window.gtag === 'function') {
        window.gtag('event', name, params);
      } else {
        window.dataLayer.push({ event: name, ...params });
      }
    } catch (_) {}
  }

  // ── Screen management ──────────────────────────────────────────
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    window.scrollTo(0, 0);
    trackEvent('screen_view', { screen_name: id, flow_mode: flowMode });
  }

  function showLanding() { showScreen('screen-landing'); }

  function startFlow(mode) {
    flowMode = 'scratch';
    sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    loadDraft();
    currentStep = 0;
    showScreen('screen-form');
    renderStep();
  }

  // ── Progress bar ───────────────────────────────────────────────
  function updateProgress() {
    const pct = ((currentStep + 1) / STEPS.length) * 100;
    document.getElementById('progress-bar').style.width = pct + '%';

    const container = document.getElementById('progress-steps');
    container.innerHTML = STEPS.map((s, i) => {
      const cls = i < currentStep ? 'ps-step done' : i === currentStep ? 'ps-step active' : 'ps-step';
      return `<span class="${cls}" onclick="App.goToStep(${i})">${s.label}</span>`;
    }).join('');

    document.getElementById('btn-prev').style.visibility = currentStep === 0 ? 'hidden' : 'visible';
    document.getElementById('btn-next').textContent = currentStep === STEPS.length - 1 ? 'Choose Template →' : 'Continue →';
  }

  // ── Step rendering ─────────────────────────────────────────────
  function renderStep() {
    updateProgress();
    const body = document.getElementById('form-body');
    body.innerHTML = '';

    switch (STEPS[currentStep].id) {
      case 'personal':    renderPersonal(body); break;
      case 'summary':     renderSummary(body); break;
      case 'experience':  renderExperience(body); break;
      case 'education':   renderEducation(body); break;
      case 'skills':      renderSkills(body); break;
      case 'extras':      renderExtras(body); break;
    }
  }

  // ── Step: Personal Info ────────────────────────────────────────
  function renderPersonal(body) {
    const p = cvData.personal;
    body.innerHTML = `
      <h2 class="step-title-main">Personal Information</h2>
      <p class="step-subtitle">Your contact details go at the top of your CV.</p>
      <div class="form-row">
        <div class="field-group">
          <label class="field-label">Full Name <span class="req">*</span></label>
          <input class="form-input" id="p-name" placeholder="Raneesh Raveendran" value="${esc(p.name||'')}" />
        </div>
        <div class="field-group">
          <label class="field-label">Professional Title <span class="req">*</span></label>
          <input class="form-input" id="p-title" placeholder="Facilities Manager" value="${esc(p.title||'')}" />
        </div>
      </div>
      <div class="form-row">
        <div class="field-group">
          <label class="field-label">Email <span class="req">*</span></label>
          <input class="form-input" id="p-email" type="email" placeholder="you@email.com" value="${esc(p.email||'')}" />
        </div>
        <div class="field-group">
          <label class="field-label">Phone <span class="req">*</span></label>
          <input class="form-input" id="p-phone" placeholder="+971 50 123 4567" value="${esc(p.phone||'')}" />
        </div>
      </div>
      <div class="field-group">
        <label class="field-label">Location</label>
        <input class="form-input" id="p-location" placeholder="Dubai, UAE" value="${esc(p.location||'')}" />
      </div>
      <div class="form-row">
        <div class="field-group">
          <label class="field-label">LinkedIn URL</label>
          <input class="form-input" id="p-linkedin" placeholder="linkedin.com/in/yourname" value="${esc(p.linkedin||'')}" />
        </div>
        <div class="field-group">
          <label class="field-label">Portfolio / Website</label>
          <input class="form-input" id="p-portfolio" placeholder="yoursite.com" value="${esc(p.portfolio||'')}" />
        </div>
      </div>`;
  }

  function collectPersonal() {
    cvData.personal = {
      name:      val('p-name'),
      title:     val('p-title'),
      email:     val('p-email'),
      phone:     val('p-phone'),
      location:  val('p-location'),
      linkedin:  val('p-linkedin'),
      portfolio: val('p-portfolio'),
    };
    if (!cvData.personal.name || !cvData.personal.email) {
      return 'Please enter your full name and email.';
    }
    return null;
  }

  // ── Step: Summary ──────────────────────────────────────────────
  function renderSummary(body) {
    body.innerHTML = `
      <h2 class="step-title-main">Professional Summary</h2>
      <p class="step-subtitle">3–4 sentences about your career, key skills, and what you bring to a role. Our AI will enhance this.</p>
      <div class="field-group">
        <label class="field-label">Your Summary <span class="req">*</span></label>
        <textarea class="form-textarea" id="s-summary" rows="5" placeholder="Experienced Facilities Manager with 8+ years across commercial and residential properties in the UAE…">${esc(cvData.summary||'')}</textarea>
        <div class="field-hint">Write in first or third person — AI will standardise the tone.</div>
      </div>`;
  }

  function collectSummary() {
    cvData.summary = val('s-summary');
    if (!cvData.summary) return 'Please write a short summary.';
    return null;
  }

  // ── Step: Experience ───────────────────────────────────────────
  function renderExperience(body) {
    if (!cvData.experience.length) {
      cvData.experience = [blankJob()];
    }
    body.innerHTML = `
      <h2 class="step-title-main">Work Experience</h2>
      <p class="step-subtitle">Add your roles, most recent first. AI will enhance your bullet points.</p>
      <div id="exp-blocks"></div>
      <button class="btn-add-block" onclick="App.addJob()">+ Add Another Role</button>`;
    renderExpBlocks();
  }

  function blankJob() { return { company:'', title:'', start:'', end:'', current:false, bullets:['',''] }; }

  function renderExpBlocks() {
    const container = document.getElementById('exp-blocks');
    if (!container) return;
    container.innerHTML = cvData.experience.map((job, i) => `
      <div class="repeat-block" id="job-${i}">
        <div class="repeat-block-header">
          <span class="repeat-block-title">Role ${i+1}</span>
          ${i > 0 ? `<button class="btn-remove-block" onclick="App.removeJob(${i})">×</button>` : ''}
        </div>
        <div class="form-row">
          <div class="field-group">
            <label class="field-label">Job Title <span class="req">*</span></label>
            <input class="form-input" id="job-title-${i}" placeholder="Facilities Manager" value="${esc(job.title||'')}" />
          </div>
          <div class="field-group">
            <label class="field-label">Company <span class="req">*</span></label>
            <input class="form-input" id="job-company-${i}" placeholder="Company Name" value="${esc(job.company||'')}" />
          </div>
        </div>
        <div class="form-row">
          <div class="field-group">
            <label class="field-label">Start Date</label>
            <input class="form-input" id="job-start-${i}" placeholder="Jan 2020" value="${esc(job.start||'')}" />
          </div>
          <div class="field-group">
            <label class="field-label">End Date</label>
            <input class="form-input" id="job-end-${i}" placeholder="Mar 2024" value="${esc(job.end||'')}" ${job.current ? 'disabled' : ''} />
          </div>
        </div>
        <label class="current-toggle">
          <input type="checkbox" id="job-current-${i}" ${job.current ? 'checked' : ''} onchange="App.toggleCurrent(${i})" />
          I currently work here
        </label>
        <div style="margin-top:14px;">
          <label class="field-label">Key Responsibilities / Achievements</label>
          ${job.bullets.map((b, bi) => `
            <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center;">
              <input class="form-input" id="job-bullet-${i}-${bi}" placeholder="Managed a portfolio of ${20+bi*5}+ units…" value="${esc(b||'')}" />
              ${job.bullets.length > 1 ? `<button class="btn-remove-block" style="flex-shrink:0;" onclick="App.removeBullet(${i},${bi})">×</button>` : ''}
            </div>`).join('')}
          <button class="btn-add-block" style="margin-top:4px;" onclick="App.addBullet(${i})">+ Add bullet</button>
        </div>
      </div>`).join('');
  }

  function collectExperience() {
    cvData.experience = cvData.experience.map((_, i) => {
      const bullets = [];
      let bi = 0;
      while (document.getElementById(`job-bullet-${i}-${bi}`) !== null) {
        const v = val(`job-bullet-${i}-${bi}`);
        if (v) bullets.push(v);
        bi++;
      }
      return {
        title:   val(`job-title-${i}`),
        company: val(`job-company-${i}`),
        start:   val(`job-start-${i}`),
        end:     val(`job-end-${i}`),
        current: document.getElementById(`job-current-${i}`)?.checked || false,
        bullets,
      };
    });
    if (cvData.experience[0] && !cvData.experience[0].title) return 'Please enter at least one job title.';
    return null;
  }

  function addJob() { collectExperience(); cvData.experience.push(blankJob()); renderExpBlocks(); }
  function removeJob(i) { collectExperience(); cvData.experience.splice(i, 1); renderExpBlocks(); }
  function addBullet(i) { collectExperience(); cvData.experience[i].bullets.push(''); renderExpBlocks(); }
  function removeBullet(i, bi) { collectExperience(); cvData.experience[i].bullets.splice(bi, 1); renderExpBlocks(); }
  function toggleCurrent(i) {
    const checked = document.getElementById(`job-current-${i}`).checked;
    cvData.experience[i].current = checked;
    const endField = document.getElementById(`job-end-${i}`);
    if (endField) endField.disabled = checked;
  }

  // ── Step: Education ────────────────────────────────────────────
  function renderEducation(body) {
    if (!cvData.education.length) cvData.education = [blankEdu()];
    body.innerHTML = `
      <h2 class="step-title-main">Education</h2>
      <p class="step-subtitle">Add your degrees and qualifications.</p>
      <div id="edu-blocks"></div>
      <button class="btn-add-block" onclick="App.addEdu()">+ Add Another Qualification</button>`;
    renderEduBlocks();
  }

  function blankEdu() { return { institution:'', degree:'', year:'', grade:'' }; }

  function renderEduBlocks() {
    const container = document.getElementById('edu-blocks');
    if (!container) return;
    container.innerHTML = cvData.education.map((e, i) => `
      <div class="repeat-block" id="edu-${i}">
        <div class="repeat-block-header">
          <span class="repeat-block-title">Qualification ${i+1}</span>
          ${i > 0 ? `<button class="btn-remove-block" onclick="App.removeEdu(${i})">×</button>` : ''}
        </div>
        <div class="field-group">
          <label class="field-label">Institution <span class="req">*</span></label>
          <input class="form-input" id="edu-inst-${i}" placeholder="University / College / School" value="${esc(e.institution||'')}" />
        </div>
        <div class="form-row">
          <div class="field-group">
            <label class="field-label">Degree / Qualification</label>
            <input class="form-input" id="edu-deg-${i}" placeholder="B.Tech in Mechanical Engineering" value="${esc(e.degree||'')}" />
          </div>
          <div class="field-group">
            <label class="field-label">Year</label>
            <input class="form-input" id="edu-year-${i}" placeholder="2018" value="${esc(e.year||'')}" />
          </div>
        </div>
        <div class="field-group">
          <label class="field-label">Grade / CGPA (optional)</label>
          <input class="form-input" id="edu-grade-${i}" placeholder="8.2 CGPA or First Class" value="${esc(e.grade||'')}" />
        </div>
      </div>`).join('');
  }

  function collectEducation() {
    cvData.education = cvData.education.map((_, i) => ({
      institution: val(`edu-inst-${i}`),
      degree:      val(`edu-deg-${i}`),
      year:        val(`edu-year-${i}`),
      grade:       val(`edu-grade-${i}`),
    }));
    return null;
  }

  function addEdu() { collectEducation(); cvData.education.push(blankEdu()); renderEduBlocks(); }
  function removeEdu(i) { collectEducation(); cvData.education.splice(i, 1); renderEduBlocks(); }

  // ── Step: Skills ───────────────────────────────────────────────
  function renderSkills(body) {
    body.innerHTML = `
      <h2 class="step-title-main">Skills</h2>
      <p class="step-subtitle">Type a skill and press Enter or comma to add it.</p>
      ${renderTagsField('Technical Skills', 'sk-technical', cvData.skills.technical, 'AutoCAD, CAFM, BMS, HVAC, MS Project…')}
      ${renderTagsField('Soft Skills', 'sk-soft', cvData.skills.soft, 'Leadership, Vendor Management, Budgeting…')}
      ${renderTagsField('Languages', 'sk-languages', cvData.skills.languages, 'English, Arabic, Hindi…')}
      ${renderTagsField('Certifications', 'sk-certifications', cvData.skills.certifications, 'NEBOSH IGC, PMP, RERA Certified…')}`;

    // Init tag inputs after render
    ['technical','soft','languages','certifications'].forEach(cat => {
      initTagInput(`sk-${cat}`, cvData.skills[cat]);
    });
  }

  function renderTagsField(label, id, tags, placeholder) {
    return `
      <div class="field-group">
        <label class="field-label">${label}</label>
        <div class="tags-input-wrap" id="wrap-${id}" onclick="document.getElementById('input-${id}').focus()">
          <span id="tags-${id}"></span>
          <input class="tags-input" id="input-${id}" placeholder="${placeholder}" />
        </div>
      </div>`;
  }

  function initTagInput(id, initialTags) {
    tagState[id] = [...(initialTags || [])];
    renderTags(id);
    const input = document.getElementById(`input-${id}`);
    if (!input) return;
    input.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) {
        e.preventDefault();
        const v = input.value.replace(/,$/, '').trim();
        if (v && !tagState[id].includes(v)) { tagState[id].push(v); renderTags(id); }
        input.value = '';
      } else if (e.key === 'Backspace' && !input.value && tagState[id].length) {
        tagState[id].pop(); renderTags(id);
      }
    });
  }

  function renderTags(id) {
    const container = document.getElementById(`tags-${id}`);
    if (!container) return;
    container.innerHTML = tagState[id].map((t, i) =>
      `<span class="tag-chip">${esc(t)}<span class="tag-chip-remove" onclick="App.removeTag('${id}',${i})">×</span></span>`
    ).join('');
  }

  function removeTag(id, i) { tagState[id].splice(i, 1); renderTags(id); }

  function collectSkills() {
    cvData.skills = {
      technical:      [...(tagState['sk-technical']     || [])],
      soft:           [...(tagState['sk-soft']          || [])],
      languages:      [...(tagState['sk-languages']     || [])],
      certifications: [...(tagState['sk-certifications']|| [])],
    };
    return null;
  }

  // ── Step: Extras ───────────────────────────────────────────────
  function renderExtras(body) {
    const ex = cvData.extras;
    body.innerHTML = `
      <h2 class="step-title-main">Additional Sections</h2>
      <p class="step-subtitle">Optional — add awards, projects, or volunteer work if relevant. Skip if not needed.</p>
      <div class="field-group">
        <label class="field-label">Awards & Achievements</label>
        <textarea class="form-textarea" id="ex-awards" rows="3" placeholder="Best FM Team of the Year — JLL, 2023">${esc((ex.awards||[]).join('\n'))}</textarea>
        <div class="field-hint">One per line</div>
      </div>
      <div class="field-group">
        <label class="field-label">Projects</label>
        <textarea class="form-textarea" id="ex-projects" rows="3" placeholder="Heritage Building Retrofit — Led full MEP overhaul of a 60-year-old structure">${esc((ex.projects||[]).join('\n'))}</textarea>
        <div class="field-hint">One per line</div>
      </div>
      <div class="field-group">
        <label class="field-label">Volunteer Work</label>
        <textarea class="form-textarea" id="ex-volunteer" rows="2" placeholder="Community FM Advisor — Dubai Expats Forum, 2022">${esc((ex.volunteer||[]).join('\n'))}</textarea>
        <div class="field-hint">One per line</div>
      </div>`;
  }

  function collectExtras() {
    cvData.extras = {
      awards:    splitLines(val('ex-awards')),
      projects:  splitLines(val('ex-projects')),
      volunteer: splitLines(val('ex-volunteer')),
      publications: [],
    };
    return null;
  }

  // ── Step navigation (scratch flow) ─────────────────────────────
  const collectors = {
    personal:   collectPersonal,
    summary:    collectSummary,
    experience: collectExperience,
    education:  collectEducation,
    skills:     collectSkills,
    extras:     collectExtras,
  };

  function nextStep() {
    const stepId = STEPS[currentStep].id;
    const err = collectors[stepId]?.();
    if (err) { showToast(err, 'error'); return; }
    saveDraft();

    if (currentStep === STEPS.length - 1) {
      showScreen('screen-template');
      return;
    }
    currentStep++;
    renderStep();
    window.scrollTo(0, 0);
  }

  function prevStep() {
    if (currentStep === 0) return;
    currentStep--;
    renderStep();
    window.scrollTo(0, 0);
  }

  function goToStep(i) {
    if (i >= 0 && i < STEPS.length) {
      currentStep = i;
      renderStep();
    }
  }

  // ── Details screen (upload flow) ───────────────────────────────
  function renderGuidedBlocks() {
    const container = document.getElementById('guided-blocks');
    if (!container) return;
    container.innerHTML = guidedAdds.map(block => `
      <div class="repeat-block" id="guided-${block.id}">
        <div class="repeat-block-header">
          <span class="repeat-block-title">${GUIDED_LABELS[block.type]}</span>
          <button class="btn-remove-block" onclick="App.removeGuided(${block.id})">×</button>
        </div>
        ${GUIDED_FIELDS[block.type].map(f => `
          <div class="field-group">
            <label class="field-label">${f.label}</label>
            <input class="form-input" id="guided-${block.id}-${f.key}" placeholder="${f.placeholder}" value="${esc(block.values[f.key]||'')}" />
          </div>`).join('')}
      </div>`).join('');
  }

  function addGuided(type) {
    guidedSeq++;
    guidedAdds.push({ id: guidedSeq, type, values: {} });
    renderGuidedBlocks();
    trackEvent('guided_add_used', { add_type: type });
  }

  function removeGuided(id) {
    collectGuided();
    guidedAdds = guidedAdds.filter(b => b.id !== id);
    renderGuidedBlocks();
  }

  function collectGuided() {
    guidedAdds.forEach(block => {
      GUIDED_FIELDS[block.type].forEach(f => {
        block.values[f.key] = val(`guided-${block.id}-${f.key}`);
      });
    });
  }

  function buildGuidedPayload() {
    collectGuided();
    const payload = { experience: [], education: [], certifications: [], projects: [] };
    guidedAdds.forEach(block => {
      const key = GUIDED_PAYLOAD_KEY[block.type];
      payload[key].push(block.values);
    });
    return payload;
  }

  function detailsContinue() {
    detailsName  = val('d-name');
    detailsEmail = val('d-email');
    detailsPhone = val('d-phone');
    detailsNotes = val('d-notes');
    collectGuided();

    if (!detailsName) {
      showToast('Please enter your full name.', 'error');
      return;
    }
    if (!detailsEmail || !detailsEmail.includes('@')) {
      showToast('Please enter a valid email address.', 'error');
      return;
    }
    if (!detailsPhone) {
      showToast('Please enter a phone number.', 'error');
      return;
    }

    pushLead('details_submitted');
    trackEvent('lead_captured');
    trackEvent('details_submitted', { has_notes: !!detailsNotes, guided_add_count: guidedAdds.length });

    showScreen('screen-template');
  }

  /**
   * Checkpoint ping — updates our own Supabase record so we always have
   * the furthest stage on file, but does NOT push to Zoho. Zoho only
   * gets ONE submission per person (see sendFinalLead) — Zoho's Free-plan
   * dedup check flags repeat submissions from the same email as manual-
   * approval duplicates, so we deliberately don't hit it more than once.
   */
  function pushLead(stage) {
    currentStage = stage;
    if (!detailsEmail) return; // upload-flow only — scratch flow has no lead capture point yet
    fetch(`${API_BASE}/api/lead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId, stage, final: false,
        name: detailsName, email: detailsEmail, phone: detailsPhone, notes: detailsNotes,
        template: selectedTemplate,
      }),
      keepalive: true,
    }).catch(() => {});
  }

  const STAGE_LABELS = {
    details_submitted:  'Left at: Details Submitted',
    template_selected:  'Left at: Template Selected',
    payment_initiated:  'Left at: Payment Initiated (did not complete)',
    payment_completed:  'Completed',
  };

  /**
   * The ONE submission that reaches Zoho — fired either:
   *   • immediately on payment_completed ("Completed"), or
   *   • via sendBeacon the moment the tab is hidden/closed before that,
   *     carrying whatever the last-known stage was.
   * sendBeacon (not fetch) because it's specifically designed to survive
   * the page unloading — fetch(keepalive) is not reliably delivered on
   * tab close in every browser. Posts straight to Zoho's Web-to-Lead
   * endpoint from the browser (matches Zoho's own reference snippet),
   * plus a copy to our own /api/lead so Supabase has the same final record.
   */
  function sendFinalLead(stage) {
    if (!detailsEmail || leadFinalized) return;
    leadFinalized = true;

    // — Zoho —
    const fd = new FormData();
    fd.append('xnQsjsdp', ZOHO_WEBFORM.xnQsjsdp);
    fd.append('zc_gad', '');
    fd.append('xmIwtLD', ZOHO_WEBFORM.xmIwtLD);
    fd.append('actionType', ZOHO_WEBFORM.actionType);
    fd.append('returnURL', 'null');
    fd.append('aG9uZXlwb3Q', ''); // honeypot — must stay empty
    fd.append('Company', 'Make My CV — Individual Lead'); // required field; we don't collect a real company
    fd.append('Last Name', detailsName || 'Unknown');
    fd.append('Email', detailsEmail);
    fd.append('Phone', detailsPhone);
    fd.append('Description', [
      'Make My CV — Website Lead',
      `Stage: ${STAGE_LABELS[stage] || stage}`,
      `Template: ${selectedTemplate}`,
      detailsNotes ? `Notes: ${detailsNotes}` : null,
      `Session: ${sessionId}`,
    ].filter(Boolean).join('\n'));

    if (navigator.sendBeacon) {
      navigator.sendBeacon(ZOHO_WEBFORM.url, fd);
    } else {
      fetch(ZOHO_WEBFORM.url, { method: 'POST', body: fd, mode: 'no-cors', keepalive: true }).catch(() => {});
    }

    // — Supabase (own record, same final stage) —
    const payload = JSON.stringify({
      sessionId, stage, final: true,
      name: detailsName, email: detailsEmail, phone: detailsPhone, notes: detailsNotes,
      template: selectedTemplate,
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(`${API_BASE}/api/lead`, new Blob([payload], { type: 'application/json' }));
    } else {
      fetch(`${API_BASE}/api/lead`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true,
      }).catch(() => {});
    }
  }

  // Catches abandonment at any point after details are captured — fires
  // sendFinalLead with whatever stage was last reached. No-ops once
  // leadFinalized is true (i.e. payment already completed).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sendFinalLead(currentStage || 'details_submitted');
  });
  window.addEventListener('pagehide', () => {
    sendFinalLead(currentStage || 'details_submitted');
  });

  // ── Template selection ─────────────────────────────────────────
  function selectTemplate(name) {
    selectedTemplate = name;
    document.querySelectorAll('.tpick').forEach(el => el.classList.remove('selected'));
    document.querySelector(`[data-template="${name}"]`)?.classList.add('selected');
    trackEvent('template_selected', { template: name });
  }

  function proceedToPayment() {
    if (!selectedTemplate) { showToast('Please select a template.', 'error'); return; }
    document.getElementById('payment-template-name').textContent =
      selectedTemplate.charAt(0).toUpperCase() + selectedTemplate.slice(1);
    pushLead('template_selected');
    showScreen('screen-payment');
  }

  // ── Payment ────────────────────────────────────────────────────
  async function initiatePayment() {
    const btn = document.getElementById('btn-pay');
    btn.disabled = true;
    btn.textContent = 'Creating order…';
    trackEvent('payment_initiated', { template: selectedTemplate, flow_mode: flowMode });
    pushLead('payment_initiated');

    try {
      const res = await fetch(`${API_BASE}/api/payment/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const order = await res.json();
      if (!res.ok) throw new Error(order.error || 'Payment init failed');

      const options = {
        key: order.keyId,
        amount: order.amount,
        currency: 'INR',
        name: 'MakeMyCV',
        description: 'Professional CV — PDF + Word',
        image: '/assets/makemycv-mark.svg',
        order_id: order.orderId,
        handler: async (response) => {
          await verifyAndGenerate(response, order.orderId);
        },
        prefill: {
          email: flowMode === 'upload' ? detailsEmail : (cvData.personal.email || ''),
          contact: flowMode === 'upload' ? detailsPhone : (cvData.personal.phone || ''),
          name: cvData.personal.name || '',
        },
        theme: { color: '#c9a84c' },
        modal: {
          ondismiss: () => {
            btn.disabled = false;
            btn.textContent = 'Pay ₹199 Securely';
            trackEvent('payment_cancelled');
          }
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Pay ₹199 Securely';
    }
  }

  async function verifyAndGenerate(payment, orderId) {
    // 1. Verify payment
    const verifyRes = await fetch(`${API_BASE}/api/payment/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId,
        paymentId:  payment.razorpay_payment_id,
        signature:  payment.razorpay_signature,
        sessionId,
      }),
    });
    const verifyData = await verifyRes.json();
    if (!verifyRes.ok) throw new Error(verifyData.error || 'Payment verification failed');
    trackEvent('payment_completed', { template: selectedTemplate, flow_mode: flowMode });
    sendFinalLead('payment_completed'); // the one Zoho-bound submission — "Completed"

    // 2. Show generation screen
    showScreen('screen-generating');
    startGenerationAnimation();

    // 3. Generate CV — payload shape depends on which flow the candidate took.
    //    Upload flow sends the raw file straight to Claude (see lib/ai.js);
    //    nothing is pre-extracted client- or server-side before this point.
    const body = flowMode === 'upload'
      ? {
          sessionId, template: selectedTemplate, mode: 'upload',
          uploadedFile: uploadFileData,
          notes: detailsNotes,
          guidedAdds: buildGuidedPayload(),
          contact: { email: detailsEmail, phone: detailsPhone },
          razorpayOrderId: orderId, razorpayPaymentId: payment.razorpay_payment_id,
        }
      : {
          sessionId, template: selectedTemplate, mode: 'scratch',
          cvData: buildCVPayload(),
          razorpayOrderId: orderId, razorpayPaymentId: payment.razorpay_payment_id,
        };

    const genRes = await fetch(`${API_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const genData = await genRes.json();
    if (!genRes.ok) throw new Error(genData.error || 'CV generation failed');
    trackEvent('cv_generated', { flow_mode: flowMode, template: selectedTemplate });

    fileId = genData.fileId;

    // 4. Show download screen
    completeGenerationAnimation(() => {
      setupDownloadScreen(genData);
      showScreen('screen-download');
    });
  }

  function buildCVPayload() {
    return {
      name:       cvData.personal.name,
      title:      cvData.personal.title,
      email:      cvData.personal.email,
      phone:      cvData.personal.phone,
      location:   cvData.personal.location,
      linkedin:   cvData.personal.linkedin,
      portfolio:  cvData.personal.portfolio,
      summary:    cvData.summary,
      experience: cvData.experience,
      education:  cvData.education,
      skills:     cvData.skills,
      extras:     cvData.extras,
    };
  }

  // ── Generation animation ───────────────────────────────────────
  let genTimer = null;
  function startGenerationAnimation() {
    const steps = [0, 1, 2, 3];
    const bar = document.getElementById('gen-bar');
    let current = 0;

    steps.forEach(i => {
      const el = document.getElementById(`gstep-${i}`);
      if (el) { el.className = 'gen-step'; }
    });

    function activate(i) {
      const el = document.getElementById(`gstep-${i}`);
      if (el) el.classList.add('active');
      if (bar) bar.style.width = ((i + 1) / 4 * 85) + '%';
    }

    activate(0);
    let i = 1;
    genTimer = setInterval(() => {
      const prev = document.getElementById(`gstep-${i-1}`);
      if (prev) { prev.classList.remove('active'); prev.classList.add('done'); }
      if (i < 4) { activate(i); i++; }
      else clearInterval(genTimer);
    }, 6000);
  }

  function completeGenerationAnimation(cb) {
    clearInterval(genTimer);
    [0,1,2,3].forEach(i => {
      const el = document.getElementById(`gstep-${i}`);
      if (el) { el.className = 'gen-step done'; }
    });
    const bar = document.getElementById('gen-bar');
    if (bar) bar.style.width = '100%';
    setTimeout(cb, 600);
  }

  // ── Download screen setup ──────────────────────────────────────
  function setupDownloadScreen(genData) {
    const docxUrl = `/api/download?fileId=${genData.fileId}&type=docx`;
    const dlDocx = document.getElementById('dl-docx');
    if (dlDocx) { dlDocx.href = docxUrl; dlDocx.download = genData.docxFilename; }

    clearDraft();
  }

  function trackDownload(type) {
    trackEvent('download_clicked', { file_type: type, flow_mode: flowMode });
  }

  // ── Email delivery ─────────────────────────────────────────────
  async function sendEmail() {
    const email = document.getElementById('dl-email')?.value.trim();
    const msg = document.getElementById('email-msg');
    if (!email || !email.includes('@')) {
      msg.textContent = 'Please enter a valid email address.';
      msg.className = 'email-msg err';
      return;
    }
    try {
      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, fileId }),
      });
      if (res.ok) {
        msg.textContent = '✓ Files sent to ' + email;
        msg.className = 'email-msg ok';
        trackEvent('email_delivery_used');
      } else {
        throw new Error('Send failed');
      }
    } catch (_) {
      msg.textContent = 'Could not send email. Please download directly above.';
      msg.className = 'email-msg err';
    }
  }

  // ── LinkedIn upsell ────────────────────────────────────────────
  function buyLinkedIn() {
    trackEvent('linkedin_upsell_clicked');
    showToast('LinkedIn add-on coming soon! Contact hello@realplannet.com', 'info');
  }

  // ── Upload flow ────────────────────────────────────────────────
  let uploadFile = null;

  function uploadDragOver(e) {
    e.preventDefault();
    document.getElementById('upload-zone').classList.add('drag-over');
  }
  function uploadDragLeave(e) {
    document.getElementById('upload-zone').classList.remove('drag-over');
  }
  function uploadDrop(e) {
    e.preventDefault();
    document.getElementById('upload-zone').classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) setUploadFile(file);
  }
  function uploadFileSelected(e) {
    const file = e.target.files?.[0];
    if (file) setUploadFile(file);
  }

  function setUploadFile(file) {
    const maxBytes = 10 * 1024 * 1024; // 10MB
    if (file.size > maxBytes) {
      showUploadError('File too large. Maximum size is 10MB.');
      return;
    }
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['pdf','doc','docx','jpg','jpeg','png'].includes(ext)) {
      showUploadError('Unsupported format. Please upload a PDF, Word (.docx), or image (JPG/PNG).');
      return;
    }
    uploadFile = file;
    hideUploadError();

    // Show selected file info
    document.getElementById('upload-zone').style.display = 'none';
    const sel = document.getElementById('upload-selected');
    sel.style.display = 'block';
    document.getElementById('upload-file-name').textContent = file.name;
    document.getElementById('upload-file-size').textContent = formatBytes(file.size);
    document.getElementById('btn-upload-parse').disabled = false;
    trackEvent('file_uploaded', { file_ext: ext });
  }

  function uploadClear() {
    uploadFile = null;
    uploadFileData = null;
    document.getElementById('upload-zone').style.display = '';
    document.getElementById('upload-selected').style.display = 'none';
    document.getElementById('upload-progress').style.display = 'none';
    document.getElementById('btn-upload-parse').disabled = true;
    document.getElementById('upload-file-input').value = '';
    hideUploadError();
  }

  /**
   * Reads the file to base64 and moves straight to the details screen.
   * No extraction/parsing happens here — the raw file is only read by
   * Claude, once, after payment (see verifyAndGenerate → /api/generate).
   */
  async function uploadContinue() {
    if (!uploadFile) return;
    const btn = document.getElementById('btn-upload-parse');
    btn.disabled = true;
    btn.textContent = 'Reading file…';
    hideUploadError();

    try {
      const base64 = await fileToBase64(uploadFile);
      uploadFileData = {
        filename: uploadFile.name,
        type: uploadFile.name.split('.').pop().toLowerCase(),
        data: base64,
      };
      flowMode = 'upload';
      sessionId = sessionId || ('sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));

      showScreen('screen-details');
      renderGuidedBlocks();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Continue →';
      showUploadError('Could not read this file. Please try again or fill the form manually.');
    }
  }

  function showUploadError(msg) {
    const el = document.getElementById('upload-error');
    el.textContent = msg;
    el.style.display = 'block';
  }
  function hideUploadError() {
    const el = document.getElementById('upload-error');
    if (el) el.style.display = 'none';
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  // ── Draft persistence (scratch flow only) ──────────────────────
  function saveDraft() {
    try {
      localStorage.setItem('makemycv_draft', JSON.stringify({ cvData, currentStep, sessionId }));
      document.getElementById('save-status').textContent = 'Draft saved ✓';
      setTimeout(() => {
        const el = document.getElementById('save-status');
        if (el) el.textContent = 'Draft saved';
      }, 2000);
    } catch (_) {}
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem('makemycv_draft');
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.cvData) cvData = draft.cvData;
      if (draft.sessionId) sessionId = draft.sessionId;
    } catch (_) {}
  }

  function clearDraft() {
    try { localStorage.removeItem('makemycv_draft'); } catch (_) {}
  }

  // ── Toast notifications ────────────────────────────────────────
  function showToast(msg, type = 'info') {
    const existing = document.getElementById('toast-overlay');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.id = 'toast-overlay';
    el.style.cssText = `
      position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
      background:${type==='error'?'#c94444':'#1a1a28'};
      color:${type==='error'?'#fff':'#e8e4dc'};
      border:1px solid ${type==='error'?'#e05a5a':'rgba(201,168,76,0.3)'};
      padding:12px 22px;border-radius:8px;font-size:14px;
      z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.5);
      max-width:320px;text-align:center;`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  // ── Utilities ──────────────────────────────────────────────────
  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }
  function esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function splitLines(str) {
    return (str || '').split('\n').map(s => s.trim()).filter(Boolean);
  }

  // ── Public API ─────────────────────────────────────────────────
  return {
    showLanding, showScreen, startFlow,
    nextStep, prevStep, goToStep,
    addJob, removeJob, addBullet, removeBullet, toggleCurrent,
    addEdu, removeEdu,
    removeTag,
    selectTemplate, proceedToPayment,
    initiatePayment,
    sendEmail, buyLinkedIn,
    trackEvent, trackDownload,
    // Upload flow
    uploadDragOver, uploadDragLeave, uploadDrop,
    uploadFileSelected, uploadClear, uploadContinue,
    // Details / guided-add flow
    addGuided, removeGuided, detailsContinue,
  };
})();

// Auto-init: select executive template on load (default per pricing/positioning)
document.addEventListener('DOMContentLoaded', () => {
  App.selectTemplate('executive');
});
