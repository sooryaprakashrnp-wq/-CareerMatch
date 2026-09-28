const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateProfile, rankOpportunities } = require('../matcher');
const opportunities = require('../data/opportunities.json');
const profile = { year: 3, cgpa: 7.69, location: 'Coimbatore', skills: ['Python', 'Pandas', 'Machine Learning'], interests: ['AI / ML'], preferredTypes: ['Internship'], preferredModes: ['Remote'] };

test('eligibility precedes ranking even when an ineligible item matches skills', () => {
  const items = rankOpportunities(profile, opportunities);
  const firstIneligible = items.findIndex(item => !item.eligible);
  assert.ok(firstIneligible > 0);
  assert.ok(items.slice(0, firstIneligible).every(item => item.eligible));
  assert.ok(items.slice(firstIneligible).every(item => !item.eligible));
  assert.ok(items.find(item => item.id === 'opp-08').missing.includes('Minimum CGPA 8'));
});

test('a relevant opportunity receives a higher score and clear explanation', () => {
  const items = rankOpportunities(profile, opportunities);
  const relevant = items.find(item => item.id === 'opp-01');
  const unrelated = items.find(item => item.id === 'opp-02');
  assert.ok(relevant.score > unrelated.score);
  assert.ok(relevant.reasons.some(reason => reason.includes('AI / ML')));
  assert.ok(relevant.matchedSkills.includes('Python'));
});

test('rejects invalid profiles and limits list inputs', () => {
  assert.throws(() => validateProfile({ ...profile, year: 5 }), /Year/);
  assert.throws(() => validateProfile({ ...profile, skills: [], interests: [] }), /at least one/);
  assert.equal(validateProfile({ ...profile, skills: Array(25).fill('Python') }).skills.length, 1);
});
