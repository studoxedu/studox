import { cn } from '../../lib/utils'
import type { ReactNode } from 'react'

interface Column<T> {
  key: string
  header: string
  render?: (row: T) => ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
}

interface TableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyField: keyof T
  emptyMessage?: string
  className?: string
}

export function Table<T>({ columns, data, keyField, emptyMessage = 'No records found.', className }: TableProps<T>) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                className={cn(
                  'px-5 py-2.5 text-left bg-gray-50 border-b border-gray-200',
                  'text-[10px] font-bold tracking-[0.08em] uppercase text-gray-500',
                  col.align === 'right' && 'text-right',
                  col.align === 'center' && 'text-center',
                  col.className
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-5 py-10 text-center text-sm text-gray-400"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map(row => (
              <tr
                key={String(row[keyField])}
                className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors"
              >
                {columns.map(col => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-5 py-3 text-sm text-gray-600',
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center',
                      col.className
                    )}
                  >
                    {col.render
                      ? col.render(row)
                      : String((row as Record<string, unknown>)[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
