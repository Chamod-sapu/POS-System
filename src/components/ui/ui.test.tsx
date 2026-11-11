import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React, { useState } from 'react';
import { Button } from './Button';
import { MoneyInput } from './MoneyInput';
import { QuantityInput } from './QuantityInput';
import { SearchInput } from './SearchInput';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import { DataTable, Column } from './DataTable';
import { ToastProvider, useToast } from './Toast';
import { ErrorBoundary } from './ErrorBoundary';

describe('Shared UI Components', () => {
  describe('Button Component', () => {
    it('renders with default variant and handles clicks', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Submit Payment</Button>);

      const btn = screen.getByRole('button', { name: /Submit Payment/i });
      expect(btn).toBeInTheDocument();
      fireEvent.click(btn);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('renders loading spinner and disables button when isLoading is true', () => {
      const handleClick = vi.fn();
      render(
        <Button isLoading onClick={handleClick}>
          Processing
        </Button>
      );

      const btn = screen.getByRole('button');
      expect(btn).toBeDisabled();
      fireEvent.click(btn);
      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('MoneyInput Component', () => {
    const TestMoneyWrapper = ({ initialCents = 0n }: { initialCents?: bigint }) => {
      const [cents, setCents] = useState<bigint>(initialCents);
      return (
        <div>
          <span data-testid="output-cents">{cents.toString()}</span>
          <MoneyInput
            label="Amount Tendered"
            valueCents={cents}
            onChange={(val) => setCents(val)}
          />
        </div>
      );
    };

    it('initializes with formatted rupees without floating point', () => {
      render(<TestMoneyWrapper initialCents={125050n} />);
      const input = screen.getByLabelText(/Amount Tendered/i) as HTMLInputElement;
      expect(input.value).toBe('1250.50');
      expect(screen.getByTestId('output-cents').textContent).toBe('125050');
    });

    it('converts user-typed rupees to integer cents', () => {
      render(<TestMoneyWrapper initialCents={0n} />);
      const input = screen.getByLabelText(/Amount Tendered/i) as HTMLInputElement;

      fireEvent.change(input, { target: { value: '450.75' } });
      expect(screen.getByTestId('output-cents').textContent).toBe('45075');

      fireEvent.blur(input);
      expect(input.value).toBe('450.75');
    });

    it('handles empty input and clears to 0 cents', () => {
      render(<TestMoneyWrapper initialCents={1000n} />);
      const input = screen.getByLabelText(/Amount Tendered/i) as HTMLInputElement;

      fireEvent.change(input, { target: { value: '' } });
      expect(screen.getByTestId('output-cents').textContent).toBe('0');
    });
  });

  describe('QuantityInput Component', () => {
    const TestQuantityWrapper = ({ allowDecimal = false }: { allowDecimal?: boolean }) => {
      const [qty, setQty] = useState<string>('1');
      return (
        <div>
          <span data-testid="output-qty">{qty}</span>
          <QuantityInput
            label="Item Quantity"
            allowDecimal={allowDecimal}
            unit={allowDecimal ? 'kg' : 'pcs'}
            value={qty}
            onChange={(val) => setQty(val)}
          />
        </div>
      );
    };

    it('disallows decimal input when allowDecimal is false (e.g. pcs)', () => {
      render(<TestQuantityWrapper allowDecimal={false} />);
      const input = screen.getByRole('textbox') as HTMLInputElement;

      fireEvent.change(input, { target: { value: '2.5' } });
      // Should not accept decimal
      expect(screen.getByTestId('output-qty').textContent).toBe('1');

      fireEvent.change(input, { target: { value: '3' } });
      expect(screen.getByTestId('output-qty').textContent).toBe('3');
    });

    it('allows decimal input with up to 3 places when allowDecimal is true (e.g. kg)', () => {
      render(<TestQuantityWrapper allowDecimal={true} />);
      const input = screen.getByRole('textbox') as HTMLInputElement;

      fireEvent.change(input, { target: { value: '1.250' } });
      expect(screen.getByTestId('output-qty').textContent).toBe('1.250');
    });

    it('increments and decrements using touch buttons', () => {
      render(<TestQuantityWrapper allowDecimal={false} />);
      const incBtn = screen.getByRole('button', { name: /Increase quantity/i });
      const decBtn = screen.getByRole('button', { name: /Decrease quantity/i });

      fireEvent.click(incBtn);
      expect(screen.getByTestId('output-qty').textContent).toBe('2');

      fireEvent.click(decBtn);
      expect(screen.getByTestId('output-qty').textContent).toBe('1');
    });
  });

  describe('SearchInput Component', () => {
    it('debounces search input events', async () => {
      vi.useFakeTimers();
      const onDebounce = vi.fn();
      render(<SearchInput placeholder="Search..." onDebounce={onDebounce} debounceMs={300} />);

      const input = screen.getByPlaceholderText(/Search/i);
      fireEvent.change(input, { target: { value: 'Keeri Samba' } });

      expect(onDebounce).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(onDebounce).toHaveBeenCalledWith('Keeri Samba');
      vi.useRealTimers();
    });

    it('clears search input when clear button is clicked', () => {
      const onChange = vi.fn();
      render(<SearchInput value="test" onChange={onChange} />);

      const clearBtn = screen.getByRole('button', { name: /Clear search/i });
      fireEvent.click(clearBtn);
      expect(onChange).toHaveBeenCalledWith('');
    });
  });

  describe('Modal & ConfirmDialog Component', () => {
    it('renders modal when open and closes on Escape key', () => {
      const handleClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={handleClose} title="Hold Current Cart">
          <p>Cart will be safely stored.</p>
        </Modal>
      );

      expect(screen.getByText('Hold Current Cart')).toBeInTheDocument();
      expect(screen.getByText('Cart will be safely stored.')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('does not steal focus to the close button when input value changes and parent re-renders', () => {
      const TestFormModal = () => {
        const [value, setValue] = React.useState('');
        return (
          <Modal isOpen={true} onClose={() => {}} title="Test Form">
            <input
              data-testid="test-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </Modal>
        );
      };

      render(<TestFormModal />);
      const input = screen.getByTestId('test-input');
      const closeBtn = screen.getByRole('button', { name: /Close dialog/i });

      input.focus();
      expect(document.activeElement).toBe(input);

      // Type characters and ensure focus stays on input and does not jump to closeBtn
      fireEvent.change(input, { target: { value: 'A' } });
      expect(document.activeElement).toBe(input);
      expect(document.activeElement).not.toBe(closeBtn);

      fireEvent.change(input, { target: { value: 'AB' } });
      expect(document.activeElement).toBe(input);
      expect(document.activeElement).not.toBe(closeBtn);
    });

    it('renders ConfirmDialog and triggers onConfirm on button click', () => {
      const handleConfirm = vi.fn();
      const handleClose = vi.fn();

      render(
        <ConfirmDialog
          isOpen={true}
          title="Void Bill WWL-20261109-0001?"
          message="This action is recorded in the immutable audit log."
          onConfirm={handleConfirm}
          onClose={handleClose}
          confirmText="Confirm Void"
        />
      );

      expect(screen.getByText(/Void Bill/i)).toBeInTheDocument();
      const confirmBtn = screen.getByRole('button', { name: /Confirm Void/i });
      fireEvent.click(confirmBtn);
      expect(handleConfirm).toHaveBeenCalledTimes(1);
    });
  });

  describe('DataTable Component', () => {
    interface Product {
      id: string;
      name: string;
      price: number;
    }

    const columns: Column<Product>[] = [
      { id: 'name', header: 'Product Name', sortable: true },
      { id: 'price', header: 'Price', align: 'right', sortable: true },
    ];

    const data: Product[] = [
      { id: '1', name: 'Anchor Milk Powder', price: 1150 },
      { id: '2', name: 'Dilmah Ceylon Tea', price: 450 },
      { id: '3', name: 'Munchee Cream Cracker', price: 280 },
    ];

    it('renders rows, column headers and pagination', () => {
      render(
        <DataTable<Product>
          data={data}
          columns={columns}
          keyExtractor={(p) => p.id}
          pageSize={2}
        />
      );

      expect(screen.getByText('Anchor Milk Powder')).toBeInTheDocument();
      expect(screen.getByText('Dilmah Ceylon Tea')).toBeInTheDocument();
      expect(screen.queryByText('Munchee Cream Cracker')).not.toBeInTheDocument();

      // Go to next page
      const nextBtn = screen.getByRole('button', { name: /Next/i });
      fireEvent.click(nextBtn);

      expect(screen.getByText('Munchee Cream Cracker')).toBeInTheDocument();
    });

    it('sorts rows when clicking a sortable column header', () => {
      render(
        <DataTable<Product>
          data={data}
          columns={columns}
          keyExtractor={(p) => p.id}
          pageSize={10}
        />
      );

      const header = screen.getByText('Product Name');
      fireEvent.click(header); // asc
      const rowsAsc = screen.getAllByRole('row');
      expect(rowsAsc[1]?.textContent).toContain('Anchor Milk Powder');

      fireEvent.click(header); // desc
      const rowsDesc = screen.getAllByRole('row');
      expect(rowsDesc[1]?.textContent).toContain('Munchee Cream Cracker');
    });

    it('renders empty state when data array is empty', () => {
      render(
        <DataTable<Product>
          data={[]}
          columns={columns}
          keyExtractor={(p) => p.id}
          emptyTitle="No Products Registered"
        />
      );

      expect(screen.getByText('No Products Registered')).toBeInTheDocument();
    });
  });

  describe('Toast Notifications', () => {
    const TestToastComponent = () => {
      const toast = useToast();
      return (
        <div>
          <button onClick={() => toast.success('Sale Completed Successfully!')}>
            Trigger Success Toast
          </button>
        </div>
      );
    };

    it('displays toast and allows dismissal', async () => {
      render(
        <ToastProvider>
          <TestToastComponent />
        </ToastProvider>
      );

      const triggerBtn = screen.getByText(/Trigger Success Toast/i);
      fireEvent.click(triggerBtn);

      expect(screen.getByText('Sale Completed Successfully!')).toBeInTheDocument();

      const dismissBtn = screen.getByLabelText(/Dismiss notification/i);
      fireEvent.click(dismissBtn);

      await waitFor(() => {
        expect(screen.queryByText('Sale Completed Successfully!')).not.toBeInTheDocument();
      });
    });
  });

  describe('ErrorBoundary Component', () => {
    const BadComponent = () => {
      throw new Error('Test crash in cashier component');
    };

    it('catches render errors and displays fallback UI', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <ErrorBoundary>
          <BadComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(screen.getByText(/Test crash in cashier component/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Try Again/i })).toBeInTheDocument();

      spy.mockRestore();
    });
  });
});

