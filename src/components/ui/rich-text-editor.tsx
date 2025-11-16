import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { 
  Bold, 
  Italic, 
  List, 
  ListOrdered, 
  Link as LinkIcon,
  Unlink
} from 'lucide-react'
import { useState, useEffect } from 'react'

interface RichTextEditorProps {
  content?: string
  onChange?: (content: string) => void
  onBlur?: (content: string) => void
  placeholder?: string
  className?: string
  readOnly?: boolean
  minHeight?: string // e.g., "96px" for 3 rows
}

const RichTextEditor = ({ content = '', onChange, onBlur, placeholder, className = '', readOnly = false, minHeight = '40px' }: RichTextEditorProps) => {
  // Clean up empty lines when displaying existing content
  const cleanContent = content ? content.replace(/(<p><\/p>)+/g, '') : content;
  const [isFocused, setIsFocused] = useState(false)
  const [isToolbarHovered, setIsToolbarHovered] = useState(false)
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkError, setLinkError] = useState('')
  
  
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 underline cursor-pointer',
        },
      }),
      Placeholder.configure({
        placeholder: placeholder || 'Start typing...',
      }),
    ],
    content: cleanContent,
    editable: true,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML())
    },
    onFocus: () => setIsFocused(true),
    onBlur: ({ editor }) => {
      // Call onBlur callback with current content
      onBlur?.(editor.getHTML())
      
      // Delay hiding toolbar to allow for toolbar interactions
      setTimeout(() => {
        if (!isToolbarHovered) {
          setIsFocused(false)
        }
      }, 150)
    },
    editorProps: {
      attributes: {
        class: 'max-w-none focus:outline-none bg-background text-base md:text-sm',
      },
    },
  })

  // Update editor content when prop changes
  useEffect(() => {
    if (editor && cleanContent !== editor.getHTML()) {
      editor.commands.setContent(cleanContent)
    }
  }, [editor, cleanContent])

  if (!editor) {
    return null
  }

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href || ''
    setLinkUrl(previousUrl)
    setLinkError('')
    setIsLinkDialogOpen(true)
  }

  const normalizeUrl = (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) return ''
    if (/^https?:\/\//i.test(trimmed)) return trimmed
    // If no protocol provided, default to https for safety
    return `https://${trimmed}`
  }

  const handleSaveLink = () => {
    const normalized = normalizeUrl(linkUrl)
    if (!normalized) {
      // Treat empty as removing the link
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      setIsLinkDialogOpen(false)
      return
    }
    try {
      // Basic URL validation
      // eslint-disable-next-line no-new
      new URL(normalized)
    } catch {
      setLinkError('Please enter a valid URL (e.g., https://example.com)')
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: normalized }).run()
    setIsLinkDialogOpen(false)
  }

  const handleRemoveLink = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    setIsLinkDialogOpen(false)
  }

  return (
    <div className={`relative ${className}`} data-testid="rich-text-editor">
      <Dialog open={isLinkDialogOpen} onOpenChange={(open) => setIsLinkDialogOpen(open)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="font-atkinson-hyperlegible">Add a link</DialogTitle>
            <DialogDescription className="font-public-sans">
              Paste a URL to create or update the selected text.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="rte-link-input" className="text-sm">URL</label>
            <Input
              id="rte-link-input"
              placeholder="https://example.com"
              value={linkUrl}
              onChange={(e) => {
                setLinkUrl(e.target.value)
                if (linkError) setLinkError('')
              }}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleSaveLink()
                }
              }}
            />
            {linkError && (
              <p className="text-sm text-destructive" role="alert">{linkError}</p>
            )}
          </div>
          <DialogFooter>
            {editor.isActive('link') && (
              <Button variant="outline" onClick={handleRemoveLink}>Remove link</Button>
            )}
            <div className="flex w-full justify-end gap-2 sm:w-auto">
              <Button variant="ghost" onClick={() => setIsLinkDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveLink}>Save</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Floating Toolbar */}
      {(isFocused || isToolbarHovered) && (
        <div 
          className="absolute -top-12 left-0 bg-background border shadow-lg rounded-lg p-2 flex gap-1 z-50"
          onMouseEnter={() => setIsToolbarHovered(true)}
          onMouseLeave={() => setIsToolbarHovered(false)}
        >
          <Button
            variant="ghost"
            size="sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              editor.chain().focus().toggleBold().run()
              // Keep focus after button click
              setTimeout(() => editor.commands.focus(), 10)
            }}
            className={`h-8 w-8 p-0 ${editor.isActive('bold') ? 'bg-accent' : ''}`}
          >
            <Bold className="h-3 w-3" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              editor.chain().focus().toggleItalic().run()
              setTimeout(() => editor.commands.focus(), 10)
            }}
            className={`h-8 w-8 p-0 ${editor.isActive('italic') ? 'bg-accent' : ''}`}
          >
            <Italic className="h-3 w-3" />
          </Button>

          <Separator orientation="vertical" className="h-4" />

          <Button
            variant="ghost"
            size="sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              editor.chain().focus().toggleBulletList().run()
              setTimeout(() => editor.commands.focus(), 10)
            }}
            className={`h-8 w-8 p-0 ${editor.isActive('bulletList') ? 'bg-accent' : ''}`}
          >
            <List className="h-3 w-3" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              editor.chain().focus().toggleOrderedList().run()
              setTimeout(() => editor.commands.focus(), 10)
            }}
            className={`h-8 w-8 p-0 ${editor.isActive('orderedList') ? 'bg-accent' : ''}`}
          >
            <ListOrdered className="h-3 w-3" />
          </Button>

          <Separator orientation="vertical" className="h-4" />

          <Button
            variant="ghost"
            size="sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setLink()
              setTimeout(() => editor.commands.focus(), 10)
            }}
            className={`h-8 w-8 p-0 ${editor.isActive('link') ? 'bg-accent' : ''}`}
          >
            <LinkIcon className="h-3 w-3" />
          </Button>
          
          {editor.isActive('link') && (
            <Button
              variant="ghost"
              size="sm"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                editor.chain().focus().unsetLink().run()
                setTimeout(() => editor.commands.focus(), 10)
              }}
              className="h-8 w-8 p-0"
            >
              <Unlink className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}

      {/* Editor Content */}
      <div 
        className="relative border h-auto focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 bg-background"
        style={{ minHeight }}
      >
        <EditorContent 
          editor={editor} 
        />
      </div>
    </div>
  )
}

export default RichTextEditor
