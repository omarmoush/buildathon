import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { formatDepositPercent } from '../src/lib/quote-format.ts';

const source = ts.createSourceFile(
  'App.tsx',
  readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function descendants(node, predicate) {
  const matches = [];
  function visit(child) {
    if (predicate(child)) matches.push(child);
    ts.forEachChild(child, visit);
  }
  visit(node);
  return matches;
}

const callsNamed = (name) => (node) =>
  ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name;

test('translation is a pure callback, not a hidden hook in conditional text', () => {
  const [hook] = descendants(source, node =>
    ts.isVariableDeclaration(node) && node.name.getText(source) === 'useTranslation');
  assert.ok(hook);
  const returned = hook.initializer.body.statements.find(ts.isReturnStatement);
  assert.ok(ts.isArrowFunction(returned.expression));
  assert.equal(descendants(returned.expression, node =>
    ts.isCallExpression(node) && /^use[A-Z]/.test(node.expression.getText(source))).length, 0);
  assert.equal(descendants(source, node =>
    ts.isVariableDeclaration(node) && node.name.getText(source) === 't' &&
    ts.isArrowFunction(node.initializer)).length, 0, 'No global hook-calling t helper');
});

test('every translating component subscribes once, before all conditional returns', () => {
  const components = source.statements.filter(node =>
    ts.isFunctionDeclaration(node) && node.body && descendants(node.body, callsNamed('t')).length);
  assert.ok(components.some(node => node.name.text === 'DashboardPage'));
  assert.ok(components.some(node => node.name.text === 'BuyerPage'));
  assert.ok(components.some(node => node.name.text === 'ProgressTimeline'));
  for (const component of components) {
    assert.equal(descendants(component.body, callsNamed('useTranslation')).length, 1, component.name.text);
    const first = component.body.statements[0];
    assert.ok(ts.isVariableStatement(first), component.name.text);
    const binding = first.declarationList.declarations[0];
    assert.equal(binding.name.getText(source), 't', component.name.text);
    assert.ok(callsNamed('useTranslation')(binding.initializer), component.name.text);
  }
});

test('fractional deposits render as percentage points without changing wire values', () => {
  for (const [fraction, label] of [[0, '0%'], [0.005, '0.5%'], [0.5, '50%'], [0.4166666667, '41.67%'], [1, '100%']]) {
    assert.equal(formatDepositPercent(fraction), label);
  }
});

test('requested orders have labels, filtering, and design sharing in the prior UI', () => {
  const text = source.text;
  assert.match(text, /requested: \['Requested', 'طلب جديد'\]/);
  assert.match(text, /requested: 0/);
  assert.match(text, /<option value="requested">/);
  assert.match(text, /\['requested', 'draft', 'design_review'\]\.includes\(order\.status\)/);
  assert.match(text, /formatDepositPercent\(order\.quote\.depositPercent\)/);
});
