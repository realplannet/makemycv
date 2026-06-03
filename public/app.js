/* ─────────────────────────────────────────────────────────────────
   MakeMyCV — Frontend SPA
   Screens: landing → form (6 steps) → template → payment → generating → download
───────────────────────────────────────────────────────────────── */

const API_BASE = '';  // same origin — Vercel serves frontend + API together // change to your backend URL in production

const STEPS = [
  { id: 'personal',  label: 'Personal'  },
  { id: 'summary',   label: 'Summary'   },
  { id: 'experience',label: 'Experience'},
  { id: 'education', label: 'Education' },
  { id: 'skills',    label: 'Skills'    },
  { id: 'extras',    label: 'Extras'    },
];

const App = (() => {
  // ── State ──────────────────────────────────────────────────────
  let currentStep = 0;
  let selectedTemplate = 'classic';
  let sessionId = null;
  let fileId = null;
  let cvData = {
    personal: {},
    summary: '',
    experience: [],
    education: [],
    skills: { technical: [], soft: [], languages: [], certifications: [] },
    extras: { awards: [], projects: [], volunteer: [], publications: [] },
  };

  // Tags state keyed by field id
  const tagState = {};

  // ── Screen management ──────────────────────────────────────────
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    window.scrollTo(0, 0);
  }

  function showLanding() { showScreen('screen-landing'); }

  function startFlow(mode) {
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

  // ── Step navigation ────────────────────────────────────────────
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

  // ── Template selection ─────────────────────────────────────────
  function selectTemplate(name) {
    selectedTemplate = name;
    document.querySelectorAll('.tpick').forEach(el => el.classList.remove('selected'));
    document.querySelector(`[data-template="${name}"]`)?.classList.add('selected');
  }

  function proceedToPayment() {
    if (!selectedTemplate) { showToast('Please select a template.', 'error'); return; }
    document.getElementById('payment-template-name').textContent =
      selectedTemplate.charAt(0).toUpperCase() + selectedTemplate.slice(1);
    showScreen('screen-payment');
  }

  // ── Payment ────────────────────────────────────────────────────
  async function initiatePayment() {
    const btn = document.getElementById('btn-pay');
    btn.disabled = true;
    btn.textContent = 'Creating order…';

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
        image: '../uploads/makemycv-mark.svg',
        order_id: order.orderId,
        handler: async (response) => {
          await verifyAndGenerate(response, order.orderId);
        },
        prefill: {
          email: cvData.personal.email || '',
          contact: cvData.personal.phone || '',
          name: cvData.personal.name || '',
        },
        theme: { color: '#c9a84c' },
        modal: {
          ondismiss: () => {
            btn.disabled = false;
            btn.textContent = 'Pay ₹199 Securely';
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

    // 2. Show generation screen
    showScreen('screen-generating');
    startGenerationAnimation();

    // 3. Generate CV
    const cvPayload = buildCVPayload();
    const genRes = await fetch(`${API_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, template: selectedTemplate, cvData: cvPayload }),
    });
    const genData = await genRes.json();
    if (!genRes.ok) throw new Error(genData.error || 'CV generation failed');

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
    const pdfUrl  = `/api/download?fileId=${genData.fileId}&type=pdf`;
    const docxUrl = `/api/download?fileId=${genData.fileId}&type=docx`;

    const dlPdf  = document.getElementById('dl-pdf');
    const dlDocx = document.getElementById('dl-docx');
    if (dlPdf)  { dlPdf.href  = pdfUrl;  dlPdf.download  = genData.pdfFilename; }
    if (dlDocx) { dlDocx.href = docxUrl; dlDocx.download = genData.docxFilename; }

    clearDraft();
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
    if (!['pdf','doc','docx'].includes(ext)) {
      showUploadError('Unsupported format. Please upload a PDF or Word (.docx) file.');
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
  }

  function uploadClear() {
    uploadFile = null;
    document.getElementById('upload-zone').style.display = '';
    document.getElementById('upload-selected').style.display = 'none';
    document.getElementById('upload-progress').style.display = 'none';
    document.getElementById('btn-upload-parse').disabled = true;
    document.getElementById('upload-file-input').value = '';
    hideUploadError();
  }

  async function uploadAndParse() {
    if (!uploadFile) return;
    const btn = document.getElementById('btn-upload-parse');
    btn.disabled = true;
    btn.textContent = 'Extracting…';
    hideUploadError();

    // Show progress
    const prog = document.getElementById('upload-progress');
    const bar  = document.getElementById('upload-progress-bar');
    const lbl  = document.getElementById('upload-progress-label');
    prog.style.display = 'block';

    try {
      // Step 1: read file as base64
      lbl.textContent = 'Reading file…';
      bar.style.width = '20%';
      const base64 = await fileToBase64(uploadFile);

      // Step 2: send to API
      lbl.textContent = 'Extracting your details…';
      bar.style.width = '50%';

      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: uploadFile.name,
          type: uploadFile.name.split('.').pop().toLowerCase(),
          data: base64,
        }),
      });
      const json = await res.json();

      if (!res.ok) throw new Error(json.error || 'Extraction failed');

      // Step 3: pre-fill form data
      lbl.textContent = 'Pre-filling your form…';
      bar.style.width = '90%';

      const parsed = json.cvData;
      if (parsed.personal)   cvData.personal    = { ...cvData.personal, ...parsed.personal };
      if (parsed.summary)    cvData.summary     = parsed.summary;
      if (parsed.experience?.length) cvData.experience = parsed.experience;
      if (parsed.education?.length)  cvData.education  = parsed.education;
      if (parsed.skills)     cvData.skills      = { ...cvData.skills, ...parsed.skills };
      if (parsed.extras)     cvData.extras      = { ...cvData.extras, ...parsed.extras };

      bar.style.width = '100%';
      lbl.textContent = 'Done! Review your details.';

      // Small delay then go to form
      setTimeout(() => {
        sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        currentStep = 0;
        showScreen('screen-form');
        renderStep();
        showToast('CV imported — review and edit your details below.', 'info');
      }, 600);

    } catch (err) {
      prog.style.display = 'none';
      btn.disabled = false;
      btn.textContent = 'Extract & Pre-fill Form →';
      showUploadError(err.message || 'Upload failed. Please try again or fill the form manually.');
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

  // ── Draft persistence ──────────────────────────────────────────
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
    // Upload flow
    uploadDragOver, uploadDragLeave, uploadDrop,
    uploadFileSelected, uploadClear, uploadAndParse,
  };
})();

// Auto-init: select classic template on load
document.addEventListener('DOMContentLoaded', () => {
  App.selectTemplate('classic');
});
