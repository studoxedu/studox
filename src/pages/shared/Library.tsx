import { useEffect, useState } from 'react'
import { Topbar } from '../../components/layout/Topbar'
import { Card, CardHeader, Alert } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input, Select, Field, Grid2 } from '../../components/ui/Form'
import { supabase } from '../../lib/supabase'
import { cn } from '../../lib/utils'
import type { AppUser } from '../../types'

interface Props { appUser: AppUser }

interface Book {
  id: string
  title: string
  author: string | null
  isbn: string | null
  category: string | null
  total_copies: number
  available_copies: number
}

interface Borrow {
  id: string
  book_id: string
  borrower_name: string
  borrowed_at: string
  due_date: string
  returned_at: string | null
  is_returned: boolean
  book?: { title: string }
}

const CATEGORIES = ['Textbook','Fiction','Reference','Science','Mathematics','History','General']

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function Library({ appUser }: Props) {
  const schoolId  = appUser.activeSchool?.id ?? ''
  const isStudent = (appUser.activeMembership?.office?.name ?? '') === 'student'

  const [tab, setTab]           = useState<'catalog' | 'borrows'>('catalog')
  const [books, setBooks]       = useState<Book[]>([])
  const [borrows, setBorrows]   = useState<Borrow[]>([])
  const [loading, setLoading]   = useState(true)
  const [toast, setToast]       = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Add book form
  const [showForm, setShowForm]   = useState(false)
  const [bookForm, setBookForm]   = useState({ title: '', author: '', isbn: '', category: '', total_copies: '1' })
  const [savingBook, setSavingBook] = useState(false)

  // Issue borrow modal
  const [issueBook, setIssueBook] = useState<Book | null>(null)
  const [borrowerName, setBorrowerName]   = useState('')
  const [dueDate, setDueDate]             = useState('')
  const [savingBorrow, setSavingBorrow]   = useState(false)

  function flash(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type }); setTimeout(() => setToast(null), 4000)
  }

  async function loadAll() {
    const [{ data: bs }, { data: brs }] = await Promise.all([
      supabase.from('library_books').select('*').eq('school_id', schoolId).order('title'),
      supabase.from('library_borrows').select('*, book:library_books(title)')
        .eq('school_id', schoolId).order('borrowed_at', { ascending: false }).limit(100),
    ])
    setBooks((bs ?? []) as Book[])
    setBorrows((brs ?? []) as Borrow[])
    setLoading(false)
  }

  useEffect(() => { if (schoolId) loadAll() }, [schoolId])

  async function addBook() {
    if (!bookForm.title.trim()) return
    setSavingBook(true)
    const copies = parseInt(bookForm.total_copies) || 1
    const { error } = await supabase.from('library_books').insert({
      school_id:        schoolId,
      title:            bookForm.title.trim(),
      author:           bookForm.author.trim() || null,
      isbn:             bookForm.isbn.trim() || null,
      category:         bookForm.category || null,
      total_copies:     copies,
      available_copies: copies,
    })
    setSavingBook(false)
    if (error) { flash(error.message, 'error'); return }
    setBookForm({ title: '', author: '', isbn: '', category: '', total_copies: '1' })
    setShowForm(false)
    flash('Book added to catalog.')
    loadAll()
  }

  async function issueBorrow() {
    if (!issueBook || !borrowerName.trim() || !dueDate) return
    setSavingBorrow(true)
    const { error } = await supabase.from('library_borrows').insert({
      school_id:     schoolId,
      book_id:       issueBook.id,
      borrower_name: borrowerName.trim(),
      due_date:      dueDate,
    })
    if (!error) {
      await supabase.from('library_books').update({
        available_copies: Math.max(0, issueBook.available_copies - 1)
      }).eq('id', issueBook.id)
    }
    setSavingBorrow(false)
    if (error) { flash(error.message, 'error'); return }
    setIssueBook(null); setBorrowerName(''); setDueDate('')
    flash('Book issued successfully.')
    loadAll()
  }

  async function returnBook(borrow: Borrow) {
    await supabase.from('library_borrows').update({
      is_returned: true,
      returned_at: new Date().toISOString(),
    }).eq('id', borrow.id)
    const book = books.find(b => b.id === borrow.book_id)
    if (book) {
      await supabase.from('library_books').update({
        available_copies: book.available_copies + 1
      }).eq('id', borrow.book_id)
    }
    flash('Book returned.')
    loadAll()
  }

  const activeBorrows   = borrows.filter(b => !b.is_returned)
  const returnedBorrows = borrows.filter(b => b.is_returned)
  const overdue         = activeBorrows.filter(b => new Date(b.due_date) < new Date())

  // Default due date = 14 days from today
  const defaultDue = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  return (
    <>
      <Topbar title="Library" meta={appUser.activeSchool?.name}
        actions={!isStudent && tab === 'catalog' && <Button variant="primary" size="sm" onClick={() => setShowForm(v => !v)}>+ Add Book</Button>}
      />

      <div className="p-8 space-y-6">
        {toast && <Alert type={toast.type === 'error' ? 'danger' : 'success'}>{toast.msg}</Alert>}

        {/* Stats — staff only */}
        {!isStudent && (
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Total Books',    value: books.reduce((s, b) => s + b.total_copies, 0), accent: 'amber' },
              { label: 'Available',      value: books.reduce((s, b) => s + b.available_copies, 0), accent: 'green' },
              { label: 'On Loan',        value: activeBorrows.length, accent: 'blue' },
              { label: 'Overdue',        value: overdue.length, accent: overdue.length > 0 ? 'red' : 'slate' },
            ].map(s => (
              <div key={s.label} className={cn('bg-white border border-gray-200 rounded-sm p-4 border-t-2',
                s.accent === 'amber' ? 'border-t-amber-500' :
                s.accent === 'green' ? 'border-t-green-600' :
                s.accent === 'blue'  ? 'border-t-blue-600' :
                s.accent === 'red'   ? 'border-t-red-500' : 'border-t-slate-400'
              )}>
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">{s.label}</div>
                <div className="text-[28px] font-bold text-navy-900 leading-none">{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tab bar — students only see catalog */}
        {!isStudent && (
          <div className="flex gap-1 border-b border-gray-200">
            {(['catalog', 'borrows'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={cn('px-4 py-2 text-sm font-semibold border-b-2 transition-colors',
                  tab === t ? 'border-navy-900 text-navy-900' : 'border-transparent text-gray-400 hover:text-navy-700')}>
                {t === 'catalog' ? 'Book Catalog' : `Loans (${activeBorrows.length} active)`}
              </button>
            ))}
          </div>
        )}

        {/* ── CATALOG TAB ── */}
        {tab === 'catalog' && (
          <div className="space-y-4">
            {showForm && (
              <Card className="p-5">
                <div className="text-sm font-bold text-navy-900 mb-4">Add Book</div>
                <Grid2>
                  <Field label="Title" required>
                    <Input placeholder="Book title" value={bookForm.title}
                      onChange={e => setBookForm(f => ({ ...f, title: e.target.value }))} />
                  </Field>
                  <Field label="Author">
                    <Input placeholder="Author name" value={bookForm.author}
                      onChange={e => setBookForm(f => ({ ...f, author: e.target.value }))} />
                  </Field>
                  <Field label="ISBN">
                    <Input placeholder="978-..." value={bookForm.isbn}
                      onChange={e => setBookForm(f => ({ ...f, isbn: e.target.value }))} />
                  </Field>
                  <Field label="Category">
                    <Select value={bookForm.category}
                      onChange={e => setBookForm(f => ({ ...f, category: e.target.value }))}
                      placeholder="Select category…"
                      options={CATEGORIES.map(c => ({ value: c, label: c }))} />
                  </Field>
                  <Field label="Number of Copies">
                    <Input type="number" min="1" value={bookForm.total_copies}
                      onChange={e => setBookForm(f => ({ ...f, total_copies: e.target.value }))} />
                  </Field>
                </Grid2>
                <div className="flex gap-2 mt-4">
                  <Button variant="primary" size="sm" onClick={addBook} disabled={savingBook || !bookForm.title}>
                    {savingBook ? 'Saving…' : 'Add Book'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
                </div>
              </Card>
            )}

            <Card>
              {loading ? (
                <div className="px-5 py-10 text-sm text-gray-400 text-center">Loading…</div>
              ) : books.length === 0 ? (
                <div className="px-5 py-10 text-sm text-gray-400 text-center">No books in catalog. Click "+ Add Book" to start.</div>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {['Title', 'Author', 'Category', 'Copies', 'Available', ...(!isStudent ? [''] : [])].map(h => (
                        <th key={h} className="px-5 py-2.5 text-left bg-gray-50 border-b border-gray-200 text-[10px] font-bold tracking-[0.08em] uppercase text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {books.map(b => (
                      <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50/40">
                        <td className="px-5 py-3">
                          <div className="text-sm font-semibold text-navy-900">{b.title}</div>
                          {b.isbn && <div className="text-xs text-gray-400 font-mono mt-0.5">{b.isbn}</div>}
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-600">{b.author ?? '—'}</td>
                        <td className="px-5 py-3">
                          {b.category && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-600 px-2 py-0.5 rounded-sm">{b.category}</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-sm text-center">{b.total_copies}</td>
                        <td className="px-5 py-3 text-center">
                          <span className={cn('text-sm font-bold', b.available_copies === 0 ? 'text-red-500' : 'text-green-600')}>
                            {b.available_copies}
                          </span>
                        </td>
                        {!isStudent && (
                          <td className="px-5 py-3 text-right">
                            <Button variant="secondary" size="sm"
                              disabled={b.available_copies === 0}
                              onClick={() => { setIssueBook(b); setDueDate(defaultDue) }}>
                              Issue
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        )}

        {/* ── BORROWS TAB — staff only ── */}
        {!isStudent && tab === 'borrows' && (
          <div className="space-y-4">
            {activeBorrows.length > 0 && (
              <Card>
                <CardHeader title="Active Loans" meta={`${activeBorrows.length} out · ${overdue.length} overdue`} />
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {['Book', 'Borrower', 'Issued', 'Due Date', 'Status', ''].map(h => (
                        <th key={h} className="px-5 py-2.5 text-left bg-gray-50 border-b border-gray-200 text-[10px] font-bold tracking-[0.08em] uppercase text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeBorrows.map(b => {
                      const isOverdue = new Date(b.due_date) < new Date()
                      return (
                        <tr key={b.id} className={cn('border-b border-gray-50', isOverdue ? 'bg-red-50/30' : 'hover:bg-gray-50/40')}>
                          <td className="px-5 py-3 text-sm font-semibold text-navy-900">{b.book?.title ?? '—'}</td>
                          <td className="px-5 py-3 text-sm text-gray-700">{b.borrower_name}</td>
                          <td className="px-5 py-3 text-xs text-gray-500">{fmtDate(b.borrowed_at)}</td>
                          <td className="px-5 py-3 text-xs font-semibold">
                            <span className={isOverdue ? 'text-red-600' : 'text-gray-700'}>{fmtDate(b.due_date)}</span>
                          </td>
                          <td className="px-5 py-3">
                            <span className={cn('text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-sm',
                              isOverdue ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600')}>
                              {isOverdue ? 'Overdue' : 'On Loan'}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <Button variant="secondary" size="sm" onClick={() => returnBook(b)}>Return</Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </Card>
            )}

            {returnedBorrows.length > 0 && (
              <Card>
                <CardHeader title="Returned" meta={`${returnedBorrows.length} total`} />
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {['Book', 'Borrower', 'Issued', 'Returned'].map(h => (
                        <th key={h} className="px-5 py-2.5 text-left bg-gray-50 border-b border-gray-200 text-[10px] font-bold tracking-[0.08em] uppercase text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {returnedBorrows.slice(0, 20).map(b => (
                      <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50/40 opacity-70">
                        <td className="px-5 py-3 text-sm text-navy-800">{b.book?.title}</td>
                        <td className="px-5 py-3 text-sm text-gray-600">{b.borrower_name}</td>
                        <td className="px-5 py-3 text-xs text-gray-400">{fmtDate(b.borrowed_at)}</td>
                        <td className="px-5 py-3 text-xs text-gray-400">{b.returned_at ? fmtDate(b.returned_at) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}

            {activeBorrows.length === 0 && returnedBorrows.length === 0 && (
              <Card className="py-12 text-center">
                <div className="text-sm text-gray-400">No loans yet. Issue a book from the catalog.</div>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Issue modal — staff only */}
      {!isStudent && issueBook && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <Card className="w-96 p-6 shadow-modal">
            <div className="text-sm font-bold text-navy-900 mb-1">Issue Book</div>
            <div className="text-xs text-gray-400 mb-4">{issueBook.title}</div>
            <div className="space-y-4">
              <Field label="Borrower Name" required>
                <Input autoFocus placeholder="Staff or student name" value={borrowerName}
                  onChange={e => setBorrowerName(e.target.value)} />
              </Field>
              <Field label="Due Date" required>
                <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              </Field>
            </div>
            <div className="flex gap-2 mt-5">
              <Button variant="primary" onClick={issueBorrow}
                disabled={savingBorrow || !borrowerName || !dueDate}>
                {savingBorrow ? 'Issuing…' : 'Issue Book'}
              </Button>
              <Button variant="ghost" onClick={() => setIssueBook(null)}>Cancel</Button>
            </div>
          </Card>
        </div>
      )}
    </>
  )
}
