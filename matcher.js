const TYPES = ['Internship', 'Hackathon', 'Fellowship'];
const MODES = ['Remote', 'Online', 'Hybrid', 'On-site'];

function tokens(value) {
  return new Set(String(value || '').toLowerCase().match(/[a-z0-9+#.]+/g) || []);
}

function normalizeList(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(v => String(v).trim()).filter(Boolean))].slice(0, 20);
}

function validateProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Profile must be an object.');
  const year = Number(input.year);
  const cgpa = Number(input.cgpa);
  if (!Number.isInteger(year) || year < 1 || year > 4) throw new Error('Year must be between 1 and 4.');
  if (!Number.isFinite(cgpa) || cgpa < 0 || cgpa > 10) throw new Error('CGPA must be between 0 and 10.');
  const skills = normalizeList(input.skills);
  const interests = normalizeList(input.interests);
  if (skills.length === 0 && interests.length === 0) throw new Error('Add at least one skill or interest.');
  return {
    year, cgpa, skills, interests,
    location: String(input.location || '').trim().slice(0, 80),
    preferredTypes: normalizeList(input.preferredTypes).filter(v => TYPES.includes(v)),
    preferredModes: normalizeList(input.preferredModes).filter(v => MODES.includes(v))
  };
}

function overlap(a, b) {
  const desired = new Set(a.flatMap(v => [...tokens(v)]));
  return b.filter(v => [...tokens(v)].some(t => desired.has(t)));
}

function rankOpportunities(profileInput, opportunities) {
  const profile = validateProfile(profileInput);
  return opportunities.map(opp => {
    const reasons = [];
    const missing = [];
    if (!opp.eligibility.years.includes(profile.year)) missing.push(`Open to year ${opp.eligibility.years.join(', ')} students`);
    if (opp.eligibility.minimumCgpa !== null && profile.cgpa < opp.eligibility.minimumCgpa) missing.push(`Minimum CGPA ${opp.eligibility.minimumCgpa}`);

    const matchedSkills = overlap(profile.skills, opp.skills);
    const matchedDomains = overlap(profile.interests, opp.domains);
    const skillScore = opp.skills.length ? matchedSkills.length / opp.skills.length : 0;
    const domainScore = opp.domains.length ? matchedDomains.length / opp.domains.length : 0;
    const typeScore = profile.preferredTypes.length ? Number(profile.preferredTypes.includes(opp.type)) : 0.5;
    const modeScore = profile.preferredModes.length ? Number(profile.preferredModes.includes(opp.mode)) : 0.5;
    const locationScore = profile.location && opp.mode === 'On-site'
      ? Number(tokens(profile.location).has(opp.location.toLowerCase())) : 0.5;
    // Explicit weights keep the explanation and ranking auditable.
    const score = Math.round(100 * (0.4 * skillScore + 0.3 * domainScore + 0.12 * typeScore + 0.1 * modeScore + 0.08 * locationScore));
    if (matchedDomains.length) reasons.push(`Matches your ${matchedDomains.join(', ')} interest${matchedDomains.length > 1 ? 's' : ''}`);
    if (matchedSkills.length) reasons.push(`${matchedSkills.length} relevant skill${matchedSkills.length > 1 ? 's' : ''}: ${matchedSkills.slice(0, 3).join(', ')}`);
    if (profile.preferredTypes.includes(opp.type)) reasons.push(`Your preferred ${opp.type.toLowerCase()} format`);
    if (profile.preferredModes.includes(opp.mode)) reasons.push(`Available ${opp.mode.toLowerCase()}`);
    if (!reasons.length) reasons.push('Explore this opportunity to develop new skills');
    return { ...opp, score, eligible: missing.length === 0, reasons, missing, matchedSkills };
  }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score || a.title.localeCompare(b.title));
}

module.exports = { validateProfile, rankOpportunities };
