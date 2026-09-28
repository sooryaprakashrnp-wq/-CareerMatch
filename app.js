const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let results = [];
let activeFilter = 'All';
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const selected = selector => $$(selector).filter(el => el.checked).map(el => el.value);

function getProfile() {
  return {
    year: Number($('#year').value), cgpa: Number($('#cgpa').value),
    location: $('#location').value.trim(),
    skills: $('#skills').value.split(',').map(s => s.trim()).filter(Boolean),
    interests: $$('#interests .selected').map(el => el.dataset.value),
    preferredTypes: selected('#types input'), preferredModes: selected('#modes input')
  };
}

function restoreProfile() {
  try {
    const profile = JSON.parse(localStorage.getItem('careermatch-profile'));
    if (!profile) return false;
    $('#year').value = profile.year;
    $('#cgpa').value = profile.cgpa;
    $('#location').value = profile.location || '';
    $('#skills').value = (profile.skills || []).join(', ');
    $$('#interests button').forEach(button => {
      const on = (profile.interests || []).includes(button.dataset.value);
      button.classList.toggle('selected', on); button.setAttribute('aria-pressed', String(on));
    });
    $$('#types input, #modes input').forEach(input => {
      input.checked = (input.closest('#types') ? profile.preferredTypes : profile.preferredModes || []).includes(input.value);
    });
    return true;
  } catch { return false; }
}

function render() {
  const eligibleOnly = $('#eligible-only').checked;
  const visible = results.filter(item => (activeFilter === 'All' || item.type === activeFilter) && (!eligibleOnly || item.eligible));
  $('#results-summary').textContent = `${visible.length} ${visible.length === 1 ? 'opportunity' : 'opportunities'} ${eligibleOnly ? 'you are eligible for' : 'found'}, ranked for your profile.`;
  $('#results').innerHTML = visible.length ? visible.map(item => `
    <article class="opportunity-card">
      <div class="card-top"><span class="category">${escapeHtml(item.type)}</span><span class="match-score">${item.score}% match</span></div>
      <h3>${escapeHtml(item.title)}</h3><p class="organization">${escapeHtml(item.organization)}</p>
      <p class="description">${escapeHtml(item.description)}</p>
      <div class="tags"><span>⌖ ${escapeHtml(item.location)}</span><span>◷ ${escapeHtml(item.duration)}</span><span>◈ ${escapeHtml(item.mode)}</span></div>
      <div class="card-bottom"><div class="reason"><strong>${item.eligible ? 'Why it fits' : 'Eligibility to check'}</strong><p>${escapeHtml(item.eligible ? item.reasons.slice(0, 2).join(' · ') : item.missing.join(' · '))}</p></div><span class="card-arrow" aria-hidden="true">↗</span></div>
      ${item.eligible && item.skills.length ? `<div class="growth"><b>Skills to grow:</b> ${escapeHtml(item.skills.filter(s => !item.matchedSkills.includes(s)).slice(0, 3).join(', ') || 'You already match the listed skills')}</div>` : ''}
    </article>`).join('') : '<div class="empty">No matches in this view. Try a different filter or turn off “Eligible only”.</div>';
}

async function match(scroll = true) {
  $('#form-error').hidden = true;
  const profile = getProfile();
  if (!profile.skills.length && !profile.interests.length) {
    $('#form-error').textContent = 'Add at least one skill or interest.'; $('#form-error').hidden = false; return;
  }
  try {
    const response = await fetch('/api/match', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(profile) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load matches.');
    results = data.results;
    localStorage.setItem('careermatch-profile', JSON.stringify(profile));
    render();
    if (scroll) $('#matches').scrollIntoView({ behavior: 'smooth' });
  } catch (error) { $('#form-error').textContent = error.message; $('#form-error').hidden = false; }
}

$('#profile-form').addEventListener('submit', event => { event.preventDefault(); match(); });
$$('#interests button').forEach(button => button.addEventListener('click', () => {
  button.classList.toggle('selected'); button.setAttribute('aria-pressed', String(button.classList.contains('selected')));
}));
$$('.filter-tabs button').forEach(button => button.addEventListener('click', () => {
  activeFilter = button.dataset.filter;
  $$('.filter-tabs button').forEach(el => { el.classList.toggle('active', el === button); el.setAttribute('aria-pressed', String(el === button)); });
  if (results.length) render();
}));
$('#eligible-only').addEventListener('change', () => { if (results.length) render(); });
if (restoreProfile()) match(false);
