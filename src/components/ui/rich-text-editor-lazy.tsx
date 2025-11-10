import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';

// Lazy load the RichTextEditor component to reduce bundle size
// TipTap is a heavy dependency that's only needed when editing
const RichTextEditor = lazy(() => import('./rich-text-editor'));

interface RichTextEditorProps {
  content?: string;
  onChange?: (content: string) => void;
  onBlur?: (content: string) => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
}

/**
 * Lazy-loaded wrapper for RichTextEditor
 * Shows a loading spinner while the editor is being loaded
 * This significantly reduces initial bundle size since TipTap is heavy
 */
export default function LazyRichTextEditor(props: RichTextEditorProps) {
  return (
    <Suspense 
      fallback={
        <div className="relative border h-[40px] flex items-center justify-center bg-background">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <RichTextEditor {...props} />
    </Suspense>
  );
}

