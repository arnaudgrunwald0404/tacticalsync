import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { Checkbox } from '@/components/ui/checkbox';

describe('Checkbox', () => {
  it('should render checkbox', () => {
    render(<Checkbox aria-label="Accept terms" />);
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('should be unchecked by default', () => {
    render(<Checkbox aria-label="Accept terms" />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('should be checked when checked prop is true', () => {
    render(<Checkbox checked={true} aria-label="Accept terms" />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('should handle check/uncheck', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    
    render(<Checkbox onCheckedChange={handleChange} aria-label="Accept terms" />);
    
    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);
    
    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('should be disabled when disabled prop is true', () => {
    render(<Checkbox disabled aria-label="Accept terms" />);
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });

  it('should not trigger onChange when disabled', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    
    render(<Checkbox disabled onCheckedChange={handleChange} aria-label="Accept terms" />);
    
    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);
    
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('should apply custom className', () => {
    render(<Checkbox className="custom-checkbox" aria-label="Accept terms" />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveClass('custom-checkbox');
  });

  it('should support controlled component pattern', async () => {
    const user = userEvent.setup();
    const TestComponent = () => {
      const [checked, setChecked] = React.useState(false);
      
      return (
        <div>
          <Checkbox 
            checked={checked} 
            onCheckedChange={setChecked}
            aria-label="Controlled checkbox"
          />
          <span data-testid="status">{checked ? 'Checked' : 'Unchecked'}</span>
        </div>
      );
    };
    
    render(<TestComponent />);
    
    expect(screen.getByTestId('status')).toHaveTextContent('Unchecked');
    
    await user.click(screen.getByRole('checkbox'));
    
    expect(screen.getByTestId('status')).toHaveTextContent('Checked');
  });
});

