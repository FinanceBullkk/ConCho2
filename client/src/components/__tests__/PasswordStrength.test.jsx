import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PasswordStrength, scorePassword } from '../PasswordStrength';

describe('scorePassword', () => {
  it('returns 0 for empty / non-string', () => {
    expect(scorePassword('')).toBe(0);
    expect(scorePassword(undefined)).toBe(0);
    expect(scorePassword(null)).toBe(0);
    expect(scorePassword(12345)).toBe(0);
  });

  it('scores each individual rule', () => {
    expect(scorePassword('short')).toBe(0);          // no rule met
    expect(scorePassword('longenough')).toBe(1);     // length only
    expect(scorePassword('LongEnough')).toBe(2);     // length + uppercase
    expect(scorePassword('LongEnough1')).toBe(3);    // + digit
    expect(scorePassword('LongEnough1!')).toBe(4);   // + non-alnum
  });

  it('handles non-length rules without length', () => {
    expect(scorePassword('Abc1!')).toBe(3); // 3 rules met but length=5 → no length point
  });
});

describe('PasswordStrength component', () => {
  it('renders nothing for empty value', () => {
    const { container } = render(<PasswordStrength value="" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders 4 bars + label for non-empty value', () => {
    const { container, getByText } = render(<PasswordStrength value="LongEnough1!" />);
    const bars = container.querySelectorAll('.h-1.flex-1.rounded-full');
    expect(bars).toHaveLength(4);
    expect(getByText('Strong')).toBeInTheDocument();
  });

  it('respects custom labels prop', () => {
    const VN = ['', 'Yếu', 'Trung bình', 'Tốt', 'Mạnh'];
    const { getByText } = render(<PasswordStrength value="LongEnough1!" labels={VN} />);
    expect(getByText('Mạnh')).toBeInTheDocument();
  });

  it('uses tone-mapped bar classes (no raw colors)', () => {
    const { container } = render(<PasswordStrength value="LongEnough1!" />);
    const bars = container.querySelectorAll('.bg-success');
    expect(bars.length).toBeGreaterThan(0);
    expect(container.querySelector('.bg-orange-500')).toBeNull();
    expect(container.querySelector('.bg-yellow-500')).toBeNull();
    expect(container.querySelector('.bg-emerald-500')).toBeNull();
  });
});
