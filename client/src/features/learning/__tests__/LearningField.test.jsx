import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LearningField, EnumSelect } from '../LearningField';

// UX-08: the visual label must be programmatically associated with its
// control (WCAG 1.3.1 / 4.1.2) — screen readers announce the field name and
// clicking the label focuses the input.

describe('LearningField label association (UX-08)', () => {
  it('associates the label with a single input child', () => {
    render(
      <LearningField label="Program name">
        <input type="text" defaultValue="Onboarding" />
      </LearningField>,
    );
    const input = screen.getByLabelText('Program name');
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('Onboarding');
  });

  it('associates the label with an EnumSelect child', () => {
    render(
      <LearningField label="Category">
        <EnumSelect value="onboarding" onChange={() => {}} options={['onboarding', 'compliance']} labelFor={(v) => v} />
      </LearningField>,
    );
    expect(screen.getByLabelText('Category').tagName).toBe('SELECT');
  });

  it('keeps an explicit child id (label points at it)', () => {
    render(
      <LearningField label="Code">
        <input id="my-code" type="text" />
      </LearningField>,
    );
    expect(screen.getByLabelText('Code').id).toBe('my-code');
  });

  it('renders multi-element children without breaking (plain label)', () => {
    render(
      <LearningField label="Window">
        <input aria-label="from" type="number" />
        <input aria-label="to" type="number" />
      </LearningField>,
    );
    expect(screen.getByText('Window')).toBeInTheDocument();
    expect(screen.getByLabelText('from')).toBeInTheDocument();
  });
});
