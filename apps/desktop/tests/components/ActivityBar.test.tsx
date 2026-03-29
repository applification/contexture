import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ActivityBar } from '@renderer/components/activity-bar/ActivityBar';

describe('ActivityBar', () => {
  afterEach(cleanup);

  it('renders all three tabs', () => {
    render(<ActivityBar activeTab="chat" onTabChange={() => {}} />);
    expect(screen.getByTitle('Properties')).toBeInTheDocument();
    expect(screen.getByTitle('Chat')).toBeInTheDocument();
    expect(screen.getByTitle('Eval')).toBeInTheDocument();
  });

  it('calls onTabChange when tab clicked', () => {
    const onChange = vi.fn();
    render(<ActivityBar activeTab="chat" onTabChange={onChange} />);
    fireEvent.click(screen.getByTitle('Eval'));
    expect(onChange).toHaveBeenCalledWith('eval');
  });

  it('highlights active tab', () => {
    render(<ActivityBar activeTab="properties" onTabChange={() => {}} />);
    const propsBtn = screen.getByTitle('Properties');
    expect(propsBtn.className).toContain('text-primary');
  });
});
