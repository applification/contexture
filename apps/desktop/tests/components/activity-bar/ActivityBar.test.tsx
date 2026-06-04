import { ActivityBar } from '@renderer/components/activity-bar/ActivityBar';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('ActivityBar', () => {
  it('orders tabs by the model-building workflow', () => {
    render(<ActivityBar activeTab="chat" onTabChange={vi.fn()} />);

    expect(
      screen.getAllByRole('button').map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Chat', 'Review', 'Changes', 'Schema', 'Playground', 'Stdlib']);
  });
});
