import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/test-utils';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';

describe('Card', () => {
  it('should render basic card', () => {
    render(<Card data-testid="card">Card content</Card>);
    expect(screen.getByTestId('card')).toBeInTheDocument();
  });

  it('should render card with header', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Card Title</CardTitle>
        </CardHeader>
      </Card>
    );
    expect(screen.getByText('Card Title')).toBeInTheDocument();
  });

  it('should render card with title and description', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Description text</CardDescription>
        </CardHeader>
      </Card>
    );
    
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Description text')).toBeInTheDocument();
  });

  it('should render card with content', () => {
    render(
      <Card>
        <CardContent>Main content here</CardContent>
      </Card>
    );
    expect(screen.getByText('Main content here')).toBeInTheDocument();
  });

  it('should render card with footer', () => {
    render(
      <Card>
        <CardFooter>Footer content</CardFooter>
      </Card>
    );
    expect(screen.getByText('Footer content')).toBeInTheDocument();
  });

  it('should render complete card with all sections', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Complete Card</CardTitle>
          <CardDescription>This is a description</CardDescription>
        </CardHeader>
        <CardContent>
          <p>This is the main content</p>
        </CardContent>
        <CardFooter>
          <button>Action</button>
        </CardFooter>
      </Card>
    );
    
    expect(screen.getByText('Complete Card')).toBeInTheDocument();
    expect(screen.getByText('This is a description')).toBeInTheDocument();
    expect(screen.getByText('This is the main content')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
  });

  it('should apply custom className to Card', () => {
    render(<Card className="custom-card" data-testid="card">Content</Card>);
    const card = screen.getByTestId('card');
    expect(card).toHaveClass('custom-card');
  });

  it('should apply custom className to CardHeader', () => {
    render(
      <Card>
        <CardHeader className="custom-header" data-testid="header">
          Header
        </CardHeader>
      </Card>
    );
    expect(screen.getByTestId('header')).toHaveClass('custom-header');
  });

  it('should apply custom className to CardTitle', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle className="custom-title">Title</CardTitle>
        </CardHeader>
      </Card>
    );
    const title = screen.getByText('Title');
    expect(title).toHaveClass('custom-title');
  });

  it('should apply custom className to CardContent', () => {
    render(
      <Card>
        <CardContent className="custom-content" data-testid="content">
          Content
        </CardContent>
      </Card>
    );
    expect(screen.getByTestId('content')).toHaveClass('custom-content');
  });

  it('should apply custom className to CardFooter', () => {
    render(
      <Card>
        <CardFooter className="custom-footer" data-testid="footer">
          Footer
        </CardFooter>
      </Card>
    );
    expect(screen.getByTestId('footer')).toHaveClass('custom-footer');
  });

  it('should render CardTitle as h3 element', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Heading</CardTitle>
        </CardHeader>
      </Card>
    );
    const title = screen.getByText('Heading');
    expect(title.tagName).toBe('H3');
  });
});

